import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  return {
    base: isProd ? 'https://cl3x04orz-dotcom.github.io/inventory-system/' : '/inventory-system/',
    plugins: [
      react()
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
      cssMinify: true,
      minify: true,
      assetsInlineLimit: 4096
    }
  };
})
