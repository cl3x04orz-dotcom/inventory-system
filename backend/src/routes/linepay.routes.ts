import { FastifyInstance } from 'fastify';
import { linePayService } from '../services/linepay.service.js';
import { GroupBuyService } from '../services/groupbuy.service.js';
import { prisma } from '../database/context.js';

import fs from 'fs';
import path from 'path';
import os from 'os';

// 記憶體交易對應檔（包含前端真實網域 clientHost 與 訂單 Payload）
const pendingTransactions = new Map<string, {
  amount: number;
  orderId: string;
  productName: string;
  clientHost: string;
  orderPayload?: any;
  token?: string;
  isExistingOrder?: boolean;
}>();

const PENDING_FILE = path.join(os.tmpdir(), 'pending_linepay.json');

function savePendingTransaction(orderId: string, data: any) {
  pendingTransactions.set(orderId, data);
  try {
    const dir = path.dirname(PENDING_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let fileData: Record<string, any> = {};
    if (fs.existsSync(PENDING_FILE)) {
      try {
        fileData = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
      } catch (_) {}
    }
    fileData[orderId] = data;
    fs.writeFileSync(PENDING_FILE, JSON.stringify(fileData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist pending transaction:', err);
  }
}

function getPendingTransaction(orderId: string) {
  let data = pendingTransactions.get(orderId);
  if (data) return data;
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
      if (fileData[orderId]) {
        const item = fileData[orderId];
        if (item && typeof item === 'object') {
          pendingTransactions.set(orderId, item);
          return item;
        }
      }
    }
  } catch (_) {}
  return undefined;
}

function deletePendingTransaction(orderId: string) {
  pendingTransactions.delete(orderId);
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
      delete fileData[orderId];
      fs.writeFileSync(PENDING_FILE, JSON.stringify(fileData, null, 2), 'utf-8');
    }
  } catch (_) {}
}

// 🛡️ 背景對帳輪詢：顧客去付款期間，後端每 3 秒向 LINE Pay 查詢授權狀態，確認後立即請款並寫入 DB
function startAutoConfirmPolling(
  orderId: string,
  transactionId: string,
  amount: number,
  isExistingOrder?: boolean,
  orderPayload?: any,
  token?: string
) {
  let attempts = 0;
  let alreadyConfirmed = false;
  const maxAttempts = 40; // 40 * 3s = 120s 等候窗口
  console.log(`[LINE Pay Poll] Started polling for order #${orderId}, txn=${transactionId}`);

  const interval = setInterval(async () => {
    if (alreadyConfirmed) { clearInterval(interval); return; }
    attempts++;

    try {
      const statusRes = await linePayService.checkPaymentStatus(String(transactionId));
      const info = Array.isArray(statusRes.info) ? statusRes.info[0] : statusRes.info;
      let payStatus = info?.status;

      // 🛡️ Production 環境下 /check API 可能不回傳 status，改用 /v3/payments 補查
      if (!payStatus && statusRes.returnCode === '0000') {
        try {
          const queryRes = await linePayService.queryPaymentByTransaction(String(transactionId));
          const qInfo = Array.isArray(queryRes.info) ? queryRes.info[0] : queryRes.info;
          payStatus = qInfo?.status;
          console.log(`[LINE Pay Poll] #${orderId} fallback query returnCode=${queryRes.returnCode} status=${payStatus} raw=${JSON.stringify(queryRes).slice(0, 200)}`);
        } catch (fallbackErr: any) {
          console.error(`[LINE Pay Poll] #${orderId} fallback query error:`, fallbackErr?.message);
        }
      }

      console.log(`[LINE Pay Poll] #${orderId} attempt=${attempts} returnCode=${statusRes.returnCode} status=${payStatus}`);

      // 只在顧客真正「已授權」或「已請款」才執行 confirm，避免提早 call
      // Sandbox 中授權完成會回傳 0110 + authentication is done 且無 info
      const shouldConfirm = payStatus === 'AUTHORIZATION' || 
                            payStatus === 'PAYMENT' ||
                            (statusRes.returnCode === '0110' && statusRes.returnMessage?.includes('authentication is done')) ||
                            statusRes.returnCode === '0123';

      if (shouldConfirm) {
        console.log(`[LINE Pay Poll] Order #${orderId} is ready, calling confirmPayment...`);
        alreadyConfirmed = true;
        clearInterval(interval);

        const confirmRes = await linePayService.confirmPayment({
          transactionId: String(transactionId),
          amount,
        });

        console.log(`[LINE Pay Poll] confirmPayment result for #${orderId}: ${confirmRes.returnCode}`);

        if (['0000', '1198', '1150', '1165'].includes(confirmRes.returnCode)) {
          const targetDbOrderId = orderId.split('-P')[0];

          if (isExistingOrder) {
            try {
              await prisma.groupBuyOrder.updateMany({
                where: { orderId: String(targetDbOrderId) },
                data: {
                  paymentMethod: 'LINE Pay',
                  paymentStatus: '已付款',
                  note: `【LINE Pay 線上補繳成功 - 交易單號: ${transactionId}】`
                }
              });
              console.log(`[LINE Pay Poll] ✅ Updated DB order #${targetDbOrderId} to 已付款 (existing)`);
            } catch (dbErr) {
              console.error('[LINE Pay Poll] DB update error (existing):', dbErr);
            }
          } else if (orderPayload) {
            try {
              const userContext = { token: token || '' };
              const createdRes = await GroupBuyService.v2_createOrder(orderPayload, userContext);
              const finalId = createdRes?.orderId || targetDbOrderId;
              await prisma.groupBuyOrder.updateMany({
                where: { orderId: String(finalId) },
                data: {
                  paymentStatus: '已付款',
                  note: `【LINE Pay 線上扣款成功 - 交易單號: ${transactionId}】`
                }
              });
              console.log(`[LINE Pay Poll] ✅ Created + updated DB order #${finalId} to 已付款 (new)`);
            } catch (dbErr) {
              console.error('[LINE Pay Poll] DB create/update error (new):', dbErr);
            }
          } else {
            // 備援：直接更新 DB 訂單狀態
            try {
              await prisma.groupBuyOrder.updateMany({
                where: { orderId: String(targetDbOrderId) },
                data: {
                  paymentStatus: '已付款',
                  note: `【LINE Pay 線上扣款成功 - 交易單號: ${transactionId}】`
                }
              });
              console.log(`[LINE Pay Poll] ✅ Fallback updated DB order #${targetDbOrderId} to 已付款`);
            } catch (_) {}
          }
        } else {
          console.warn(`[LINE Pay Poll] confirmPayment failed for #${orderId}: ${confirmRes.returnCode} ${confirmRes.returnMessage}`);
        }
      }
    } catch (err) {
      console.error(`[LINE Pay Poll] Error polling #${orderId} attempt=${attempts}:`, err);
    }

    if (attempts >= maxAttempts) {
      console.warn(`[LINE Pay Poll] Max attempts reached for order #${orderId}, stopping.`);
      clearInterval(interval);
    }
  }, 3000);
}

