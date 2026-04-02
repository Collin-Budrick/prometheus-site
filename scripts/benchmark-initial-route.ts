import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  chromium,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type StorageState
} from '@playwright/test'

type AuditCredentials = {
  email: string
  password: string
}

type ManifestBundle = {
  origin?: string
  origins?: string[]
  canonicalFilename?: string
  displayName?: string
  symbols?: string[]
}

type ForbiddenChunkRule = {
  label: string
  patterns: RegExp[]
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

type RouteBenchmark = {
  route: string
  scenario: 'cold-no-interaction'
  usedAuditCredentials: boolean
  routeContentLabel: string
  protectedContentVerified: boolean | null
  protectedContentLabel: string | null
  finalPath: string
  observeWindowMs: number
  longTaskCount: number
  maxLongTask: number
  totalLongTaskDuration: number
  longTasksOver50ms: number
  topLongTasks: Array<{ startTime: number; duration: number }>
  unlockSource: string
  unlockAt: number | null
  staticShellBootstrapAt: number | null
  workerPrewarmAt: number | null
  firstFragmentCommitAt: number | null
  firstActionableControlAt: number | null
  lastRouteTransition:
    | {
        from: string | null
        to: string | null
        startAt: number | null
        endAt: number | null
        duration: number | null
      }
    | null
  fragmentBootstrapBytesBeforeUnlock: number
  fragmentStreamBytesBeforeUnlock: number
  duplicateFragmentBytesBeforeUnlock: number
  duplicateFragmentIdsBeforeUnlock: string[]
  preUnlockNonCriticalRequests: Array<{
    at: number
    kind: 'fetch' | 'stream-start'
    ids: string[]
    nonCriticalIds: string[]
  }>
  loadedBuildChunks: string[]
  loadedSettingsChunksBeforeInteraction: string[]
  loadedDemoChunksBeforeActivation: string[]
  loadedBootChunksBeforeInteraction: string[]
  forbiddenChunkLoadsBeforeInteraction: Array<{
    label: string
    chunks: string[]
  }>
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:4173'
const DEFAULT_THRESHOLD_MS = 150
const DEFAULT_OBSERVE_WINDOW_MS = 3000
const DEFAULT_ROUTES = ['/', '/login', '/store', '/chat', '/settings', '/profile']
const AUTHENTICATED_ROUTE_PREFIXES = ['/chat', '/dashboard', '/profile', '/settings'] as const
const SETTINGS_CHUNK_PATTERNS = [
  /ThemeToggle/i,
  /LanguageToggle/i,
  /ShellSettingsPanel/i,
  /toggleThemeChoice/i,
  /applyLangChoice/i,
  /settings/i
]
const DEMO_CHUNK_PATTERNS = [
  /PlannerDemo/i,
  /WasmRendererDemo/i,
  /ReactBinaryDemo/i,
  /PreactIsland/i
]
const BOOT_CHUNK_PATTERNS = [
  /entry\.client/i,
  /serviceWorker/i,
  /offline/i,
  /notifications/i,
  /telemetry/i,
  /server[-_]backoff/i,
  /connectivity/i
]
const FORBIDDEN_CHUNK_RULES: ForbiddenChunkRule[] = [
  {
    label: 'gridstack',
    patterns: [/gridstack/i]
  },
  {
    label: 'arkenv',
    patterns: [/arkenv/i]
  },
  {
    label: '@ark/schema',
    patterns: [/@ark\/schema/i, /\bark[-_/]?schema\b/i]
  }
]

const parseArgs = () => {
  const args = process.argv.slice(2)
  let baseUrl = DEFAULT_BASE_URL
  let thresholdMs = DEFAULT_THRESHOLD_MS
  let observeWindowMs = DEFAULT_OBSERVE_WINDOW_MS
  const routes: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--base-url' && args[index + 1]) {
      baseUrl = args[index + 1] as string
      index += 1
      continue
    }
    if (value === '--threshold-ms' && args[index + 1]) {
      const parsed = Number.parseInt(args[index + 1] as string, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        thresholdMs = parsed
      }
      index += 1
      continue
    }
    if (value === '--observe-ms' && args[index + 1]) {
      const parsed = Number.parseInt(args[index + 1] as string, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        observeWindowMs = parsed
      }
      index += 1
      continue
    }
    routes.push(value)
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    thresholdMs,
    observeWindowMs,
    routes: routes.length ? routes : DEFAULT_ROUTES
  }
}

