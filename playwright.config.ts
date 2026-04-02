import { defineConfig } from '@playwright/test'
import { getRuntimeConfig } from './scripts/runtime-config'

const runtimeConfig = getRuntimeConfig(process.env)
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  process.env.PW_BASE_URL?.trim() ||
  `https://${runtimeConfig.domains.webProd}`

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  timeout: 90_000,
  reporter: 'line',
  outputDir: './test-results/playwright',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
})