export async function linePayRoutes(app: FastifyInstance) {
  // 1. 測試體驗介面 (HTML Page - 含扣款與退款測試)
  // 暫時端點：查詢本伺服器對外 IP（用來設定 LINE Pay IP 白名單後刪除）
  app.get('/api/server-ip', async (req, reply) => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return reply.send({ serverIp: data.ip, message: '請將此 IP 填入 LINE Pay 商家後台的 IP 白名單' });
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  app.get('/api/linepay/test', async (req, reply) => {
    reply.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>米立微 - LINE Pay 串接與退款測試中心</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 2rem 1rem; box-sizing: border-box; }
          .container { display: flex; flex-direction: column; gap: 1.5rem; width: 100%; max-width: 440px; }
          .card { background: #1e293b; padding: 1.75rem; border-radius: 1rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); border: 1px solid #334155; text-align: center; }
          h2 { color: #06C755; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 1.3rem; }
          h3 { color: #38bdf8; margin-top: 0; font-size: 1.1rem; text-align: left; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }
          p { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1.25rem; }
          .form-group { margin-bottom: 1rem; text-align: left; }
          label { display: block; font-size: 0.8rem; color: #cbd5e1; margin-bottom: 0.4rem; }
          input { width: 100%; padding: 0.65rem; border-radius: 0.5rem; border: 1px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box; font-size: 0.95rem; }
          button { width: 100%; padding: 0.75rem; background: #06C755; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.95rem; font-weight: bold; cursor: pointer; transition: all 0.2s; }
          button.refund-btn { background: #ef4444; }
          button.refund-btn:hover { background: #dc2626; }
          button:hover { opacity: 0.9; transform: translateY(-1px); }
          .badge { background: rgba(6, 199, 85, 0.15); color: #06C755; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; }
          .status { margin-top: 0.75rem; font-size: 0.85rem; color: #fbbf24; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- 扣款測試區塊 -->
          <div class="card">
            <h2><span class="badge">SANDBOX</span> LINE Pay 扣款測試</h2>
            <p>商家：米立微有限公司 | 通路 ID：${process.env.LINE_PAY_CHANNEL_ID || ''}</p>
            <div class="form-group">
              <label>商品名稱</label>
              <input type="text" id="productName" value="米立微測試商品" />
            </div>
            <div class="form-group">
              <label>金額 (TWD)</label>
              <input type="number" id="amount" value="20" min="1" />
            </div>
            <button id="payBtn" onclick="startPay()">發起 LINE Pay 測試扣款</button>
            <div id="payStatus" class="status"></div>
          </div>

          <!-- 退款測試區塊 -->
          <div class="card">
            <h3>💸 LINE Pay 退款測試 (Refund)</h3>
            <div class="form-group">
              <label>交易單號 (Transaction ID)</label>
              <input type="text" id="refundTransactionId" placeholder="貼上剛剛扣款成功的交易單號" />
            </div>
            <div class="form-group">
              <label>退款金額 (留空代表全額退款)</label>
              <input type="number" id="refundAmount" placeholder="例如: 20" />
            </div>
            <button class="refund-btn" id="refundBtn" onclick="startRefund()">執行 LINE Pay 刷退</button>
            <div id="refundStatus" class="status"></div>
          </div>
        </div>

        <script>
          async function startPay() {
            const btn = document.getElementById('payBtn');
            const status = document.getElementById('payStatus');
            btn.disabled = true;
            btn.innerText = '連線至 LINE Pay...';
            status.innerText = '';

            const productName = document.getElementById('productName').value;
            const amount = parseInt(document.getElementById('amount').value, 10);
            const orderId = 'ORD-' + Date.now();

            try {
              const res = await fetch('/api/linepay/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId,
                  amount,
                  productName,
                  clientHost: window.location.origin
                })
              });
              const data = await res.json();
              if (data.success && data.paymentUrl) {
                status.innerText = '引導至 LINE Pay 付款頁面...';
                window.location.href = data.paymentUrl;
              } else {
                status.innerText = '失敗: ' + (data.message || JSON.stringify(data));
                btn.disabled = false;
                btn.innerText = '重新測試';
              }
            } catch (err) {
              status.innerText = '錯誤: ' + err.message;
              btn.disabled = false;
              btn.innerText = '重新測試';
            }
          }

          async function startRefund() {
            const transactionId = document.getElementById('refundTransactionId').value.trim();
            const refundAmountVal = document.getElementById('refundAmount').value.trim();
            const status = document.getElementById('refundStatus');
            const btn = document.getElementById('refundBtn');

            if (!transactionId) {
              alert('請輸入交易單號 (Transaction ID)');
              return;
            }

            btn.disabled = true;
            btn.innerText = '向 LINE Pay 發起退款中...';
            status.innerText = '';

            try {
              const payload = { transactionId };
              if (refundAmountVal) {
                payload.refundAmount = parseInt(refundAmountVal, 10);
              }

              const res = await fetch('/api/linepay/refund', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const data = await res.json();

              if (data.success) {
                status.style.color = '#34d399';
                status.innerText = '✓ 退款成功！退款時間：' + (data.info?.regKey || '已即時退回');
              } else {
                status.style.color = '#f87171';
                status.innerText = '退款失敗 (' + data.returnCode + '): ' + data.message;
              }
            } catch (err) {
              status.style.color = '#f87171';
              status.innerText = '連線失敗: ' + err.message;
            } finally {
              btn.disabled = false;
              btn.innerText = '執行 LINE Pay 刷退';
            }
          }
        </script>
      </body>
      </html>
    `);
  });

  // 2. 發起付款 API (Request Payment)
  app.post('/api/linepay/request', async (req, reply) => {
    const {
      orderId = `ORD-${Date.now()}`,
      amount = 10,
      productName = '米立微測試商品',
      clientHost,
      orderPayload,
      token,
      isLiff
    } = (req.body as any) || {};

    // 🛡️ 1. 計算 Fastify 後端服務的 URL (LINE Pay callback redirect 目的地)
    let backendHost = process.env.BACKEND_URL || '';
    if (!backendHost) {
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || 'https'; // 🛡️ 強制 HTTPS，防止 Safari/LINE App 安全阻擋
      backendHost = `${protocol}://${host}`;
    }
    // 🛡️ 致命防呆：嚴格清除網址頭尾的空白與任何潛藏的換行符號 (\n 或 \r)
    backendHost = backendHost.replace(/\/$/, '').trim().replace(/\\r?\\n|\\r/g, '');

    // 🛡️ 2. 計算前端 App 的 URL (付款完畢後跳轉目的地)
    let frontendHost = clientHost || '';
    if (!frontendHost && req.headers.referer) {
      try {
        const u = new URL(req.headers.referer);
        frontendHost = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`;
      } catch (_) { }
    }
    if (!frontendHost) {
      frontendHost = backendHost.includes(':3000') ? backendHost.replace(':3000', ':5173') : backendHost;
    }
    frontendHost = frontendHost.replace(/\/$/, '');

    const isExistingOrder = Boolean((req.body as any)?.isExistingOrder);
    // 🛡️ 防護：為防止 LINE Pay 報 Error 1106 (Duplicated orderId)，產生獨一無二的 linePayOrderId 發給 LINE Pay API
    const linePayOrderId = isExistingOrder ? `${orderId}-P${Date.now().toString().slice(-6)}` : orderId;

    // 🛡️ confirmUrl 與 cancelUrl 必須為「後端」API 網址，才能讓 Fastify 接收 callback 並執行自動扣款確認！
    const confirmUrl = `${backendHost}/api/linepay/confirm?orderId=${linePayOrderId}`;
    const cancelUrl = `${backendHost}/api/linepay/cancel?orderId=${linePayOrderId}`;

    try {
      const result = await linePayService.requestPayment({
        orderId: linePayOrderId,
        amount: Number(amount),
        productName,
        confirmUrl,
        cancelUrl,
      });

      if (result.returnCode === '0000' && result.info?.paymentUrl?.web) {
        const transactionId = result.info.transactionId;

        // 持久化暫存訂單資訊，將原始 DB orderId 與 linePayOrderId 進行映射
        savePendingTransaction(linePayOrderId, {
          amount: Number(amount),
          orderId, // 原始 DB 訂單號
          linePayOrderId,
          productName,
          clientHost: frontendHost,
          orderPayload,
          token,
          isExistingOrder,
          isLiff
        });

        if (orderId) {
          try {
            const currentOrder = await prisma.groupBuyOrder.findFirst({ where: { orderId } });
            const existingNote = currentOrder?.note || '';
            if (!existingNote.includes(`交易單號: ${transactionId}`)) {
              const newNote = existingNote ? `${existingNote}\n【交易單號: ${transactionId}】` : `【交易單號: ${transactionId}】`;
              await prisma.groupBuyOrder.updateMany({
                where: { orderId },
                data: { note: newNote }
              });
            }
          } catch (e) {
            console.error('Failed to append transactionId to note', e);
          }
        }

        // 🛡️ [已關閉] 根據專家建議，關閉背景高頻對帳輪詢，避免踩爆 LINE Pay 風控引擎的防禦機制
        // 這會讓流程完全回歸標準的被動回調 (Safari 導回 confirmUrl -> 使用者手動點擊確認 -> 扣款並寫入 DB)
        /*
        startAutoConfirmPolling(
          linePayOrderId,
          String(transactionId),
          Number(amount),
          isExistingOrder,
          orderPayload,
          token
        );
        */

        return reply.send({
          success: true,
          returnCode: result.returnCode,
          transactionId,
          paymentUrl: result.info.paymentUrl.web,
          paymentUrlApp: result.info.paymentUrl.app,
          paymentUrlUniversal: (result.info.paymentUrl as any).universal || null,
        });
      }

      return reply.status(400).send({
        success: false,
        returnCode: result.returnCode,
        message: result.returnMessage || '發起 LINE Pay 付款失敗',
        details: result,
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err.message,
      });
    }
  });

  // ============================================================================
  // 5. [GET] /api/linepay/redirect (大麥餐飲 302 轉址魔法)
  // 用途：前端將拿到的 LINE Pay URL 傳給這個 API，由後端進行 302 Redirect。
  // 這樣能把瀏覽器的 Referer 洗成後端的網域，成功騙過 LINE Pay 的 LIFF 巢狀限制！
  // ============================================================================
  app.get('/api/linepay/redirect', async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) {
      return reply.status(400).send('Missing url parameter');
    }
    // 執行 302 跳轉
    return reply.redirect(url);
  });

  // 3. 扣款確認 Callback API (第一階段：僅顯示按鈕，避免自動扣款 Race Condition)
  app.get('/api/linepay/confirm', async (req, reply) => {
    const { transactionId, orderId } = (req.query as any) || {};

    if (!transactionId || !orderId) {
      return reply.type('text/html').send('<h3>缺少 transactionId 或 orderId</h3>');
    }

    const executeConfirmUrl = `/api/linepay/execute-confirm?transactionId=${transactionId}&orderId=${orderId}`;

    return reply.redirect(executeConfirmUrl);
  });

  // 第二階段：真實的 Confirm API (由使用者手動點擊觸發)
  app.get('/api/linepay/execute-confirm', async (req, reply) => {
    const { transactionId, orderId } = (req.query as any) || {};

    if (!transactionId || !orderId) {
      return reply.type('text/html').send('<h3>缺少 transactionId 或 orderId</h3>');
    }

    const pending = getPendingTransaction(orderId);
    let amount = pending?.amount;
    const targetDbOrderIdForAmount = (pending && pending.orderId) ? pending.orderId : orderId.split('-P')[0];

    if (!amount) {
      const queryAmount = (req.query as any).amount ? Number((req.query as any).amount) : undefined;
      if (queryAmount) {
        amount = queryAmount;
      } else {
        try {
          const dbOrder = await prisma.groupBuyOrder.findFirst({ where: { orderId: String(targetDbOrderIdForAmount) } });
          if (dbOrder) {
            amount = Number(dbOrder.totalAmount);
          } else {
            return reply.status(400).send({ success: false, message: '記憶體遺失且查無對應資料庫訂單，無法取得請款金額' });
          }
        } catch (e) {
          console.error('Failed to query db for amount fallback:', e);
          return reply.status(500).send({ success: false, message: '資料庫連線異常，無法取得請款金額' });
        }
      }
    }

    let targetClientHost = pending?.clientHost || '';
    if (!targetClientHost && req.headers.referer) {
      try {
        const u = new URL(req.headers.referer);
        targetClientHost = `${u.protocol}//${u.host}`;
      } catch (_) { }
    }
    if (!targetClientHost) {
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      targetClientHost = `${protocol}://${host}`;
    }
    if (targetClientHost.includes(':3000')) {
      targetClientHost = targetClientHost.replace(':3000', ':5173');
    }

    try {
      const result = await linePayService.confirmPayment({
        transactionId: String(transactionId),
        amount,
      });

      if (['0000', '1198', '1150', '1165'].includes(result.returnCode)) {
        const targetDbOrderId = (pending && pending.orderId) ? pending.orderId : orderId.split('-P')[0];
        let finalCreatedOrderId = targetDbOrderId;

        if (pending?.isExistingOrder) {
          // 🛡️ 既有訂單補繳：更新狀態為已付款
          try {
            await prisma.groupBuyOrder.updateMany({
              where: { orderId: String(targetDbOrderId) },
              data: {
                paymentMethod: 'LINE Pay',
                paymentStatus: '已付款',
                note: `【LINE Pay 線上補繳成功 - 交易單號: ${transactionId}】`
              }
            });
            console.log(`[LINE Pay Confirm Route] Successfully updated DB order #${targetDbOrderId} to 已付款`);
          } catch (dbErr) {
            console.error('Failed to update existing groupBuyOrder in DB:', dbErr);
          }
        } else if (pending?.orderPayload) {
          // 🛡️ 新訂單扣款成功！正式將訂單寫入 PostgreSQL 資料庫！
          try {
            const userContext = { token: pending.token || '' };
            const createdRes = await GroupBuyService.v2_createOrder(pending.orderPayload, userContext);
            if (createdRes && createdRes.orderId) {
              finalCreatedOrderId = createdRes.orderId;
            }

            // 更新備註與交易單號
            await prisma.groupBuyOrder.updateMany({
              where: { orderId: String(finalCreatedOrderId) },
              data: {
                paymentStatus: '已付款',
                note: `【LINE Pay 線上扣款成功 - 交易單號: ${transactionId}】`
              }
            });
            console.log(`[LINE Pay Confirm Route] Successfully created and updated DB order #${finalCreatedOrderId} to 已付款`);
          } catch (dbErr) {
            console.error('Failed to create order or update paymentStatus in DB:', dbErr);
          }
        } else {
          // 🛡️ 備援：若 pending 已經丟失但此時為扣款確認，嘗試直接將 DB 該訂單設為已付款
          try {
            await prisma.groupBuyOrder.updateMany({
              where: { orderId: String(targetDbOrderId) },
              data: {
                paymentStatus: '已付款',
                note: `【LINE Pay 線上扣款成功 - 交易單號: ${transactionId}】`
              }
            });
          } catch (_) {}
        }

        const isExistingOrder = Boolean(pending?.isExistingOrder);
        const rawProdName = pending?.productName || '';
        const cleanRemark = rawProdName.includes('(') ? rawProdName.split('(')[1].replace(')', '').trim() : '';

        const isLiff = Boolean(pending?.isLiff);

        // 導回前端 URL
        let baseRedirect = targetClientHost.replace(/\/$/, '');
        if (!baseRedirect.includes('/inventory-system') && !baseRedirect.includes('localhost') && !baseRedirect.includes('127.0.0.1')) {
          baseRedirect += '/inventory-system';
        }

        // 🚨 方案 B：業界標準大絕招
        // 如果最初是從 LIFF 發起付款的，我們必須把它導向 liff.line.me 的專屬短網址
        // 這樣 iOS 才會觸發 Universal Link，把使用者從 Safari 硬生生拉回 LINE App 內！
        const liffBaseUrl = 'https://liff.line.me/2010308873-ur2zL2cc';
        const targetBase = isLiff ? liffBaseUrl : `${baseRedirect}/#`;

        const redirectUrl = isExistingOrder
          ? `${targetBase}/?replenishmentSuccess=true&orderId=${targetDbOrderId}&amount=${amount}&transactionId=${transactionId}&remark=${encodeURIComponent(cleanRemark)}`
          : `${targetBase}/?orderSuccess=true&orderId=${finalCreatedOrderId}&transactionId=${transactionId}&amount=${amount}`;

        deletePendingTransaction(orderId);

        return reply.redirect(redirectUrl);
      }

      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head><meta charset="UTF-8"><title>交易失敗</title></head>
        <body style="background:#0f172a;color:#fff;text-align:center;padding-top:4rem;font-family:sans-serif;">
          <h2>LINE Pay 扣款失敗</h2>
          <p>錯誤碼：${result.returnCode}</p>
          <p>原因：${result.returnMessage}</p>
          <a href="${targetClientHost}/inventory-system/" style="color:#38bdf8;">返回商城</a>
        </body>
        </html>
      `);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 4. 退款 API (Refund Payment)
  app.post('/api/linepay/refund', async (req, reply) => {
    const { orderId, transactionId, refundAmount, refundReason } = (req.body as any) || {};

    let targetTxId = transactionId ? String(transactionId).trim() : '';
    const targetOrderId = orderId ? String(orderId).trim() : '';

    // 🛡️ 若無直接提供交易號碼，向 DB 搜尋該單號對應之交易單號
    if (!targetTxId && targetOrderId) {
      try {
        const dbOrder = await prisma.groupBuyOrder.findFirst({
          where: { orderId: targetOrderId }
        });
        if (dbOrder && dbOrder.note && dbOrder.note.includes('交易單號: ')) {
          const match = dbOrder.note.match(/交易單號:\s*(\d+)/);
          if (match) targetTxId = match[1];
        }
      } catch (_) { }
    }

    if (!targetTxId) {
      return reply.status(400).send({ success: false, message: '缺少交易單號 transactionId (請提供 transactionId 或 orderId)' });
    }

    try {
      const numRefundAmount = refundAmount ? Number(refundAmount) : undefined;
      const result = await linePayService.refundPayment({
        transactionId: targetTxId,
        refundAmount: numRefundAmount,
      });

      if (result.returnCode === '0000') {
        let newRefundStatus = '已退款';
        if (targetOrderId) {
          try {
            const dbOrder = await prisma.groupBuyOrder.findFirst({
              where: { orderId: targetOrderId }
            });
            if (dbOrder) {
              const currentTotal = Number(dbOrder.totalAmount || 0);
              
              // 1. 解析過往所有退款紀錄並累加歷史退款金額
              let previousTotalRefunded = 0;
              if (dbOrder.note) {
                const refundMatches = dbOrder.note.matchAll(/\[LINE Pay 退款紀錄.*?\] 金額: \$(\d+(\.\d+)?) 元/g);
                for (const match of refundMatches) {
                  previousTotalRefunded += Number(match[1]);
                }
              }

              // 2. 決定本次退款的具體金額
              const requestedAmt = numRefundAmount !== undefined ? numRefundAmount : currentTotal;
              
              // 3. 算出至今總退款額度
              const newTotalRefunded = previousTotalRefunded + requestedAmt;

              // 4. 判斷是否達全額退款標準
              const isFull = numRefundAmount === undefined || newTotalRefunded >= currentTotal;
              newRefundStatus = isFull ? '已全額退款' : `已部分退款 ($${newTotalRefunded})`;
              
              const timeStr = new Date().toLocaleString("zh-TW", { hour12: false });
              const appendNote = `\n[LINE Pay 退款紀錄 ${timeStr}] 金額: $${requestedAmt} 元 | 原因: ${refundReason || '無備註'}`;
              
              await prisma.groupBuyOrder.updateMany({
                where: { orderId: targetOrderId },
                data: {
                  paymentStatus: newRefundStatus,
                  note: (dbOrder.note || '') + appendNote
                }
              });
            }
          } catch (dbErr) {
            console.error('Failed to update refund status in DB:', dbErr);
          }
        }

        return reply.send({
          success: true,
          returnCode: result.returnCode,
          message: '退款成功',
          paymentStatus: newRefundStatus,
          info: result.info,
        });
      }

      return reply.status(400).send({
        success: false,
        returnCode: result.returnCode,
        message: result.returnMessage || '退款失敗',
        details: result,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 5. 取消付款 Callback (Cancel Payment)
  app.get('/api/linepay/cancel', async (req, reply) => {
    const { orderId } = (req.query as any) || {};
    const pending = orderId ? getPendingTransaction(orderId) : null;
    if (orderId) deletePendingTransaction(orderId);
    const targetClientHost = pending?.clientHost || 'http://localhost:5173';
    return reply.redirect(`${targetClientHost}/inventory-system/#/?paymentCancelled=true`);
  });

  // 6. 主動與 LINE Pay 官方同步對帳 API (Sync Payment Status)
  app.post('/api/linepay/sync-status', async (req, reply) => {
    let { orderId, transactionId } = req.body as any;
    if (!orderId) {
      return reply.status(400).send({ success: false, message: '缺少 orderId' });
    }

    try {
      const dbOrder = await prisma.groupBuyOrder.findFirst({
        where: { orderId: String(orderId) }
      });
      if (!dbOrder) {
        return reply.status(404).send({ success: false, message: '找不到訂單紀錄' });
      }

      if (!transactionId && dbOrder.note) {
        const match = dbOrder.note.match(/交易單號:\s*(\d{15,20})/);
        if (match) transactionId = match[1];
      }

      if (!transactionId) {
        return reply.status(400).send({ success: false, requireManualInput: true, message: '無法自動取得交易序號，需手動輸入' });
      }

      // 若訂單本身已經是已付款/已退款，則不須進行操作
      if (dbOrder.paymentStatus && ['已付款', '已入帳', '已全額退款'].includes(dbOrder.paymentStatus)) {
        return reply.send({ success: true, message: '訂單狀態已為完成或退款，無須同步' });
      }

      // 呼叫 LINE Pay 官方 Check Payment Status API
      const result = await linePayService.checkPaymentStatus(String(transactionId));
      if (!['0000', '0110', '0123'].includes(result.returnCode)) {
        let msg = `LINE Pay 查無扣款紀錄 (狀態碼 ${result.returnCode}: ${result.returnMessage || '未完成付款'})`;
        if (result.returnCode === '0122') {
          msg = `LINE Pay 扣款失敗/未付款 (狀態碼 0122：顧客開啟付款頁面後未完成驗證授權，交易已失效)`;
        } else if (result.returnCode === '1105' || result.returnCode === '1104') {
          msg = `LINE Pay 查無此交易序號 (狀態碼 ${result.returnCode})`;
        }
        return reply.status(400).send({ success: false, message: msg, details: result });
      }

      // 處理 Sandbox 中 0110 (已授權) 與 0123 (已完成) 但不帶 info 的特殊情況
      let updatedStatus = false;
      let finalTransactionId = transactionId;
      let info: any = null;

      if (result.returnCode === '0123') {
        // 已經是完成狀態
        updatedStatus = true;
      } else if (result.returnCode === '0110' && result.returnMessage?.includes('authentication is done')) {
        // 客人已授權但掉單，我們主動幫他補請款 (Confirm)
        const confirmResult = await linePayService.confirmPayment({
          transactionId: String(finalTransactionId),
          amount: Number(dbOrder.totalAmount)
        });
        if (confirmResult.returnCode === '0000' || confirmResult.returnCode === '1198') {
          updatedStatus = true;
        } else {
          return reply.status(400).send({ success: false, message: '補請款失敗', details: confirmResult });
        }
      } else {
        // 正常從 info 陣列中找出最新一筆交易紀錄
        info = Array.isArray(result.info) ? result.info[0] : result.info;
        if (!info || !info.transactionId) {
          return reply.status(400).send({ success: false, message: '找不到有效的交易資料', details: result });
        }

        // 判斷交易狀態 (AUTHORIZATION 為已授權未請款, PAYMENT 為已請款完成)
        const payInfo = info.payInfo && info.payInfo[0];
        const amount = payInfo ? payInfo.amount : Number(dbOrder.totalAmount);
        finalTransactionId = info.transactionId;

        if (info.status === 'AUTHORIZATION') {
          // 客人已授權但掉單，我們主動幫他補請款 (Confirm)
          const confirmResult = await linePayService.confirmPayment({
            transactionId: String(finalTransactionId),
            amount
          });
          if (confirmResult.returnCode === '0000' || confirmResult.returnCode === '1198') {
            updatedStatus = true;
          } else {
            return reply.status(400).send({ success: false, message: '補請款失敗', details: confirmResult });
          }
        } else if (info.status === 'PAYMENT') {
          // 已經請款完成了，只是我們 DB 沒更新到
          updatedStatus = true;
        }
      }

      if (updatedStatus) {
        await prisma.groupBuyOrder.updateMany({
          where: { orderId: String(orderId) },
          data: {
            paymentStatus: '已付款',
            note: `【LINE Pay 手動對帳補繳成功 - 交易單號: ${finalTransactionId}】\n` + (dbOrder.note || '')
          }
        });
        return reply.send({ success: true, message: '對帳成功，訂單已更新為「已付款」' });
      } else {
        return reply.send({ success: false, message: `目前 LINE Pay 狀態為: ${info.status}，未達請款條件` });
      }

    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 7. 輪詢檢查訂單付款狀態 API (Check Order Payment Status & Details)
  app.get('/api/linepay/check-status', async (req, reply) => {
    const { orderId } = (req.query as any) || {};
    if (!orderId) return reply.send({ success: false, isPaid: false });

    try {
      const order = await prisma.groupBuyOrder.findFirst({
        where: { orderId: String(orderId) },
        select: {
          orderId: true,
          paymentStatus: true,
          paymentMethod: true,
          totalAmount: true,
          shippingFee: true,
          rewardDiscountAmount: true,
          createdAt: true,
          details: true,
          recipients: {
            include: { items: true }
          }
        }
      });

      if (order) {
        const isPaid = order.paymentStatus === '已付款' || order.paymentStatus === '已入帳';
        return reply.send({
          success: true,
          isPaid,
          paymentStatus: order.paymentStatus,
          order: {
            orderId: order.orderId,
            totalAmount: Number(order.totalAmount),
            shippingFee: Number(order.shippingFee || 0),
            rewardDiscountAmount: Number(order.rewardDiscountAmount || 0),
            createdAt: order.createdAt?.toISOString(),
            details: (order.details || []).map((d: any) => {
              let cleanName = d.productName || '';
              let remark = d.remark || '';
              if (!remark && cleanName.includes('【口味備註：')) {
                const m = cleanName.match(/【口味備註：.*?】/);
                if (m) remark = m[0];
              }
              cleanName = cleanName.replace(/\s*\(?\s*【口味備註：.*?】\s*\)?/g, '').trim();
              if (remark) {
                const suffix = ` (${remark})`;
                if (cleanName.endsWith(suffix)) {
                  cleanName = cleanName.slice(0, -suffix.length).trim();
                } else if (cleanName.includes(`(${remark})`)) {
                  cleanName = cleanName.replace(`(${remark})`, '').trim();
                }
              }
              return {
                productId: d.productId,
                productName: cleanName,
                rawProductName: d.productName,
                qty: Number(d.qty),
                unitPrice: Number(d.unitPrice),
                subtotal: Number(d.subtotal),
                remark: remark,
                expiryDate: d.expiryDate || ''
              };
            }),
            recipients: (order.recipients || []).map((r: any) => ({
              recipientName: r.recipientName,
              items: (r.items || []).map((i: any) => {
                let cleanName = i.productName || '';
                let remark = i.remark || '';
                if (!remark && cleanName.includes('【口味備註：')) {
                  const m = cleanName.match(/【口味備註：.*?】/);
                  if (m) remark = m[0];
                }
                cleanName = cleanName.replace(/\s*\(?\s*【口味備註：.*?】\s*\)?/g, '').trim();
                if (remark) {
                  const suffix = ` (${remark})`;
                  if (cleanName.endsWith(suffix)) {
                    cleanName = cleanName.slice(0, -suffix.length).trim();
                  } else if (cleanName.includes(`(${remark})`)) {
                    cleanName = cleanName.replace(`(${remark})`, '').trim();
                  }
                }
                return {
                  productId: i.productId,
                  productName: cleanName,
                  rawProductName: i.productName,
                  qty: Number(i.qty),
                  price: Number(i.price),
                  subtotal: i.subtotal !== null && i.subtotal !== undefined ? Number(i.subtotal) : (Number(i.price) * Number(i.qty)),
                  remark: remark,
                  expiryDate: i.expiryDate || ''
                };
              })
            }))
          }
        });
      }

      return reply.send({ success: true, isPaid: false });
    } catch (err: any) {
      return reply.send({ success: false, isPaid: false, error: err.message });
    }
  });

  // 取得 LINE Pay 異常訂單數量 (供前端 Badge 顯示)
  app.get('/api/linepay/abnormal-count', async (req, reply) => {
    try {
      const count = await prisma.groupBuyOrder.count({
        where: {
          paymentMethod: 'LINE Pay',
          paymentStatus: '未付款',
          status: 'PENDING'
        }
      });
      return reply.send({ success: true, count });
    } catch (err: any) {
      return reply.status(500).send({ success: false, count: 0, error: err.message });
    }
  });

  // 8. 逾期未付款自動作廢 (Cancel Expired Unpaid LINE Pay Orders)
  app.post('/api/linepay/cancel-expired', async (req, reply) => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const expiredOrders = await prisma.groupBuyOrder.findMany({
        where: {
          paymentMethod: 'LINE Pay',
          paymentStatus: '未付款',
          status: 'PENDING',
          createdAt: {
            lt: twentyFourHoursAgo
          }
        },
        select: { orderId: true, note: true }
      });

      if (expiredOrders.length === 0) {
        return reply.send({ success: true, message: '目前沒有逾期的 LINE Pay 未付款訂單', count: 0 });
      }

      let canceledCount = 0;
      for (const order of expiredOrders) {
        try {
          await prisma.groupBuyOrder.update({
            where: { orderId: order.orderId },
            data: {
              status: 'CANCELLED',
              paymentStatus: '已作廢',
              note: (order.note || '') + '\n【系統/手動作廢：超過24小時未完成 LINE Pay 授權】'
            }
          });
          canceledCount++;
        } catch (err) {
          console.error(`Failed to cancel expired order ${order.orderId}:`, err);
        }
      }

      return reply.send({ success: true, message: `成功作廢了 ${canceledCount} 筆逾期訂單`, count: canceledCount });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 啟動背景定時排程 (若環境變數 ENABLE_AUTO_CANCEL_UNPAID=true 則啟用，每小時執行一次)
  if (process.env.ENABLE_AUTO_CANCEL_UNPAID === 'true') {
    console.log('[LINE Pay Cron] Auto cancel unpaid orders is ENABLED. Running every 1 hour.');
    setInterval(async () => {
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const expiredOrders = await prisma.groupBuyOrder.findMany({
          where: {
            paymentMethod: 'LINE Pay',
            paymentStatus: '未付款',
            status: 'PENDING',
            createdAt: { lt: twentyFourHoursAgo }
          },
          select: { orderId: true, note: true }
        });

        for (const order of expiredOrders) {
          await prisma.groupBuyOrder.update({
            where: { orderId: order.orderId },
            data: {
              status: 'CANCELLED',
              paymentStatus: '已作廢',
              note: (order.note || '') + '\n【系統自動作廢：超過24小時未完成 LINE Pay 授權】'
            }
          });
          console.log(`[LINE Pay Cron] Auto canceled expired order #${order.orderId}`);
        }
      } catch (err) {
        console.error('[LINE Pay Cron] Failed to run auto cancel job:', err);
      }
    }, 60 * 60 * 1000); // 1小時
  }
}
