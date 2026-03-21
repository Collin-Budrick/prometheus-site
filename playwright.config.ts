import { defineConfig } from '@playwright/test'
import { templateBranding } from './packages/template-config/src/index.ts'

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  process.env.PW_BASE_URL?.trim() ||
  `https://${templateBranding.domains.webProd}`

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure'
  }
})
