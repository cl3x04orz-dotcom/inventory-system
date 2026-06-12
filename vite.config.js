import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import { viteSingleFile } from 'vite-plugin-singlefile' // ⭕ 引入內聯單檔案插件

// https://vite.dev/config/
export default defineConfig({
  base: '/inventory-system/',
  plugins: [
    react(),
    viteSingleFile() // ⭕ 核心：取代原本的 VitePWA，強迫將代碼融合成單一網頁
  ],
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
      ],
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(process.env.VITE_APP_VERSION || Date.now().toString()),
  },
  build: {
    target: 'es2020',
    cssMinify: false,
    minify: false
  }
})
