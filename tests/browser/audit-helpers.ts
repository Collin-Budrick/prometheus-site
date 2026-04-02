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

type ClientBootDebugState = {
  ready: boolean
  source: string
  unlockedAt: number | null
}

type PrometheusRouteTransitionDebugEntry = {
  from?: string | null
  to?: string | null
  startAt?: number | null
  endAt?: number | null
  duration?: number | null
}

type PrometheusPerfDebugState = {
  staticShellBootstrapAt?: number | null
  workerPrewarmAt?: number | null
  firstFragmentCommitAt?: number | null
  firstActionableControlAt?: number | null
  routeTransitions?: PrometheusRouteTransitionDebugEntry[]
}

type FragmentStartupDebugEntry = {
  at: number
  kind: 'fetch' | 'stream-start'
  shellMode: string
  startupReady: boolean
  ids: string[]
  nonCriticalIds: string[]
}

type FragmentNetworkDebugEntry = {
  at: number
  bytes: number
  id: string
  source: 'single' | 'batch' | 'fetch-stream' | 'webtransport-stream' | 'webtransport-datagram'
}

export type PrometheusPerfSnapshot = {
  pathname: string
  clientBoot: ClientBootDebugState
  staticShellBootstrapAt: number | null
  workerPrewarmAt: number | null
  firstFragmentCommitAt: number | null
  firstActionableControlAt: number | null
  lastRouteTransition: {
    from: string | null
    to: string | null
    startAt: number | null
    endAt: number | null
    duration: number | null
  } | null
  routeTransitions: Array<{
    from: string | null
    to: string | null
    startAt: number | null
    endAt: number | null
    duration: number | null
  }>
}

export type PrometheusFragmentStartupSnapshot = {
  unlockCutoff: number | null
  duplicateFragmentBytesBeforeUnlock: number
  duplicateFragmentIdsBeforeUnlock: string[]
  preUnlockNonCriticalRequests: Array<{
    at: number
    kind: 'fetch' | 'stream-start'
    ids: string[]
    nonCriticalIds: string[]
  }>
}

type CardHeightSnapshot = {
  contentHeight: number
  liveMinHeight: number | null
  renderedHeight: number
  reservationHeight: number | null
}

const publicDockLabels = ['Home', 'Store', 'Lab', 'Login'] as const
const authenticatedDockLabels = ['Profile', 'Chat', 'Settings', 'Dashboard'] as const
const ignoredConsolePatterns = [/^\[vite\]\s/i]
const ignoredPageErrorPatterns = [/^Transition was skipped$/i]
const ignoredNetworkUrlPatterns = [/\/favicon\.ico(?:\?.*)?$/i]
const ignoredRequestFailurePatterns = [
  /\/build\/static-shell\/.*\/fragment\/runtime\/worker\.js(?:\?v=.*)?\s+\(net::ERR_BLOCKED_BY_RESPONSE\)/i
]
const perfMarkNames = {
  staticShellBootstrapAt: [
    'prom:perf:static-shell-bootstrap-start',
    'prom:perf:static-shell-bootstrap-end',
    'prom:static-shell-bootstrap',
    'prometheus:static-shell-bootstrap'
  ],
  workerPrewarmAt: [
    'prom:perf:worker-prewarm',
    'prom:fragment-worker-prewarm',
    'prom:worker-prewarm',
    'prometheus:worker-prewarm'
  ],
  firstFragmentCommitAt: [
    'prom:perf:first-fragment-commit',
    'prom:first-fragment-commit',
    'prometheus:first-fragment-commit'
  ],
  firstActionableControlAt: [
    'prom:perf:first-actionable-control',
    'prom:first-actionable-control',
    'prom:actionable-control-ready',
    'prometheus:first-actionable-control'
  ],
  routeTransition: ['prom:perf:route-transition', 'prom:route-transition', 'prometheus:route-transition']
} as const

const normalizePathname = (value: string) =>
  value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value

const shouldIgnoreConsoleMessage = (message: ConsoleMessage) => {
  const type = message.type()
  if (type !== 'error' && type !== 'warning') return true
  const text = message.text().trim()
  return ignoredConsolePatterns.some((pattern) => pattern.test(text))
}

