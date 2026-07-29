import { defineConfig, devices } from '@playwright/test'

const UI = process.env.QUE_UI_BASE || 'http://localhost:5174'
const API = process.env.QUE_API_BASE || 'http://localhost:8787'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: UI,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Assumes UI + API already running (local/dev). Set QUE_E2E_WEB_SERVER=1 to auto-start UI.
  webServer: process.env.QUE_E2E_WEB_SERVER
    ? {
        command: 'npm run dev',
        url: UI,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
  metadata: { apiBase: API },
})
