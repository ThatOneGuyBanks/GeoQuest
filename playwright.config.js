import { defineConfig } from '@playwright/test';

const testPort = Number(process.env.PLAYWRIGHT_TEST_PORT) || 4397;
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL,
    browserName: 'chromium',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/server.mjs',
    url: baseURL,
    env: { ...process.env, PORT: String(testPort) },
    reuseExistingServer: false,
    timeout: 15_000
  }
});
