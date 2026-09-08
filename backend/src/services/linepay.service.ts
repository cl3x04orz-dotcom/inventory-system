import crypto from 'crypto';

interface LinePayConfig {
  channelId: string;
  channelSecret: string;
  env: 'sandbox' | 'production';
}

export class LinePayService {
  private get config(): LinePayConfig {
    return {
      channelId: (process.env.LINE_PAY_CHANNEL_ID || '').trim(),
      channelSecret: (process.env.LINE_PAY_CHANNEL_SECRET || '').trim(),
      env: (process.env.LINE_PAY_ENV as 'sandbox' | 'production') || 'production',
    };
  }

  private get baseUrl(): string {
    return this.config.env === 'production'
      ? 'https://api-pay.line.me'
      : 'https://sandbox-api-pay.line.me';
  }

  /**
   * 產生 LINE Pay v3 HMAC-SHA256 簽章 Header
   */
  private createHeaders(uri: string, body?: any, queryParams: string = '') {
    const nonce = crypto.randomUUID();
    let bodyString = '';
    if (body !== undefined && body !== null) {
      bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    } else if (queryParams) {
      bodyString = queryParams;
    }

    const rawData = `${this.config.channelSecret}${uri}${bodyString}${nonce}`;

    const signature = crypto
      .createHmac('sha256', this.config.channelSecret)
      .update(rawData)
      .digest('base64');

    return {
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': this.config.channelId,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': signature,
    };
  }

  /**
   * 發起付款請求 (Request Payment)
   */
  async requestPayment(params: {
    orderId: string;
    amount: number;
    productName: string;
    confirmUrl: string;
    cancelUrl: string;
  }) {
    const uri = '/v3/payments/request';
    const safeAmount = Math.floor(Number(params.amount));
    // 🛡️ 嚴格消毒：移除換行、特殊符號、長度限制，避免 LINE App 渲染崩潰
    const cleanProductName = String(params.productName)
      .replace(/[\\r\\n]/g, ' ')
      .replace(/[<>&"']/g, '')
      .substring(0, 100) || '商城訂單';

    const payload = {
      amount: safeAmount,
      currency: 'TWD',
      orderId: params.orderId,
      packages: [
        {
          id: `pkg_${params.orderId}`.substring(0, 50),
          amount: safeAmount,
          name: '米立微商城',
          products: [
            {
              name: cleanProductName,
              quantity: 1,
              price: safeAmount,
            },
          ],
        },
      ],
      redirectUrls: {
        confirmUrl: params.confirmUrl,
        cancelUrl: params.cancelUrl,
      }
    };

    console.log('🚀 [LINE Pay Request Payload]:', JSON.stringify(payload, null, 2));



    const headers = this.createHeaders(uri, payload);
    const res = await fetch(`${this.baseUrl}${uri}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    const safeText = text.replace(/"([^"]*Id)"\s*:\s*(\d{15,})/g, '"$1":"$2"');
    const data = JSON.parse(safeText);
    return data;
  }

  /**
   * 確認付款 (Confirm Payment)
   */
  async confirmPayment(params: { transactionId: string; amount: number }) {
    const uri = `/v3/payments/${params.transactionId}/confirm`;
    const payload = {
      amount: params.amount,
      currency: 'TWD',
    };

    const headers = this.createHeaders(uri, payload);
    const res = await fetch(`${this.baseUrl}${uri}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    const safeText = text.replace(/"([^"]*Id)"\s*:\s*(\d{15,})/g, '"$1":"$2"');
    const data = JSON.parse(safeText);
    return data;
  }

  /**
   * 查詢付款請求授權狀態 (Check Payment Request Status)
   * Sandbox 適用，回傳 0110/0123 等狀態碼
   */
  async checkPaymentStatus(transactionId: string) {
    const uri = `/v3/payments/requests/${transactionId}/check`;
    const headers = this.createHeaders(uri);
    const res = await fetch(`${this.baseUrl}${uri}`, {
      method: 'GET',
      headers,
    });

    const text = await res.text();
    const safeText = text.replace(/"([^"]*Id)"\s*:\s*(\d{15,})/g, '"$1":"$2"');
    const data = JSON.parse(safeText);
    return data;
  }

  /**
   * 查詢已完成交易紀錄 (Payment History - Production 適用)
   * GET /v3/payments?transactionId=xxx 回傳 info[].status = AUTHORIZATION | PAYMENT
   */
  async queryPaymentByTransaction(transactionId: string) {
    const queryString = `transactionId=${transactionId}`;
    const uri = `/v3/payments`;
    const headers = this.createHeaders(uri, undefined, queryString);
    const res = await fetch(`${this.baseUrl}${uri}?${queryString}`, {
      method: 'GET',
      headers,
    });

    const text = await res.text();
    const safeText = text.replace(/"([^"]*Id)"\s*:\s*(\d{15,})/g, '"$1":"$2"');
    const data = JSON.parse(safeText);
    return data;
  }

  /**
   * 退款 (Refund Payment)
   */
  async refundPayment(params: { transactionId: string; refundAmount?: number }) {
    const uri = `/v3/payments/${params.transactionId}/refund`;
    const payload: any = {};
    if (params.refundAmount) {
      payload.refundAmount = params.refundAmount;
    }

    const headers = this.createHeaders(uri, payload);
    const res = await fetch(`${this.baseUrl}${uri}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    const safeText = text.replace(/"([^"]*Id)"\s*:\s*(\d{15,})/g, '"$1":"$2"');
    const data = JSON.parse(safeText);
    return data;
  }
}

export const linePayService = new LinePayService();