const shouldIgnorePageError = (error: Error) =>
  ignoredPageErrorPatterns.some((pattern) => pattern.test(error.message.trim()))

const shouldIgnoreNetworkUrl = (url: string) =>
  ignoredNetworkUrlPatterns.some((pattern) => pattern.test(url))

const shouldIgnoreRequestFailure = (request: Request) => {
  const failureText = request.failure()?.errorText?.trim() ?? ''
  if (!failureText) return false
  if (failureText === 'net::ERR_ABORTED' && request.isNavigationRequest()) {
    return true
  }
  if (
    ignoredRequestFailurePatterns.some((pattern) =>
      pattern.test(`${request.url()} (${failureText})`)
    )
  ) {
    return true
  }
  return failureText === 'net::ERR_ABORTED' && request.url().includes('/api/fragments/stream')
    || failureText === 'net::ERR_ABORTED' && request.url().includes('/api/auth/get-session')
    || failureText === 'net::ERR_ABORTED' && request.url().includes('/auth/session')
    || failureText === 'net::ERR_ABORTED' && request.url().includes('/build/static-shell/')
    || failureText === 'net::ERR_ABORTED' && request.url().includes('/api/store/items')
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
    if (shouldIgnorePageError(error)) return
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

export const enablePrometheusPerfDebug = async (page: Page) => {
  await page.addInitScript(() => {
    ;(window as Window & { __PROM_STATIC_SHELL_DEBUG_PERF__?: boolean }).__PROM_STATIC_SHELL_DEBUG_PERF__ = true
  })
}

export const expectPathname = async (page: Page, expectedPathname: string) => {
  await expect
    .poll(() => normalizePathname(new URL(page.url()).pathname))
    .toBe(normalizePathname(expectedPathname))
}

const navigateToProfileAfterAuth = async (page: Page) => {
  try {
    await page.goto('/profile/', { waitUntil: 'domcontentloaded' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('net::ERR_ABORTED')) {
      throw error
    }
  }
  await expectPathname(page, '/profile')
}

const resolveDockLabels = async (page: Page) => {
  const dockMode =
    (await page.locator('[data-static-dock-mode]').first().getAttribute('data-static-dock-mode').catch(() => null)) ??
    (await page.locator('.dock-shell').first().getAttribute('data-dock-mode').catch(() => null))

  return dockMode === 'auth' ? authenticatedDockLabels : publicDockLabels
}

export const expectDockShortcuts = async (page: Page) => {
  for (const label of await resolveDockLabels(page)) {
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

  await expect
    .poll(async () => {
      const pretextHeight = await locator.getAttribute('data-pretext-card-height')
      const fragmentHint = await locator.getAttribute('data-fragment-height-hint')
      const hasPretextHeight = Boolean(pretextHeight?.match(/^\d+$/))
      const hasFragmentHint = Boolean(fragmentHint?.match(/^\d+$/))
      return hasPretextHeight || (allowFragmentHint && hasFragmentHint)
    })
    .toBe(true)
}

const readCardHeightSnapshot = async (
  locator: ReturnType<Page['locator']>
): Promise<CardHeightSnapshot> =>
  await locator.evaluate((node) => {
    const element = node as HTMLElement
    const parseHeight = (value: string | null | undefined) => {
      const parsed = Number.parseFloat(value ?? '')
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
    }

    const computed = getComputedStyle(element)

    return {
      contentHeight: Math.ceil(element.scrollHeight),
      liveMinHeight:
        parseHeight(element.style.getPropertyValue('--fragment-live-min-height')) ??
        parseHeight(computed.getPropertyValue('--fragment-live-min-height')) ??
        parseHeight(computed.minHeight),
      renderedHeight: Math.ceil(element.getBoundingClientRect().height),
      reservationHeight:
        parseHeight(element.getAttribute('data-fragment-height-hint')) ??
        parseHeight(element.getAttribute('data-pretext-card-height')) ??
        parseHeight(computed.getPropertyValue('--fragment-reserved-height'))
    }
  })

export const expectCardSettlesToContentHeight = async (
  page: Page,
  locator: ReturnType<Page['locator']>,
  {
    label,
    settleMs = 900,
    contentTolerance = 8
  }: {
    label: string
    settleMs?: number
    contentTolerance?: number
  }
) => {
  await expect(locator).toBeVisible()
  const initial = await readCardHeightSnapshot(locator)

  expect(initial.reservationHeight, `${label} should expose an initial reservation height`).not.toBeNull()

  await page.waitForTimeout(settleMs)

  const settled = await readCardHeightSnapshot(locator)
  const contentDrift = Math.abs(settled.renderedHeight - settled.contentHeight)
  expect(
    contentDrift,
    `${label} should finish within ${contentTolerance}px of its content height`
  ).toBeLessThanOrEqual(contentTolerance)

  expect(
    settled.liveMinHeight ?? 0,
    `${label} should release its live min-height floor after settling`
  ).toBeLessThanOrEqual(1)

  return { initial, settled }
}

export const expectCardShrinksBelowInitialReservation = async (
  page: Page,
  locator: ReturnType<Page['locator']>,
  {
    label,
    settleMs = 900,
    contentTolerance = 8
  }: {
    label: string
    settleMs?: number
    contentTolerance?: number
  }
) => {
  const { initial, settled } = await expectCardSettlesToContentHeight(page, locator, {
    label,
    settleMs,
    contentTolerance
  })

  expect(
    settled.renderedHeight,
    `${label} should settle below its initial reservation height`
  ).toBeLessThan(initial.reservationHeight!)

  return { initial, settled }
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

export const readPrometheusPerformance = async (page: Page): Promise<PrometheusPerfSnapshot> =>
  await page.evaluate(({ markNames }) => {
    const readTimestamp = (value: unknown) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
      return Math.round(value)
    }
    const perfDebug =
      (window as Window & { __PROM_PERF_DEBUG__?: PrometheusPerfDebugState }).__PROM_PERF_DEBUG__ ?? null
    const clientBoot =
      (window as Window & { __PROM_CLIENT_BOOT__?: ClientBootDebugState }).__PROM_CLIENT_BOOT__ ?? {
        ready: false,
        source: 'pending',
        unlockedAt: null
      }
    const marks = performance
      .getEntriesByType('mark')
      .map((entry) => ({
        name: entry.name,
        startTime: entry.startTime
      }))
      .sort((left, right) => left.startTime - right.startTime)
    const measures = performance
      .getEntriesByType('measure')
      .map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration
      }))
      .sort((left, right) => left.startTime - right.startTime)
    const findLatestMark = (names: string[]) => {
      const nameSet = new Set(names)
      const entry = [...marks].reverse().find((mark) => nameSet.has(mark.name))
      return readTimestamp(entry?.startTime)
    }
    const findLatestMeasure = (names: string[]) => {
      const nameSet = new Set(names)
      const entry = [...measures].reverse().find((measure) => nameSet.has(measure.name))
      if (!entry) return null
      return {
        startAt: readTimestamp(entry.startTime),
        endAt: readTimestamp(entry.startTime + entry.duration),
        duration: readTimestamp(entry.duration)
      }
    }
    const staticShellBootstrapAt =
      readTimestamp(perfDebug?.staticShellBootstrapAt) ?? findLatestMark(markNames.staticShellBootstrapAt)
    const workerPrewarmAt =
      readTimestamp(perfDebug?.workerPrewarmAt) ?? findLatestMark(markNames.workerPrewarmAt)
    const firstFragmentCommitAt =
      readTimestamp(perfDebug?.firstFragmentCommitAt) ?? findLatestMark(markNames.firstFragmentCommitAt)
    const firstActionableControlAt =
      readTimestamp(perfDebug?.firstActionableControlAt) ??
      findLatestMark(markNames.firstActionableControlAt) ??
      readTimestamp(clientBoot.unlockedAt)
    const debugRouteTransitions = (perfDebug?.routeTransitions ?? [])
      .map((entry) => {
        const startAt = readTimestamp(entry.startAt)
        const endAt = readTimestamp(entry.endAt)
        return {
          from: typeof entry.from === 'string' ? entry.from : null,
          to: typeof entry.to === 'string' ? entry.to : null,
          startAt,
          endAt,
          duration:
            readTimestamp(entry.duration) ??
            (startAt !== null && endAt !== null ? Math.max(0, endAt - startAt) : null)
        }
      })
      .filter((entry) => entry.startAt !== null || entry.endAt !== null || entry.duration !== null)
    const measuredRouteTransition = findLatestMeasure(markNames.routeTransition)
    const routeTransitions =
      debugRouteTransitions.length > 0
        ? debugRouteTransitions
        : measuredRouteTransition
          ? [
              {
                from: null,
                to: null,
                startAt: measuredRouteTransition.startAt,
                endAt: measuredRouteTransition.endAt,
                duration: measuredRouteTransition.duration
              }
            ]
          : []

    return {
      pathname: window.location.pathname,
      clientBoot: {
        ready: Boolean(clientBoot.ready),
        source: typeof clientBoot.source === 'string' ? clientBoot.source : 'pending',
        unlockedAt: readTimestamp(clientBoot.unlockedAt)
      },
      staticShellBootstrapAt,
      workerPrewarmAt,
      firstFragmentCommitAt,
      firstActionableControlAt,
      lastRouteTransition: routeTransitions.at(-1) ?? null,
      routeTransitions
    }
  }, { markNames: perfMarkNames })

