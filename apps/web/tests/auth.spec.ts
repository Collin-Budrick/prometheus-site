import { createServer, type IncomingMessage } from 'node:http'
import { expect, test } from '@playwright/test'

const shouldStubAuth = !process.env.PLAYWRIGHT_BASE_URL

test.describe('auth surfaces', () => {
  test('renders SSR login page content', async ({ page }) => {
    const response = await page.goto('/login', { waitUntil: 'domcontentloaded' })

    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: /Sign in to continue/i })).toBeVisible()
    await expect(page.getByLabel(/Email/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Use a passkey/i })).toBeVisible()
  })

  test('completes passkey happy path with mocked WebAuthn', async ({ page }) => {
    const calls: string[] = []
    const apiUrl = new URL(process.env.API_URL ?? 'http://127.0.0.1:4400')

    const server = createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 404
        res.end()
        return
      }

      if (req.method === 'GET' && req.url.startsWith('/api/auth/passkey/generate-authenticate-options')) {
        calls.push('options')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            challenge: 'dGVzdC1jaGFsbGVuZ2U',
            allowCredentials: [{ id: 'Y3JlZC1hYmM', type: 'public-key' }]
          })
        )
        return
      }

      if (req.method === 'POST' && req.url.startsWith('/api/auth/passkey/verify-authentication')) {
        calls.push('verify')
        res.writeHead(200, {
          'set-cookie': 'session=abc; Path=/; HttpOnly',
          'content-type': 'application/json'
        })
        res.end(JSON.stringify({ authenticated: true }))
        return
      }

      res.statusCode = 404
      res.end('not found')
    })

    await new Promise<void>((resolve) => {
      server.listen(Number.parseInt(apiUrl.port || '80', 10), apiUrl.hostname || '127.0.0.1', resolve)
    })

    await page.addInitScript(() => {
      const buffer = (values: number[]) => new Uint8Array(values).buffer
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - playwright execution context
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: class {
          constructor() {}
        },
        configurable: true
      })

      const credential = {
        id: 'cred-abc',
        type: 'public-key',
        rawId: buffer([1, 2, 3]),
        response: {
          authenticatorData: buffer([4]),
          clientDataJSON: buffer([5]),
          signature: buffer([6]),
          userHandle: null
        }
      }

      const credentialsContainer = {
        get: async () => credential
      }

      if ('credentials' in navigator && navigator.credentials) {
        navigator.credentials.get = credentialsContainer.get
      } else {
        Object.defineProperty(navigator, 'credentials', {
          value: credentialsContainer,
          configurable: true
        })
      }
    })

    try {
      await page.goto('/login?callback=/chat', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: /Use a passkey/i }).click()
      await expect.poll(() => calls).toEqual(['options', 'verify'])
      await page.waitForURL(/\/chat(\/|$)/)
      await expect(page.getByRole('heading', { name: /WebSocket chat via Valkey pub\/sub/i })).toBeVisible()
      await expect(page.locator('text=Unable to sign in with a passkey.')).toHaveCount(0)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  test('handles OAuth start and callback without external navigation', async ({ page }) => {
    const calls: string[] = []

    await page.route('**/api/auth/oauth/github/start', (route) => {
      calls.push('start')
      return route.fulfill({
        status: 302,
        headers: { location: '/api/auth/oauth/github/callback?code=mock-code&state=mock-state' }
      })
    })

    await page.route(/\/api\/auth\/oauth\/github\/callback/, (route) => {
      calls.push('callback')
      return route.fulfill({
        status: 200,
        headers: { 'set-cookie': 'session=oauth; Path=/; HttpOnly' },
        contentType: 'text/html',
        body: '<html><body>oauth ok</body></html>'
      })
    })

    await page.goto('/api/auth/oauth/github/start', { waitUntil: 'domcontentloaded' })
    await page.goto('/api/auth/oauth/github/callback?code=mock-code&state=mock-state', {
      waitUntil: 'domcontentloaded'
    })

    expect(calls).toEqual(['start', 'callback'])
    await expect(page.locator('body')).toContainText('oauth ok')
  })
})

test.describe('auth redirect (stubbed api)', () => {
  test.skip(!shouldStubAuth, 'requires local dev server')

  let server: ReturnType<typeof createServer> | null = null
  let lastSignInBody: Record<string, unknown> | null = null

  const resolveApiUrl = () => {
    const fallback = 'http://127.0.0.1:4400'
    const raw = process.env.API_URL?.trim() || fallback
    try {
      return new URL(raw)
    } catch {
      return new URL(fallback)
    }
  }

  const parseJsonBody = async (req: IncomingMessage) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const body = Buffer.concat(chunks).toString('utf8')
    if (!body) return null
    try {
      return JSON.parse(body) as Record<string, unknown>
    } catch {
      return null
    }
  }

  test.beforeAll(async () => {
    const apiUrl = resolveApiUrl()
    server = createServer(async (req, res) => {
      if (!req.url) {
        res.statusCode = 404
        res.end()
        return
      }

      if (req.method === 'POST' && req.url.startsWith('/api/auth/sign-in/email')) {
        lastSignInBody = await parseJsonBody(req)
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'session=stub; Path=/; HttpOnly; SameSite=Lax'
        })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (req.method === 'GET' && req.url.startsWith('/api/auth/session')) {
        const cookie = req.headers.cookie ?? ''
        if (!cookie.includes('session=stub')) {
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ session: null, user: null }))
          return
        }

        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            session: {
              token: 'stub-token',
              userId: 'user-1',
              expiresAt: '2099-01-01T00:00:00.000Z'
            },
            user: {
              id: 'user-1',
              email: 'demo@prometheus.dev',
              name: 'Demo'
            }
          })
        )
        return
      }

      res.statusCode = 404
      res.end('not found')
    })

    await new Promise<void>((resolve) => {
      server?.listen(Number.parseInt(apiUrl.port || '4400', 10), resolve)
    })
  })

  test.afterAll(async () => {
    if (!server) return
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  })

  test('redirects to account after email login', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    lastSignInBody = null
    const baseURL = testInfo.project.use.baseURL ?? 'http://127.0.0.1:4173'

    await page.goto('/account', { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForURL('**/login**')

    const loginUrl = new URL(page.url())
    const locale = loginUrl.pathname.split('/')[1] || 'en'
    const expectedCallback = new URL(`/${locale}/account`, baseURL).toString()

    await page.getByLabel(/Email/i).fill('demo@prometheus.dev')
    await page.getByLabel(/Password/i).fill('password123')
    await page.getByRole('button', { name: /Continue/i }).click()

    await page.waitForURL(`**/${locale}/account**`)
    await expect(page.getByRole('heading', { level: 1, name: /Keep your profile current/i })).toBeVisible()
    await expect.poll(() => lastSignInBody).not.toBeNull()
    expect(lastSignInBody?.callbackURL).toBe(expectedCallback)
  })
})
