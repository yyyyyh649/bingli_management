import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发：/api 代理到本地 backend
// 构建：产物输出到 ../backend/public，由 backend 生产环境静态托管
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
});