export const expectPrometheusPerformanceSignals = async (
  page: Page,
  label: string,
  {
    requireStaticShellBootstrap = false,
    requireWorkerPrewarm = false,
    requireFirstFragmentCommit = false,
    requireFirstActionableControl = true,
    maxFirstActionableControlMs = 5000,
    expectRouteTransitionTo,
    timeoutMs = 15000
  }: {
    requireStaticShellBootstrap?: boolean
    requireWorkerPrewarm?: boolean
    requireFirstFragmentCommit?: boolean
    requireFirstActionableControl?: boolean
    maxFirstActionableControlMs?: number
    expectRouteTransitionTo?: string
    timeoutMs?: number
  } = {}
) => {
  let snapshot: PrometheusPerfSnapshot | null = null

  await expect
    .poll(async () => {
      snapshot = await readPrometheusPerformance(page)
      if (requireStaticShellBootstrap && snapshot.staticShellBootstrapAt === null) return false
      if (requireWorkerPrewarm && snapshot.workerPrewarmAt === null) return false
      if (requireFirstFragmentCommit && snapshot.firstFragmentCommitAt === null) return false
      if (requireFirstActionableControl && snapshot.firstActionableControlAt === null) return false
      if (expectRouteTransitionTo) {
        const actualTo = snapshot.lastRouteTransition?.to
        if (!actualTo || normalizePathname(actualTo) !== normalizePathname(expectRouteTransitionTo)) {
          return false
        }
      }
      return true
    }, { timeout: timeoutMs })
    .toBe(true)

  const resolvedSnapshot = snapshot!

  if (requireFirstActionableControl) {
    expect(
      resolvedSnapshot.firstActionableControlAt,
      `${label} should expose first actionable control timing`
    ).not.toBeNull()
    expect(
      resolvedSnapshot.firstActionableControlAt!,
      `${label} exceeded the first actionable control budget of ${maxFirstActionableControlMs}ms`
    ).toBeLessThanOrEqual(maxFirstActionableControlMs)
  }

  return resolvedSnapshot
}

