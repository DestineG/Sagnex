import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const externalBaseUrl = process.env.SAGNEX_TEST_BASE_URL;
const testDatabasePath = resolve('test-results', `e2e-${process.pid}.sqlite`);

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:4193',
    trace: 'retain-on-failure'
  },
  webServer: externalBaseUrl ? undefined : [
    {
      command: 'pnpm --filter @sagnex/api dev',
      url: 'http://127.0.0.1:4794/api/health',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        SAGNEX_API_PORT: '4794',
        SAGNEX_DATABASE_PATH: testDatabasePath
      }
    },
    {
      command: 'pnpm --filter @sagnex/web exec vite --host 127.0.0.1 --port 4193 --strictPort',
      url: 'http://127.0.0.1:4193',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        SAGNEX_API_URL: 'http://127.0.0.1:4794'
      }
    }
  ]
});
