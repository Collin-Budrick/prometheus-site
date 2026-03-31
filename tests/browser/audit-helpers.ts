import { expect, type ConsoleMessage, type Page, type Request, type Response } from '@playwright/test'

type RuntimeIssueKind = 'console' | 'pageerror' | 'requestfailed' | 'response'

type RuntimeIssue = {
  kind: RuntimeIssueKind
  summary: string
  url?: string
}

type RuntimeIssueTracker = {
  assertNoIssues: (routeLabel: string) => Promise<void>
  dispose: () => void
}

type AuditCredentials = {
  email: string
  password: string
}

const dockLabels = ['Home', 'Store', 'Lab', 'Login'] as const
const ignoredConsolePatterns = [/^\[vite\]\s/i]
const ignoredNetworkUrlPatterns = [/\/favicon\.ico(?:\?.*)?$/i]
const ignoredRequestFailurePatterns = [
  /\/build\/static-shell\/.*\/fragment\/runtime\/worker\.js\?v=.*\(net::ERR_BLOCKED_BY_RESPONSE\)/i
]

const normalizePathname = (value: string) =>
  value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value

const shouldIgnoreConsoleMessage = (message: ConsoleMessage) => {
  const type = message.type()
  if (type !== 'error' && type !== 'warning') return true
  const text = message.text().trim()
  return ignoredConsolePatterns.some((pattern) => pattern.test(text))
}

const shouldIgnoreNetworkUrl = (url: string) =>
  ignoredNetworkUrlPatterns.some((pattern) => pattern.test(url))

const shouldIgnoreRequestFailure = (request: Request) => {
  const failureText = request.failure()?.errorText?.trim() ?? ''
  if (!failureText) return false
  if (
    ignoredRequestFailurePatterns.some((pattern) =>
      pattern.test(`${request.url()} (${failureText})`)
    )
  ) {
    return true
  }
  return failureText === 'net::ERR_ABORTED' && request.url().includes('/api/fragments/stream')
    || failureText === 'net::ERR_ABORTED' && request.url().includes('/api/auth/get-session')
    || failureText === 'net::ERR_ABORTED' && request.url().includes('/build/static-shell/')
}

const describeRequest = (request: Request) => {
  const failureText = request.failure()?.errorText?.trim()
  return `${request.method()} ${request.url()}${failureText ? ` (${failureText})` : ''}`
}

const describeResponse = (response: Response) =>
  `${response.request().method()} ${response.status()} ${response.url()}`

export const createRuntimeIssueTracker = (page: Page): RuntimeIssueTracker => {
  const issues: RuntimeIssue[] = []

  const onConsole = (message: ConsoleMessage) => {
    if (shouldIgnoreConsoleMessage(message)) return
    const location = message.location()
    const source =
      location.url && typeof location.lineNumber === 'number'
        ? ` @ ${location.url}:${location.lineNumber}`
        : ''
    issues.push({
      kind: 'console',
      summary: `${message.type()}: ${message.text().trim()}${source}`
    })
  }

  const onPageError = (error: Error) => {
    const stack = error.stack
      ?.split('\n')
      .slice(0, 6)
      .map((line) => line.trim())
      .join(' | ')
    issues.push({
      kind: 'pageerror',
      summary: stack ? `${error.message} @ ${stack}` : error.message
    })
  }

  const onRequestFailed = (request: Request) => {
    if (shouldIgnoreNetworkUrl(request.url())) return
    if (shouldIgnoreRequestFailure(request)) return
    issues.push({
      kind: 'requestfailed',
      summary: describeRequest(request),
      url: request.url()
    })
  }

  const onResponse = (response: Response) => {
    if (response.status() < 400) return
    if (shouldIgnoreNetworkUrl(response.url())) return
    issues.push({
      kind: 'response',
      summary: describeResponse(response),
      url: response.url()
    })
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onRequestFailed)
  page.on('response', onResponse)

  return {
    assertNoIssues: async (routeLabel: string) => {
      await page.waitForTimeout(500)
      expect.soft(
        issues,
        `${routeLabel} emitted unexpected runtime issues:\n${issues.map((issue) => `- [${issue.kind}] ${issue.summary}`).join('\n')}`
      ).toEqual([])
    },
    dispose: () => {
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('requestfailed', onRequestFailed)
      page.off('response', onResponse)
    }
  }
}