export const readPrometheusFragmentStartup = async (
  page: Page
): Promise<PrometheusFragmentStartupSnapshot> =>
  await page.evaluate(() => {
    const readTimestamp = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null
    const clientBoot =
      (window as Window & { __PROM_CLIENT_BOOT__?: ClientBootDebugState }).__PROM_CLIENT_BOOT__ ?? {
        ready: false,
        source: 'pending',
        unlockedAt: null
      }
    const fragmentStartup =
      (window as Window & { __PROM_FRAGMENT_STARTUP_DEBUG__?: FragmentStartupDebugEntry[] })
        .__PROM_FRAGMENT_STARTUP_DEBUG__ ?? []
    const fragmentNetwork =
      (window as Window & { __PROM_FRAGMENT_NETWORK_DEBUG__?: FragmentNetworkDebugEntry[] })
        .__PROM_FRAGMENT_NETWORK_DEBUG__ ?? []
    const unlockCutoff = readTimestamp(clientBoot.unlockedAt)
    const fragmentEntriesBeforeUnlock = fragmentNetwork
      .filter((entry) => unlockCutoff === null || entry.at <= unlockCutoff)
      .sort((left, right) => left.at - right.at)
    const seenFragmentIds = new Set<string>()
    const duplicateFragmentIdsBeforeUnlock: string[] = []
    let duplicateFragmentBytesBeforeUnlock = 0

    fragmentEntriesBeforeUnlock.forEach((entry) => {
      const isStreamEntry =
        entry.source === 'fetch-stream' ||
        entry.source === 'webtransport-stream' ||
        entry.source === 'webtransport-datagram'
      if (isStreamEntry && seenFragmentIds.has(entry.id)) {
        duplicateFragmentIdsBeforeUnlock.push(entry.id)
        duplicateFragmentBytesBeforeUnlock += entry.bytes
      }
      seenFragmentIds.add(entry.id)
    })

    return {
      unlockCutoff,
      duplicateFragmentBytesBeforeUnlock,
      duplicateFragmentIdsBeforeUnlock,
      preUnlockNonCriticalRequests: fragmentStartup
        .filter((entry) => unlockCutoff === null || entry.at <= unlockCutoff)
        .filter((entry) => entry.nonCriticalIds.length > 0)
        .map((entry) => ({
          at: Math.round(entry.at),
          kind: entry.kind,
          ids: entry.ids,
          nonCriticalIds: entry.nonCriticalIds
        }))
    }
  })

