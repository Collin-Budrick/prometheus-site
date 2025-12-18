import { defineConfig, devices } from '@playwright/test'

const port = process.env.WEB_PORT ?? '4173'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
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
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          WEB_PORT: port
        }
      }
})
