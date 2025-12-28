import { defineConfig, devices } from '@playwright/test'

const port = process.env.WEB_PORT ?? '4173'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const auditMode = process.env.VITE_DEV_AUDIT === '1'
const apiURL = process.env.API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? '4400'}`
const webServerTimeout = (() => {
  if (process.env.PLAYWRIGHT_WEBSERVER_TIMEOUT) {
    const parsed = Number.parseInt(process.env.PLAYWRIGHT_WEBSERVER_TIMEOUT, 10)
    return Number.isFinite(parsed) ? parsed : 120_000
  }
  return auditMode ? 600_000 : 120_000
})()
const webServerEnv = {
  ...process.env,
  WEB_PORT: port,
  API_URL: apiURL,
  ...(auditMode ? { SKIP_PRERENDER: process.env.SKIP_PRERENDER ?? '1' } : {})
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.{js,ts,mjs,cjs}',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'bun run dev',
        url: baseURL,
        timeout: webServerTimeout,
        reuseExistingServer: !process.env.CI,
        env: webServerEnv
      }
})