export const expectNoPreUnlockFragmentWaste = async (page: Page, label: string) => {
  const snapshot = await readPrometheusFragmentStartup(page)

  expect(
    snapshot.duplicateFragmentBytesBeforeUnlock,
    `${label} should not duplicate fragment bytes before unlock`
  ).toBe(0)
  expect(
    snapshot.preUnlockNonCriticalRequests,
    `${label} should not request non-critical fragments before unlock`
  ).toEqual([])

  return snapshot
}

export const openAndCloseSettings = async (page: Page) => {
  const settingsButton = page.getByRole('button', { name: 'Settings' }).first()
  const dialog = page.locator('.settings-dropdown[role="dialog"][aria-label="Settings"]').first()

  await expect(settingsButton).toBeVisible()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await settingsButton.click()
    try {
      await expect(dialog).toBeVisible({ timeout: 1500 })
      break
    } catch (error) {
      if (attempt === 2) {
        throw error
      }
    }
  }
  await expect(dialog.locator('h2.settings-panel-title').first()).toHaveText('Settings')
  await expect(dialog.getByRole('button', { name: /Switch to (dark|light) mode/i })).toBeVisible()
  await page.keyboard.press('Escape')
  try {
    await expect(dialog).toBeHidden({ timeout: 1500 })
  } catch {
    await settingsButton.click()
    await expect(dialog).toBeHidden()
  }
}

export const readAuditCredentials = (): AuditCredentials | null => {
  const email = process.env.PROMETHEUS_E2E_EMAIL?.trim() ?? ''
  const password = process.env.PROMETHEUS_E2E_PASSWORD?.trim() ?? ''
  if (!email || !password) return null
  return { email, password }
}

const signInWithDevSession = async (page: Page) => {
  await page.goto('/login/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  const response = await page.evaluate(async () => {
    const authResponse = await fetch('/auth/dev/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        loginMethod: 'github',
        providerId: 'github'
      })
    })
    return {
      ok: authResponse.ok,
      status: authResponse.status,
      text: await authResponse.text()
    }
  })
  expect(
    response.ok,
    `Expected /auth/dev/session to succeed, received ${response.status}: ${response.text}`
  ).toBe(true)
  await navigateToProfileAfterAuth(page)
}

export const signInWithAuditCredentials = async (page: Page, credentials?: AuditCredentials | null) => {
  if (!credentials) {
    await signInWithDevSession(page)
    return
  }
  await page.goto('/login/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(credentials.email)
  await page.getByRole('textbox', { name: 'PASSWORD' }).fill(credentials.password)
  await page.getByRole('button', { name: 'SIGN IN' }).click()
  await navigateToProfileAfterAuth(page)
}
