import { expect, test, type Page } from '@playwright/test'
import {
  createRuntimeIssueTracker,
  expectCardShrinksBelowInitialReservation,
  expectCardSettlesToContentHeight,
  expectDockShortcuts,
  expectHeightDriftWithin,
  expectMeasuredCard,
  expectPathname,
  openAndCloseSettings,
  readAuditCredentials,
  signInWithAuditCredentials,
  toggleLanguageUntil
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

const expectBoundingBox = async (locator: ReturnType<Page['locator']>) => {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

const waitForStoreRuntimeReady = async (page: Page) => {
  await expect(page.getByRole('button', { name: 'Add to cart' }).first()).toBeEnabled({
    timeout: 15000
  })
  await expect(page.getByText(/Store snapshot ready|Live snapshot/i)).toBeVisible()
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

  test('home route reserves measured card heights before and after reveal', async ({ page }) => {
    test.slow()

    await runWithRuntimeTracking(page, 'home route pretext stability', async () => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      const introCard = page.locator('[data-fragment-id="shell-intro"]').first()
      const manifestoCard = page.locator('[data-fragment-id="fragment://page/home/manifest@v1"]').first()
      const dockCard = page.locator('[data-fragment-id="fragment://page/home/dock@v2"]').first()

      await expectMeasuredCard(manifestoCard)
      await expectCardShrinksBelowInitialReservation(page, manifestoCard, {
        label: 'home manifesto card'
      })
      await expectHeightDriftWithin(page, introCard, {
        label: 'home intro card',
        tolerance: 10
      })
      await expectHeightDriftWithin(page, manifestoCard, {
        label: 'home manifesto card',
        tolerance: 10
      })
      await expectHeightDriftWithin(page, dockCard, {
        label: 'home dock card',
        tolerance: 10
      })
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

      await waitForStoreRuntimeReady(page)

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

  test('store search and cart updates keep card heights stable after the update settles', async ({ page }) => {
    test.slow()

    await runWithRuntimeTracking(page, 'store route pretext stability', async () => {
      await page.goto('/store/', { waitUntil: 'domcontentloaded' })

      const streamCard = page.locator('article').filter({ has: page.getByText('LIVE CATALOG') }).first()
      const cartCard = page.locator('article').filter({ has: page.getByText(/^Cart$/) }).first()
      const search = page.getByRole('searchbox', { name: 'Search the store...' })

      await waitForStoreRuntimeReady(page)

      await search.fill('Item 15')
      await expect(page.locator('.store-stream-meta')).toContainText('1 results')

      await expectHeightDriftWithin(page, streamCard, {
        label: 'store stream card after search',
        tolerance: 12
      })

      const filteredRow = page.locator('.store-stream-row').filter({ has: page.getByText('Item 15') }).first()
      await expect(filteredRow).toBeVisible()
      const rowBefore = await filteredRow.boundingBox()
      expect(rowBefore).not.toBeNull()

      await filteredRow.getByRole('button', { name: 'Add to cart' }).click()
      await expect(cartCard).toContainText('Item 15')

      await expectHeightDriftWithin(page, cartCard, {
        label: 'store cart card after add',
        tolerance: 12
      })

      const rowAfter = await filteredRow.boundingBox()
      expect(rowAfter).not.toBeNull()
      const rowDrift = Math.abs((rowAfter?.height ?? 0) - (rowBefore?.height ?? 0))
      expect(rowDrift, 'store row height drift exceeded 6px').toBeLessThanOrEqual(6)
    })
  })

  test('store route promotes the first card when the desktop grid has an odd card count', async ({ page }) => {
    test.slow()

    await runWithRuntimeTracking(page, 'store route odd-card layout', async () => {
      await page.setViewportSize({ width: 1440, height: 1200 })
      await page.goto('/store/', { waitUntil: 'domcontentloaded' })

      const streamPanel = page.locator('article').filter({ has: page.getByText('LIVE CATALOG') }).first()
      const cartPanel = page.locator('article').filter({ has: page.getByText(/^Cart$/) }).first()
      const createPanel = page
        .locator('article')
        .filter({ has: page.getByRole('button', { name: 'ADD ITEM' }) })
        .first()

      await expect(streamPanel).toBeVisible()
      await expect(cartPanel).toBeVisible()
      await expect(createPanel).toBeVisible()

      const streamBox = await expectBoundingBox(streamPanel)
      const cartBox = await expectBoundingBox(cartPanel)
      const createBox = await expectBoundingBox(createPanel)

      expect(streamBox.width).toBeGreaterThan(cartBox.width * 1.75)
      expect(Math.abs(streamBox.x - cartBox.x)).toBeLessThan(24)
      expect(Math.abs(cartBox.y - createBox.y)).toBeLessThan(40)
      expect(Math.abs(cartBox.width - createBox.width)).toBeLessThan(60)
      expect(createBox.x).toBeGreaterThan(cartBox.x + cartBox.width * 0.7)

      await page.setViewportSize({ width: 430, height: 1200 })
      await page.goto('/store/', { waitUntil: 'domcontentloaded' })

      await expect(streamPanel).toBeVisible()
      await expect(cartPanel).toBeVisible()
      await expect(createPanel).toBeVisible()

      const mobileStreamBox = await expectBoundingBox(streamPanel)
      const mobileCartBox = await expectBoundingBox(cartPanel)
      const mobileCreateBox = await expectBoundingBox(createPanel)

      expect(Math.abs(mobileStreamBox.x - mobileCartBox.x)).toBeLessThan(20)
      expect(Math.abs(mobileCartBox.x - mobileCreateBox.x)).toBeLessThan(20)
      expect(mobileCartBox.y).toBeGreaterThan(mobileStreamBox.y + mobileStreamBox.height - 10)
      expect(mobileCreateBox.y).toBeGreaterThan(mobileCartBox.y + mobileCartBox.height - 10)
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
      await page.setViewportSize({ width: 1440, height: 1200 })
      await page.goto('/login/', { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle('Welcome back | Prometheus')
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
      await expect(page.locator('[data-static-login-runtime-banner]')).toContainText(/Dev session|Hosted auth/)

      const mainGrid = page.locator('[data-fragment-grid="main"]').first()
      const loginCard = page.locator('article').filter({ has: page.locator('[data-static-login-root]') }).first()
      await expectMeasuredCard(loginCard)
      await expectCardSettlesToContentHeight(page, loginCard, {
        label: 'login card initial settle'
      })
      const mainGridBox = await expectBoundingBox(mainGrid)
      const loginCardBox = await expectBoundingBox(loginCard)

      expect(loginCardBox.width).toBeGreaterThan(mainGridBox.width * 0.9)
      expect(Math.abs(loginCardBox.x - mainGridBox.x)).toBeLessThan(24)

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
      await expectHeightDriftWithin(page, loginCard, {
        label: 'login card after tab toggles',
        tolerance: 12
      })

      const runtimeModeAfterSignIn = await page.locator('[data-static-login-root]').getAttribute('data-runtime-mode')
      const passkeysSupported = await page.evaluate(() => {
        return (
          typeof PublicKeyCredential === 'function' &&
          typeof navigator.credentials?.create === 'function' &&
          typeof navigator.credentials?.get === 'function'
        )
      })
      if (runtimeModeAfterSignIn === 'hosted' && passkeysSupported) {
        await expect(page.getByRole('button', { name: /USE PASSKEY/i })).toBeVisible()
      }
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

      await toggleLanguageUntil(page, 'ko')
      await expectHeightDriftWithin(page, loginCard, {
        label: 'login card after language toggle',
        tolerance: 12
      })
    })
  })

  test('offline route stays reachable and stable', async ({ page }) => {
    await runWithRuntimeTracking(page, 'offline route', async () => {
      await page.goto('/offline/', { waitUntil: 'domcontentloaded' })

      await expect(page).toHaveTitle('Prometheus | Offline')
      await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible()
      await expectDockShortcuts(page)
      await openAndCloseSettings(page)

      const offlineCard = page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name: 'Offline' }) })
        .first()
      await expectMeasuredCard(offlineCard, { allowFragmentHint: false })
      await expectCardSettlesToContentHeight(page, offlineCard, {
        label: 'offline static shell card'
      })

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
