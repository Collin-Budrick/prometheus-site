import { expect, test } from '@playwright/test'

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

    await page.addInitScript(() => {
      const buffer = (values: number[]) => new Uint8Array(values).buffer
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - playwright execution context
      window.PublicKeyCredential = class {
        constructor() {}
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - playwright execution context
      navigator.credentials = {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        get: async () => ({
          id: 'cred-abc',
          type: 'public-key',
          rawId: buffer([1, 2, 3]),
          response: {
            authenticatorData: buffer([4]),
            clientDataJSON: buffer([5]),
            signature: buffer([6]),
            userHandle: null
          }
        })
      }
    })

    await page.route('**/api/auth/passkey/generate-authenticate-options', (route) => {
      calls.push('options')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          challenge: 'test-challenge',
          allowCredentials: [{ id: 'cred-abc', type: 'public-key' }]
        })
      })
    })

    await page.route('**/api/auth/passkey/verify-authentication', (route) => {
      calls.push('verify')
      return route.fulfill({
        status: 200,
        headers: { 'set-cookie': 'session=abc; Path=/; HttpOnly' },
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true })
      })
    })

    await page.goto('/login?callback=/passkey-complete', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Use a passkey/i }).click()
    await page.waitForURL('**/passkey-complete')

    expect(calls).toEqual(['options', 'verify'])
    expect(page.url()).toContain('/passkey-complete')
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

    await page.route('**/api/auth/oauth/github/callback**', (route) => {
      calls.push('callback')
      return route.fulfill({
        status: 302,
        headers: {
          location: '/oauth-complete',
          'set-cookie': 'session=oauth; Path=/; HttpOnly'
        }
      })
    })

    await page.route('**/oauth-complete', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>oauth ok</body></html>'
      })
    )

    await page.goto('/api/auth/oauth/github/start', { waitUntil: 'domcontentloaded' })
    await page.waitForURL('**/oauth-complete')

    expect(calls).toEqual(['start', 'callback'])
    await expect(page.locator('body')).toContainText('oauth ok')
  })
})
