import { useState, useEffect } from 'react';
import { callGAS } from '../utils/api';

// 開發備援 (Default Config)
// 若正式環境 API 查無資料，應該是報錯；但為了平穩過渡，我們保留 DEFAULT_STORE。
// 若有需要可在 UI 中加入檢查 (例如 !setting.id => 表示是備援資料，正式環境可顯示警告)
export const DEFAULT_STORE = {
  name: "米立微",
  logoUrl: null,
  phone: "09xxxxxxxx",
  address: "未設定",
  lineOA: "https://line.me/ti/p/@example",
  linePay: null,
  liffId: null,
  primaryColor: "#4F46E5",
  secondaryColor: "#3730A3",
  businessHours: "24小時",
  timezone: "Asia/Taipei",
  language: "zh-TW",
  currency: "TWD",
};

export const useStoreSetting = () => {
  const [setting, setSetting] = useState(DEFAULT_STORE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        setLoading(true);
        
        // 1. 優先從 URL 取得 storeCode (用於 Demo)
        const urlParams = new URLSearchParams(window.location.search);
        const urlStoreCode = urlParams.get('storeCode');
        
        // 2. 存入 SessionStorage 以便跨頁保留 Demo 狀態
        let targetStoreCode = 'MILI001';
        if (urlStoreCode) {
            targetStoreCode = urlStoreCode;
            sessionStorage.setItem('demoStoreCode', urlStoreCode);
        } else {
            const savedDemoCode = sessionStorage.getItem('demoStoreCode');
            if (savedDemoCode) {
                targetStoreCode = savedDemoCode;
            }
        }

        const apiUrl = window.GAS_API_URL || import.meta.env.VITE_GAS_API_URL;
        const data = await callGAS(apiUrl, 'getStoreSetting', { storeCode: targetStoreCode });
        if (data && data.storeCode) {
          setSetting(data);
          
          // 動態寫入 CSS 變數 (例如品牌色)
          if (data.primaryColor) {
            document.documentElement.style.setProperty('--primary-color', data.primaryColor);
          }
          if (data.secondaryColor) {
            document.documentElement.style.setProperty('--secondary-color', data.secondaryColor);
          }
        } else {
          // 若無資料但沒拋錯 (理論上 API 若沒資料會 throw Error)
          if (import.meta.env.PROD) {
            console.error('正式環境未找到店家設定，使用備援預設值將有風險！');
          }
        }
      } catch (err) {
        if (import.meta.env.PROD) {
           console.error('API 取得 StoreSetting 失敗 (正式環境)', err);
           // 依據計畫，正式環境應拋錯或顯示警告
           setError(err);
        } else {
           console.warn('API 取得 StoreSetting 失敗 (開發環境)，自動套用 DEFAULT_STORE', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSetting();
  }, []);

  return { setting, loading, error };
};
