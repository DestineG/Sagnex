import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.SAGNEX_API_URL ?? 'http://127.0.0.1:4784';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts'
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    proxy: { '/api': apiTarget }
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: { '/api': apiTarget }
  }
});
