
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    // 允许临时公网隧道访问 Vite
    host: '0.0.0.0',

    // 固定前端端口
    port: 5173,
    strictPort: true,

    // 允许 Cloudflare 临时分享域名
    allowedHosts: ['.trycloudflare.com'],

    // 将前端的 /api 请求转发到本机 FastAPI
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
