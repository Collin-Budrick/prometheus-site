import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const port = 4173
const baseURL = `http://127.0.0.1:${port}`
const configDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL
  },
  webServer: {
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