const normalizeRoute = (value: string) => (value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value)

const routeRequiresAuditCredentials = (route: string) => {
  const normalized = normalizeRoute(route)
  return AUTHENTICATED_ROUTE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

const readAuditCredentials = (): AuditCredentials | null => {
  const email = process.env.PROMETHEUS_E2E_EMAIL?.trim() ?? ''
  const password = process.env.PROMETHEUS_E2E_PASSWORD?.trim() ?? ''
  if (!email || !password) return null
  return { email, password }
}

const navigateToAuthenticatedProfile = async (page: Page, baseUrl: string) => {
  try {
    await page.goto(`${baseUrl}/profile/`, { waitUntil: 'domcontentloaded' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('net::ERR_ABORTED')) {
      throw error
    }
  }
  await page.waitForURL((url) => normalizeRoute(url.pathname) === '/profile', {
    timeout: 20000
  })
}

const signInWithAuditCredentials = async (
  page: Page,
  baseUrl: string,
  credentials: AuditCredentials
) => {
  await page.goto(`${baseUrl}/login/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(credentials.email)
  await page.getByRole('textbox', { name: 'PASSWORD' }).fill(credentials.password)
  await page.getByRole('button', { name: 'SIGN IN' }).click()
  await navigateToAuthenticatedProfile(page, baseUrl)
}

const signInWithDevSession = async (page: Page, baseUrl: string) => {
  await page.goto(`${baseUrl}/login/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor({ state: 'visible', timeout: 20000 })
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
  if (!response.ok) {
    throw new Error(`Dev session bootstrap failed: ${response.status} ${response.text}`.trim())
  }
  await navigateToAuthenticatedProfile(page, baseUrl)
}

const verifyBenchmarkRouteContent = async (
  page: Page,
  route: string
): Promise<{
  routeContentLabel: string
  protectedContentVerified: boolean | null
  protectedContentLabel: string | null
}> => {
  const normalizedRoute = normalizeRoute(route)

  switch (normalizedRoute) {
    case '/':
      await page.getByRole('heading', { name: 'Field brief' }).waitFor({ state: 'visible', timeout: 20000 })
      return {
        routeContentLabel: 'home heading',
        protectedContentVerified: null,
        protectedContentLabel: null
      }
    case '/login':
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor({ state: 'visible', timeout: 20000 })
      return {
        routeContentLabel: 'login heading',
        protectedContentVerified: null,
        protectedContentLabel: null
      }
    case '/store':
      await page.locator('[data-fragment-id="fragment://page/store/stream@v5"]').first().waitFor({
        state: 'visible',
        timeout: 20000
      })
      return {
        routeContentLabel: 'store stream fragment',
        protectedContentVerified: null,
        protectedContentLabel: null
      }
    case '/chat':
      await page.locator('[data-fragment-id="fragment://page/chat/search@v1"]').first().waitFor({
        state: 'visible',
        timeout: 20000
      })
      return {
        routeContentLabel: 'chat search shell',
        protectedContentVerified: true,
        protectedContentLabel: 'chat search shell'
      }
    case '/settings':
      await page.locator('[data-static-settings-toggle="read-receipts"]').first().waitFor({
        state: 'visible',
        timeout: 20000
      })
      return {
        routeContentLabel: 'settings read receipts toggle',
        protectedContentVerified: true,
        protectedContentLabel: 'settings read receipts toggle'
      }
    case '/profile':
      await page.locator('[data-static-profile-name-input]').first().waitFor({
        state: 'visible',
        timeout: 20000
      })
      return {
        routeContentLabel: 'profile name input',
        protectedContentVerified: true,
        protectedContentLabel: 'profile name input'
      }
    default:
      return {
        routeContentLabel: 'route content',
        protectedContentVerified: routeRequiresAuditCredentials(normalizedRoute) ? true : null,
        protectedContentLabel: routeRequiresAuditCredentials(normalizedRoute) ? 'protected route content' : null
      }
  }
}

const collectChunkNames = (patterns: RegExp[]) => {
  const manifestPath = resolve(process.cwd(), 'apps/site/dist/q-manifest.json')
  if (!existsSync(manifestPath)) return new Set<string>()
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    bundles?: Record<string, ManifestBundle>
  }
  const names = new Set<string>()

  Object.entries(manifest.bundles ?? {}).forEach(([name, bundle]) => {
    if (!name.endsWith('.js')) return
    const haystack = [
      name,
      bundle.displayName ?? '',
      bundle.canonicalFilename ?? '',
      bundle.origin ?? '',
      ...(bundle.symbols ?? []),
      ...(bundle.origins ?? [])
    ].join(' ')
    if (patterns.some((pattern) => pattern.test(haystack))) {
      names.add(name)
    }
  })

  return names
}

const collectForbiddenChunkNames = (rules: ForbiddenChunkRule[]) =>
  rules.map((rule) => ({
    label: rule.label,
    names: collectChunkNames(rule.patterns)
  }))

const BENCHMARK_CONTEXT_OPTIONS: BrowserContextOptions = {
  ignoreHTTPSErrors: true
}

const installBenchmarkInitScript = async (context: {
  addInitScript: (script: () => void) => Promise<void>
}) => {
  await context.addInitScript(() => {
    ;(window as Window & { __PROM_STATIC_SHELL_DEBUG_PERF__?: boolean }).__PROM_STATIC_SHELL_DEBUG_PERF__ =
      true
    const entries: Array<{ startTime: number; duration: number }> = []
    ;(window as Window & { __promLongTasks?: Array<{ startTime: number; duration: number }> }).__promLongTasks =
      entries
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        entries.push({
          startTime: entry.startTime,
          duration: entry.duration
        })
      })
    })
    observer.observe({ type: 'longtask', buffered: true })
  })
}

