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
    // 在 build 時注入當下的 Unix timestamp（毫秒）作為版本號
    __BUILD_TIME__: JSON.stringify(Date.now().toString()),
  },
})
