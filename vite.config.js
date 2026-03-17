import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'

// https://vite.dev/config/
export default defineConfig({
  base: '/inventory-system/',
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
      ],
    },
  },
  define: {
    // 優先使用 CI 傳入的環境變數，確保前後端版本完全同步
    __BUILD_TIME__: JSON.stringify(process.env.VITE_APP_VERSION || Date.now().toString()),
  },
})
