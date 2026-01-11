import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const port = 4173
const envBaseURL = process.env.PW_BASE_URL?.trim()
const baseURL = envBaseURL || `http://127.0.0.1:${port}`
const externalServer = process.env.PW_EXTERNAL_SERVER === '1' || Boolean(envBaseURL)
const configDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL,
    ignoreHTTPSErrors: baseURL.startsWith('https://')
  },
  webServer: externalServer
    ? undefined
    : {
        command: 'bun run dev',
        cwd: configDir,
        url: baseURL,
        env: {
          ...process.env,
          VITE_API_BASE: '/api'
        },
        reuseExistingServer: true,
        timeout: 120_000
      }
})
