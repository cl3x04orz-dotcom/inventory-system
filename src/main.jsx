import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 全域錯誤捕獲與警報，方便定位白畫面問題
window.addEventListener('error', (event) => {
  alert(`[JS 錯誤] ${event.message}\n在 ${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  alert(`[Promise 錯誤] ${event.reason?.message || event.reason}`);
});


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
