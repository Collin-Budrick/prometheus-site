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
  return failureText === 'net::ERR_ABORTED' && request.url().includes('/api/fragments/stream')
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

export const openAndCloseSettings = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  const dialog = page.locator('.settings-dropdown[role="dialog"][aria-label="Settings"]').first()
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
