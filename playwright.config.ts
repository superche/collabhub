import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [{
    command: 'pnpm dev', url: 'http://127.0.0.1:5173', timeout: 60_000,
    reuseExistingServer: true, stdout: 'pipe', stderr: 'pipe',
  }, {
    command: 'pnpm dev:blocknote', url: 'http://127.0.0.1:5183', timeout: 60_000,
    reuseExistingServer: true, stdout: 'pipe', stderr: 'pipe',
  }],
})
