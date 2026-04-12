import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/inventory-system/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'logo192.png', 'logo512.png'],
      manifest: {
        name: '進銷存與薪資登錄系統',
        short_name: 'M.Z.W',
        description: '內部進銷存與薪資查詢系統',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'logo192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'logo512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
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
