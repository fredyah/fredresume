import { defineConfig } from 'vite';

export default defineConfig({
  base: '/fredresume/', // 將 <your-repository-name> 替換為你的 GitHub 儲存庫名稱
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});