export const expectPathname = async (page: Page, expectedPathname: string) => {
  await expect
    .poll(() => normalizePathname(new URL(page.url()).pathname))
    .toBe(normalizePathname(expectedPathname))
}

export const expectDockShortcuts = async (page: Page) => {
  for (const label of dockLabels) {
    await expect(page.getByRole('link', { name: label }).first()).toBeVisible()
  }
}

export const toggleLanguageUntil = async (page: Page, targetLang: string) => {
  const settingsButton = page.getByRole('button', { name: 'Settings' }).first()
  const settingsDialog = page.locator('.settings-dropdown[role="dialog"]').first()
  const languageToggle = page.locator('[data-static-language-menu-toggle]').first()

  if (!(await languageToggle.isVisible())) {
    await settingsButton.click()
    await expect(settingsDialog).toBeVisible()
  }

  await expect(languageToggle).toBeVisible()
  await languageToggle.click()

  const option = page.locator(`.settings-lang-input[data-lang="${targetLang}"]`).first()
  await expect(option).toBeVisible()
  await option.check()

  await expect(page.locator('html')).toHaveAttribute('lang', targetLang)
}

export const expectMeasuredCard = async (
  locator: ReturnType<Page['locator']>,
  { allowFragmentHint = true }: { allowFragmentHint?: boolean } = {}
) => {
  await expect(locator).toBeVisible()
  await expect(locator.locator('[data-pretext-role]').first()).toBeVisible()

  const pretextHeight = await locator.getAttribute('data-pretext-card-height')
  const fragmentHint = await locator.getAttribute('data-fragment-height-hint')
  const hasPretextHeight = Boolean(pretextHeight?.match(/^\d+$/))
  const hasFragmentHint = Boolean(fragmentHint?.match(/^\d+$/))

  expect(
    hasPretextHeight || (allowFragmentHint && hasFragmentHint),
    'expected a measured card to expose either a pretext card height or a fragment height hint'
  ).toBe(true)
}

export const expectHeightDriftWithin = async (
  page: Page,
  locator: ReturnType<Page['locator']>,
  {
    label,
    settleMs = 900,
    tolerance = 8
  }: {
    label: string
    settleMs?: number
    tolerance?: number
  }
) => {
  await expect(locator).toBeVisible()
  const initial = await locator.boundingBox()
  expect(initial, `${label} should have an initial bounding box`).not.toBeNull()

  await page.waitForTimeout(settleMs)

  const settled = await locator.boundingBox()
  expect(settled, `${label} should have a settled bounding box`).not.toBeNull()

  const drift = Math.abs((settled?.height ?? 0) - (initial?.height ?? 0))
  expect(drift, `${label} height drift exceeded ${tolerance}px`).toBeLessThanOrEqual(tolerance)

  return {
    drift,
    initial: initial?.height ?? 0,
    settled: settled?.height ?? 0
  }
}

export const openAndCloseSettings = async (page: Page) => {
  const settingsButton = page.getByRole('button', { name: 'Settings' }).first()
  const dialog = page.locator('.settings-dropdown[role="dialog"][aria-label="Settings"]').first()

  await expect(settingsButton).toBeVisible()
  await settingsButton.click()
  if (!(await dialog.isVisible())) {
    await settingsButton.click()
  }
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('h2.settings-panel-title').first()).toHaveText('Settings')
  await expect(dialog.getByRole('button', { name: /Switch to (dark|light) mode/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}

export const readAuditCredentials = (): AuditCredentials | null => {
  const email = process.env.PROMETHEUS_E2E_EMAIL?.trim() ?? ''
  const password = process.env.PROMETHEUS_E2E_PASSWORD?.trim() ?? ''
  if (!email || !password) return null
  return { email, password }
}

export const signInWithAuditCredentials = async (page: Page, credentials: AuditCredentials) => {
  await page.goto('/login/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(credentials.email)
  await page.getByRole('textbox', { name: 'PASSWORD' }).fill(credentials.password)
  await page.getByRole('button', { name: 'SIGN IN' }).click()
  await expectPathname(page, '/profile')
}
