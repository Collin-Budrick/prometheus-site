import { expect, test, type Page } from '@playwright/test'
import {
  createRuntimeIssueTracker,
  expectDockShortcuts,
  expectPathname,
  openAndCloseSettings,
  readAuditCredentials,
  signInWithAuditCredentials
} from './audit-helpers'

const guardedRoutes = ['/chat/', '/dashboard/', '/profile/', '/settings/'] as const
const expectedHostedSocialProviders = (
  process.env.PROMETHEUS_EXPECT_SOCIAL_PROVIDERS?.trim() ||
  process.env.VITE_AUTH_SOCIAL_PROVIDERS?.trim() ||
  process.env.AUTH_SOCIAL_PROVIDERS?.trim() ||
  ''
)
  .split(/[,\n]/)
  .map((provider) => provider.trim().toLowerCase())
  .filter(Boolean)

const resolveSocialProviderLabel = (provider: string) => {
  switch (provider) {
    case 'google':
      return 'Google'
    case 'facebook':
      return 'Facebook'
    case 'twitter':
      return 'Twitter (X)'
    case 'github':
      return 'GitHub'
    default:
      return provider
  }
}

const runWithRuntimeTracking = async (
  page: Page,
  routeLabel: string,
  callback: () => Promise<void>
) => {
  const tracker = createRuntimeIssueTracker(page)
  try {
    await callback()
    await tracker.assertNoIssues(routeLabel)
  } finally {
    tracker.dispose()
  }
}