const prewarmBenchmarkOrigin = async (browser: Browser, baseUrl: string) => {
  const warmContext = await browser.newContext(BENCHMARK_CONTEXT_OPTIONS)
  try {
    const page = await warmContext.newPage()
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => undefined)
    } finally {
      await page.close().catch(() => undefined)
    }
  } finally {
    await warmContext.close()
  }
}

const run = async () => {
  const { baseUrl, routes, thresholdMs, observeWindowMs } = parseArgs()
  const settingsChunkNames = collectChunkNames(SETTINGS_CHUNK_PATTERNS)
  const demoChunkNames = collectChunkNames(DEMO_CHUNK_PATTERNS)
  const bootChunkNames = collectChunkNames(BOOT_CHUNK_PATTERNS)
  const forbiddenChunkNames = collectForbiddenChunkNames(FORBIDDEN_CHUNK_RULES)
  const browser = await chromium.launch({ headless: true })
  const auditCredentials = readAuditCredentials()
  let authenticatedStorageState: StorageState | null = null

  try {
    await prewarmBenchmarkOrigin(browser, baseUrl)
    const results: RouteBenchmark[] = []
    const ensureAuthenticatedStorageState = async () => {
      if (authenticatedStorageState) {
        return authenticatedStorageState
      }

      const authContext = await browser.newContext(BENCHMARK_CONTEXT_OPTIONS)
      try {
        const authPage = await authContext.newPage()
        try {
          if (auditCredentials) {
            await signInWithAuditCredentials(authPage, baseUrl, auditCredentials)
          } else {
            await signInWithDevSession(authPage, baseUrl)
          }
          authenticatedStorageState = await authContext.storageState()
          return authenticatedStorageState
        } finally {
          await authPage.close().catch(() => undefined)
        }
      } finally {
        await authContext.close()
      }
    }

    for (const route of routes) {
      const needsAuthenticatedSession = routeRequiresAuditCredentials(route)
      const storageState = needsAuthenticatedSession ? await ensureAuthenticatedStorageState() : undefined
      const routeContext = await browser.newContext({
        ...BENCHMARK_CONTEXT_OPTIONS,
        ...(storageState ? { storageState } : {})
      })
      await installBenchmarkInitScript(routeContext)
      const page = await routeContext.newPage()

      try {
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
        const contentVerification = await verifyBenchmarkRouteContent(page, route)
        await page.waitForTimeout(observeWindowMs)

        const result = await page.evaluate(
          ({ settingsChunks, demoChunks, bootChunks, forbiddenChunks, observeWindowMs }) => {
          const readTimestamp = (value: unknown) => {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
            return Math.round(value)
          }
          const perfDebug =
            (window as Window & { __PROM_PERF_DEBUG__?: PrometheusPerfDebugState }).__PROM_PERF_DEBUG__ ?? null
          const perfMarks = performance
            .getEntriesByType('mark')
            .map((entry) => ({
              name: entry.name,
              startTime: entry.startTime
            }))
            .sort((left, right) => left.startTime - right.startTime)
          const perfMeasures = performance
            .getEntriesByType('measure')
            .map((entry) => ({
              name: entry.name,
              startTime: entry.startTime,
              duration: entry.duration
            }))
            .sort((left, right) => left.startTime - right.startTime)
          const findLatestMark = (names: string[]) => {
            const nameSet = new Set(names)
            const entry = [...perfMarks].reverse().find((mark) => nameSet.has(mark.name))
            return readTimestamp(entry?.startTime)
          }
          const findLatestMeasure = (names: string[]) => {
            const nameSet = new Set(names)
            const entry = [...perfMeasures].reverse().find((measure) => nameSet.has(measure.name))
            if (!entry) return null
            return {
              startAt: readTimestamp(entry.startTime),
              endAt: readTimestamp(entry.startTime + entry.duration),
              duration: readTimestamp(entry.duration)
            }
          }
          const longTasks = (
            (window as Window & { __promLongTasks?: Array<{ startTime: number; duration: number }> })
              .__promLongTasks ?? []
          ).filter((entry) => entry.startTime <= observeWindowMs)
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
          const staticShellBootstrapAt =
            readTimestamp(perfDebug?.staticShellBootstrapAt) ??
            findLatestMark([
              'prom:perf:static-shell-bootstrap-start',
              'prom:perf:static-shell-bootstrap-end',
              'prom:static-shell-bootstrap',
              'prometheus:static-shell-bootstrap'
            ])
          const workerPrewarmAt =
            readTimestamp(perfDebug?.workerPrewarmAt) ??
            findLatestMark([
              'prom:perf:worker-prewarm',
              'prom:home:worker-instantiated',
              'prom:fragment-worker-prewarm',
              'prom:worker-prewarm',
              'prometheus:worker-prewarm'
            ])
          const firstFragmentCommitAt =
            readTimestamp(perfDebug?.firstFragmentCommitAt) ??
            findLatestMark([
              'prom:perf:first-fragment-commit',
              'prom:home:first-anchor-patch-applied',
              'prom:first-fragment-commit',
              'prometheus:first-fragment-commit'
            ])
          const firstActionableControlAt =
            readTimestamp(perfDebug?.firstActionableControlAt) ??
            findLatestMark([
              'prom:perf:first-actionable-control',
              'prom:home:lcp-release',
              'prom:first-actionable-control',
              'prom:actionable-control-ready',
              'prometheus:first-actionable-control'
            ]) ??
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
            .filter(
              (entry) => entry.startAt !== null || entry.endAt !== null || entry.duration !== null
            )
          const measuredRouteTransition = findLatestMeasure([
            'prom:perf:route-transition',
            'prom:route-transition',
            'prometheus:route-transition'
          ])
          const lastRouteTransition =
            debugRouteTransitions.at(-1) ??
            (measuredRouteTransition
              ? {
                  from: null,
                  to: null,
                  startAt: measuredRouteTransition.startAt,
                  endAt: measuredRouteTransition.endAt,
                  duration: measuredRouteTransition.duration
                }
              : null)
          const unlockCutoff = clientBoot.unlockedAt ?? observeWindowMs
          const fragmentEntriesBeforeUnlock = fragmentNetwork
            .filter((entry) => entry.at <= unlockCutoff)
            .sort((left, right) => left.at - right.at)
          const fragmentBootstrapBytesBeforeUnlock = fragmentEntriesBeforeUnlock
            .filter((entry) => entry.source === 'single' || entry.source === 'batch')
            .reduce((total, entry) => total + entry.bytes, 0)
          const fragmentStreamBytesBeforeUnlock = fragmentEntriesBeforeUnlock
            .filter(
              (entry) =>
                entry.source === 'fetch-stream' ||
                entry.source === 'webtransport-stream' ||
                entry.source === 'webtransport-datagram'
            )
            .reduce((total, entry) => total + entry.bytes, 0)
          const seenFragmentIds = new Set<string>()
          const duplicateFragmentIdsBeforeUnlock: string[] = []
          let duplicateFragmentBytesBeforeUnlock = 0
          fragmentEntriesBeforeUnlock.forEach((entry) => {
            const isStreamEntry =
              entry.source === 'fetch-stream' ||
              entry.source === 'webtransport-stream' ||
              entry.source === 'webtransport-datagram'
            if (isStreamEntry && seenFragmentIds.has(entry.id)) {
              duplicateFragmentBytesBeforeUnlock += entry.bytes
              duplicateFragmentIdsBeforeUnlock.push(entry.id)
            }
            seenFragmentIds.add(entry.id)
          })
          const preUnlockNonCriticalRequests = fragmentStartup
            .filter((entry) => entry.at <= unlockCutoff)
            .filter((entry) => entry.nonCriticalIds.length > 0)
            .map((entry) => ({
              at: Math.round(entry.at),
              kind: entry.kind,
              ids: entry.ids,
              nonCriticalIds: entry.nonCriticalIds
            }))
          const loadedBuildChunksBeforeInteraction = performance
            .getEntriesByType('resource')
            .filter((entry) => entry.startTime <= observeWindowMs)
            .map((entry) => String(entry.name))
            .filter((name) => name.includes('/build/'))
          const loadedSettingsChunksBeforeInteraction = loadedBuildChunksBeforeInteraction.filter((name) =>
            settingsChunks.some((chunk) => name.endsWith(`/${chunk}`))
          )
          const loadedDemoChunksBeforeActivation = loadedBuildChunksBeforeInteraction.filter((name) =>
            demoChunks.some((chunk) => name.endsWith(`/${chunk}`))
          )
          const loadedBootChunksBeforeInteraction = loadedBuildChunksBeforeInteraction.filter((name) =>
            bootChunks.some((chunk) => name.endsWith(`/${chunk}`))
          )
          const forbiddenChunkLoadsBeforeInteraction = forbiddenChunks.map(
            (entry: { label: string; chunks: string[] }) => ({
              label: entry.label,
              chunks: loadedBuildChunksBeforeInteraction
                .filter((name) => entry.chunks.some((chunk) => name.endsWith(`/${chunk}`)))
                .map((name) => {
                  const parts = name.split('/')
                  return parts[parts.length - 1] ?? name
                })
            })
          )

          return {
            finalPath: window.location.pathname,
            observeWindowMs,
            longTaskCount: longTasks.length,
            maxLongTask: longTasks.reduce((max, entry) => Math.max(max, Math.round(entry.duration)), 0),
            totalLongTaskDuration: Math.round(
              longTasks.reduce((total, entry) => total + entry.duration, 0)
            ),
            longTasksOver50ms: longTasks.filter((entry) => entry.duration >= 50).length,
            unlockSource: clientBoot.source,
            unlockAt: clientBoot.unlockedAt === null ? null : Math.round(clientBoot.unlockedAt),
            staticShellBootstrapAt,
            workerPrewarmAt,
            firstFragmentCommitAt,
            firstActionableControlAt,
            lastRouteTransition,
            fragmentBootstrapBytesBeforeUnlock,
            fragmentStreamBytesBeforeUnlock,
            duplicateFragmentBytesBeforeUnlock,
            duplicateFragmentIdsBeforeUnlock,
            preUnlockNonCriticalRequests,
            topLongTasks: [...longTasks]
              .sort((left, right) => right.duration - left.duration)
              .slice(0, 4)
              .map((entry) => ({
                startTime: Math.round(entry.startTime),
                duration: Math.round(entry.duration)
              })),
            loadedBuildChunks: loadedBuildChunksBeforeInteraction.map((name) => {
              const parts = name.split('/')
              return parts[parts.length - 1] ?? name
            }),
            loadedSettingsChunksBeforeInteraction: loadedSettingsChunksBeforeInteraction.map((name) => {
              const parts = name.split('/')
              return parts[parts.length - 1] ?? name
            }),
            loadedDemoChunksBeforeActivation: loadedDemoChunksBeforeActivation.map((name) => {
              const parts = name.split('/')
              return parts[parts.length - 1] ?? name
            }),
            loadedBootChunksBeforeInteraction: loadedBootChunksBeforeInteraction.map((name) => {
              const parts = name.split('/')
              return parts[parts.length - 1] ?? name
            }),
            forbiddenChunkLoadsBeforeInteraction
          }
        },
          {
            settingsChunks: Array.from(settingsChunkNames),
            demoChunks: Array.from(demoChunkNames),
            bootChunks: Array.from(bootChunkNames),
            forbiddenChunks: forbiddenChunkNames.map((entry) => ({
              label: entry.label,
              chunks: Array.from(entry.names)
            })),
            observeWindowMs
          }
        )

        results.push({
          route,
          scenario: 'cold-no-interaction',
          usedAuditCredentials: needsAuthenticatedSession,
          ...contentVerification,
          ...result
        })
      } finally {
        await page.close().catch(() => undefined)
        await routeContext.close()
      }
    }

    console.log(`Base URL: ${baseUrl}`)
    console.log(`Threshold: ${thresholdMs}ms`)
    console.log(`Observe Window: ${observeWindowMs}ms`)
    results.forEach((result) => {
      const forbiddenSummary = result.forbiddenChunkLoadsBeforeInteraction
        .map((entry) => `${entry.label}:${entry.chunks.join(', ') || 'none'}`)
        .join('; ')
      console.log(
        `${result.route} [${result.scenario}]${result.usedAuditCredentials ? ' [auth]' : ''} -> longTasks=${result.longTaskCount}, over50ms=${result.longTasksOver50ms}, total=${result.totalLongTaskDuration}ms, max=${result.maxLongTask}ms, unlock=${result.unlockSource}${result.unlockAt === null ? '' : `@${result.unlockAt}ms`}, firstControl=${
          result.firstActionableControlAt === null ? 'missing' : `${result.firstActionableControlAt}ms`
        }, staticBootstrap=${
          result.staticShellBootstrapAt === null ? 'n/a' : `${result.staticShellBootstrapAt}ms`
        }, workerPrewarm=${
          result.workerPrewarmAt === null ? 'n/a' : `${result.workerPrewarmAt}ms`
        }, firstFragmentCommit=${
          result.firstFragmentCommitAt === null ? 'n/a' : `${result.firstFragmentCommitAt}ms`
        }, routeTransition=${
          result.lastRouteTransition?.duration === null || result.lastRouteTransition === null
            ? 'none'
            : `${result.lastRouteTransition.duration}ms`
        }, routeContent=${result.routeContentLabel}, protectedContent=${
          result.protectedContentVerified === null
            ? 'n/a'
            : `${result.protectedContentVerified ? 'verified' : 'missing'}:${result.protectedContentLabel ?? 'protected content'}`
        }, fragmentBootstrapBytes=${result.fragmentBootstrapBytesBeforeUnlock}, fragmentStreamBytes=${result.fragmentStreamBytesBeforeUnlock}, duplicateStreamBytes=${result.duplicateFragmentBytesBeforeUnlock}, preUnlockNonCritical=${result.preUnlockNonCriticalRequests.length}, settingsChunks=${
          result.loadedSettingsChunksBeforeInteraction.join(', ') || 'none'
        }, demoChunks=${result.loadedDemoChunksBeforeActivation.join(', ') || 'none'}, bootChunks=${
          result.loadedBootChunksBeforeInteraction.join(', ') || 'none'
        }, forbiddenChunks=${forbiddenSummary}`
      )
    })
    console.log(JSON.stringify({ baseUrl, thresholdMs, observeWindowMs, results }, null, 2))

    const hasLongTaskFailure = results.some((result) => result.maxLongTask > thresholdMs)
    const hasSettingsChunkFailure = results.some(
      (result) => result.route === '/' && result.loadedSettingsChunksBeforeInteraction.length > 0
    )
    const hasDemoChunkFailure = results.some(
      (result) => result.route === '/' && result.loadedDemoChunksBeforeActivation.length > 0
    )
    const hasPreUnlockHomeFailure = results.some(
      (result) => result.preUnlockNonCriticalRequests.length > 0
    )
    const hasDuplicateFragmentFailure = results.some(
      (result) => result.duplicateFragmentBytesBeforeUnlock > 0
    )
    const hasFirstActionableFailure = results.some(
      (result) => result.firstActionableControlAt === null || result.firstActionableControlAt > observeWindowMs
    )
    const hasForbiddenChunkFailure = results.some((result) =>
      result.forbiddenChunkLoadsBeforeInteraction.some((entry) => entry.chunks.length > 0)
    )
    const hasProtectedContentFailure = results.some(
      (result) => result.protectedContentVerified === false
    )
    if (
      hasLongTaskFailure ||
      hasSettingsChunkFailure ||
      hasDemoChunkFailure ||
      hasPreUnlockHomeFailure ||
      hasDuplicateFragmentFailure ||
      hasFirstActionableFailure ||
      hasForbiddenChunkFailure ||
      hasProtectedContentFailure
    ) {
      process.exitCode = 1
    }
  } finally {
    await browser.close()
  }
}

void run()