test.describe('full preset live route audit', () => {
  test('home route keeps the demo shell interactive', async ({ page }) => {
    test.slow()

    await runWithRuntimeTracking(page, 'home route', async () => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle('Prometheus | Binary Fragment Platform')
      await expect(page.getByRole('heading', { name: 'Field brief' })).toBeVisible()
      await expectDockShortcuts(page)
      await openAndCloseSettings(page)

      const plannerSummary = page.getByText(/Dependency graph resolved up front\.|Cache hit map built before rendering\./)
      let plannerStarted = false
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.getByRole('button', { name: /run plan/i }).click()
        try {
          await expect(plannerSummary).toBeVisible({ timeout: 2000 })
          plannerStarted = true
          break
        } catch (error) {
          if (attempt === 2) throw error
        }
      }
      expect(plannerStarted).toBe(true)

      await page.getByRole('button', { name: 'SHUFFLE CACHE' }).click()
      await expect(page.getByText('PLANNER SIMULATION')).toBeVisible()

      const collaborativeTextbox = page.getByRole('textbox', { name: 'Shared collaborative text box' })
      await collaborativeTextbox.click()
      await expect(
        page.getByText(/CONNECTING LIVE SYNC\.\.\.|LIVE FOR EVERYONE ON THIS PAGE/i)
      ).toBeVisible()

      await page.getByRole('button', { name: 'RESET TIMER' }).click()
      await expect(page.getByText('1:00').first()).toBeVisible()
    })
  })

  test('store route streams inventory and exposes semantic issues', async ({ page }) => {
    test.slow()

    await runWithRuntimeTracking(page, 'store route', async () => {
      await page.goto('/store/', { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle('Store | Prometheus')
      await expect(page.getByText('LIVE CATALOG')).toBeVisible()
      await expectDockShortcuts(page)
      await openAndCloseSettings(page)

      await expect(page.getByRole('button', { name: 'Add to cart' }).first()).toBeEnabled({ timeout: 15000 })
      await expect(page.getByText(/Store snapshot ready|Live snapshot/i)).toBeVisible()

      const search = page.getByRole('searchbox', { name: 'Search the store...' })
      await search.fill('Item 15')
      await expect(search).toHaveValue('Item 15')
      await expect(page.locator('.store-stream-meta')).toContainText('1 results')
      const filteredRow = page.locator('.store-stream-row').filter({ has: page.getByText('Item 15') }).first()
      await expect(filteredRow).toBeVisible()

      await filteredRow.getByRole('button', { name: 'Add to cart' }).click()
      const cartPanel = page.locator('article').filter({ has: page.getByText(/^Cart$/) }).first()
      await expect(cartPanel).toContainText('Item 15')
      await expect(cartPanel).toContainText('$45.00')
      await expect(cartPanel.getByRole('button', { name: 'Remove item' })).toBeVisible()
      await cartPanel.getByRole('button', { name: 'Remove item' }).click()
      await expect(page.getByText('Cart is empty.')).toBeVisible()

      const itemNameInput = page.getByRole('textbox', { name: 'ITEM NAME' })
      await expect.soft(itemNameInput).toHaveAttribute('name', /\S+/)
      await expect.soft(itemNameInput).toHaveAttribute('autocomplete', /\S+/)
    })
  })

  test('lab route renders and keeps the CTA stable', async ({ page }) => {
    await runWithRuntimeTracking(page, 'lab route', async () => {
      await page.goto('/lab/', { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle('Lab | Prometheus')
      await expect(page.getByRole('heading', { name: 'Lab' })).toBeVisible()
      await expectDockShortcuts(page)
      await openAndCloseSettings(page)

      const launchExperiment = page.getByRole('button', { name: 'LAUNCH EXPERIMENT' })
      await expect(launchExperiment).toBeVisible()
    })
  })

  test('login route supports tab changes without credentials', async ({ page }) => {
    await runWithRuntimeTracking(page, 'login route', async () => {
      await page.goto('/login/', { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle('Welcome back | Prometheus')
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
      await expect(page.locator('[data-static-login-runtime-banner]')).toContainText(/Dev session|Hosted auth/)
      await expectDockShortcuts(page)
      await openAndCloseSettings(page)

      await page.getByRole('tab', { name: 'CREATE ACCOUNT' }).click()
      await expect(page.getByRole('textbox', { name: 'NAME' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'CREATE ACCOUNT' })).toBeVisible()

      const root = page.locator('[data-static-login-root]')
      const runtimeMode = await root.getAttribute('data-runtime-mode')
      if (runtimeMode === 'hosted' && expectedHostedSocialProviders.length > 0) {
        await expect(page.locator('[data-static-login-social]')).toBeVisible()
        for (const provider of expectedHostedSocialProviders) {
          await expect(page.getByRole('button', { name: resolveSocialProviderLabel(provider) })).toBeVisible()
        }
      }

      await page.getByRole('tab', { name: 'SIGN IN' }).click()
      await expect(page.getByRole('textbox', { name: 'EMAIL' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'PASSWORD' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'SIGN IN' })).toBeVisible()

      const runtimeModeAfterSignIn = await page.locator('[data-static-login-root]').getAttribute('data-runtime-mode')
      if (runtimeModeAfterSignIn === 'hosted' && expectedHostedSocialProviders.length > 0) {
        await expect(page.locator('[data-static-login-social]')).toBeVisible()
        for (const provider of expectedHostedSocialProviders) {
          await expect(page.getByRole('button', { name: resolveSocialProviderLabel(provider) })).toBeVisible()
        }

        if (expectedHostedSocialProviders.includes('twitter')) {
          const twitterRedirectRequest = page.waitForResponse((response) => {
            if (response.request().method() !== 'POST') return false
            return response.url().endsWith('/api/auth/sign-in/social')
          })

          await page.getByRole('button', { name: 'Twitter (X)' }).click()

          const twitterRedirectResponse = await twitterRedirectRequest
          const twitterRedirectBody = twitterRedirectResponse.request().postDataJSON()

          expect(twitterRedirectBody).toMatchObject({
            disableRedirect: true,
            provider: 'twitter'
          })
          expect(String(twitterRedirectBody.callbackURL ?? '')).toContain('/login/callback?next=')

          if (twitterRedirectResponse.ok()) {
            const redirectLocation = await twitterRedirectResponse.headerValue('location')
            if (redirectLocation) {
              expect(redirectLocation).toMatch(/https:\/\/(?:.*\.)?(?:x\.com|twitter\.com)\//)
            } else {
              await expect
                .poll(() => page.url(), { timeout: 15_000 })
                .toMatch(/https:\/\/(?:.*\.)?(?:x\.com|twitter\.com)\//)
            }
          } else {
            await expect(page.locator('[data-static-login-status]')).toBeVisible()
            await expect(page.locator('[data-static-login-status]')).toContainText(/\S+/)
          }
        }
      }
    })
  })

  test('offline route stays reachable and stable', async ({ page }) => {
    await runWithRuntimeTracking(page, 'offline route', async () => {
      await page.goto('/offline/', { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle('Prometheus | Offline')
      await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible()
      await expectDockShortcuts(page)
      await openAndCloseSettings(page)

      const retrySync = page.getByRole('button', { name: 'RETRY SYNC' })
      await expect(retrySync).toBeVisible()
    })
  })

  for (const guardedRoute of guardedRoutes) {
    test(`guarded route ${guardedRoute} redirects unauthenticated users`, async ({ page }) => {
      await runWithRuntimeTracking(page, `guarded route ${guardedRoute}`, async () => {
        await page.goto(guardedRoute, { waitUntil: 'domcontentloaded' })
        await expectPathname(page, '/login')
        await expect(page).toHaveTitle('Welcome back | Prometheus', { timeout: 20000 })
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 20000 })
        await expect(page.locator('[data-static-login-next-code]')).toContainText(guardedRoute.replace(/\/$/, ''), {
          timeout: 20000
        })
      })
    })
  }

  test('authenticated routes load when audit credentials are provided', async ({ page }) => {
    const credentials = readAuditCredentials()
    test.skip(!credentials, 'Set PROMETHEUS_E2E_EMAIL and PROMETHEUS_E2E_PASSWORD to audit authenticated routes.')
    test.slow()

    await runWithRuntimeTracking(page, 'authenticated routes', async () => {
      await signInWithAuditCredentials(page, credentials!)

      const authenticatedRoutes = [
        { path: '/dashboard/', title: 'Dashboard | Prometheus', heading: 'Dashboard' },
        { path: '/profile/', title: 'Profile | Prometheus', heading: 'Profile' },
        { path: '/settings/', title: 'Settings | Prometheus', heading: 'Settings' },
        { path: '/chat/', title: 'Chat | Prometheus', heading: 'Chat' }
      ] as const

      for (const route of authenticatedRoutes) {
        await page.goto(route.path, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveTitle(route.title)
        await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible()
        await expectDockShortcuts(page)
      }
    })
  })
})
