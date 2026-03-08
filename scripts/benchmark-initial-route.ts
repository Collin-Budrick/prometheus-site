import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

type ManifestBundle = {
  origin?: string
  origins?: string[]
  canonicalFilename?: string
  displayName?: string
  symbols?: string[]
}

type ClientBootDebugState = {
  ready: boolean
  source: string
  unlockedAt: number | null
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
  finalPath: string
  observeWindowMs: number
  longTaskCount: number
  maxLongTask: number
  totalLongTaskDuration: number
  longTasksOver50ms: number
  topLongTasks: Array<{ startTime: number; duration: number }>
  unlockSource: string
  unlockAt: number | null
  fragmentBootstrapBytesBeforeUnlock: number
  fragmentStreamBytesBeforeUnlock: number
  duplicateFragmentBytesBeforeUnlock: number
  duplicateFragmentIdsBeforeUnlock: string[]
  preUnlockHomeNonCriticalRequests: Array<{
    at: number
    kind: 'fetch' | 'stream-start'
    ids: string[]
    nonCriticalIds: string[]
  }>
  loadedBuildChunks: string[]
  loadedSettingsChunksBeforeInteraction: string[]
  loadedDemoChunksBeforeActivation: string[]
  loadedBootChunksBeforeInteraction: string[]
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:4173'
const DEFAULT_THRESHOLD_MS = 150
const DEFAULT_OBSERVE_WINDOW_MS = 3000
const DEFAULT_ROUTES = ['/', '/store', '/chat']
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

const run = async () => {
  const { baseUrl, routes, thresholdMs, observeWindowMs } = parseArgs()
  const settingsChunkNames = collectChunkNames(SETTINGS_CHUNK_PATTERNS)
  const demoChunkNames = collectChunkNames(DEMO_CHUNK_PATTERNS)
  const bootChunkNames = collectChunkNames(BOOT_CHUNK_PATTERNS)
  const browser = await chromium.launch({ headless: true })

  try {
    const results: RouteBenchmark[] = []

    for (const route of routes) {
      const page = await browser.newPage()
      await page.addInitScript(() => {
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

      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(observeWindowMs)

      const result = await page.evaluate(
        ({ settingsChunks, demoChunks, bootChunks, observeWindowMs }) => {
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
          const preUnlockHomeNonCriticalRequests = fragmentStartup
            .filter((entry) => entry.shellMode === 'static-home')
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
            fragmentBootstrapBytesBeforeUnlock,
            fragmentStreamBytesBeforeUnlock,
            duplicateFragmentBytesBeforeUnlock,
            duplicateFragmentIdsBeforeUnlock,
            preUnlockHomeNonCriticalRequests,
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
            })
          }
        },
        {
          settingsChunks: Array.from(settingsChunkNames),
          demoChunks: Array.from(demoChunkNames),
          bootChunks: Array.from(bootChunkNames),
          observeWindowMs
        }
      )

      results.push({
        route,
        scenario: 'cold-no-interaction',
        ...result
      })

      await page.close()
    }

    console.log(`Base URL: ${baseUrl}`)
    console.log(`Threshold: ${thresholdMs}ms`)
    console.log(`Observe Window: ${observeWindowMs}ms`)
    results.forEach((result) => {
      console.log(
        `${result.route} [${result.scenario}] -> longTasks=${result.longTaskCount}, over50ms=${result.longTasksOver50ms}, total=${result.totalLongTaskDuration}ms, max=${result.maxLongTask}ms, unlock=${result.unlockSource}${result.unlockAt === null ? '' : `@${result.unlockAt}ms`}, fragmentBootstrapBytes=${result.fragmentBootstrapBytesBeforeUnlock}, fragmentStreamBytes=${result.fragmentStreamBytesBeforeUnlock}, duplicateStreamBytes=${result.duplicateFragmentBytesBeforeUnlock}, homePreUnlockNonCritical=${result.preUnlockHomeNonCriticalRequests.length}, settingsChunks=${
          result.loadedSettingsChunksBeforeInteraction.join(', ') || 'none'
        }, demoChunks=${result.loadedDemoChunksBeforeActivation.join(', ') || 'none'}, bootChunks=${
          result.loadedBootChunksBeforeInteraction.join(', ') || 'none'
        }`
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
      (result) => result.route === '/' && result.preUnlockHomeNonCriticalRequests.length > 0
    )
    const hasDuplicateFragmentFailure = results.some(
      (result) => result.duplicateFragmentBytesBeforeUnlock > 0
    )
    if (
      hasLongTaskFailure ||
      hasSettingsChunkFailure ||
      hasDemoChunkFailure ||
      hasPreUnlockHomeFailure ||
      hasDuplicateFragmentFailure
    ) {
      process.exitCode = 1
    }
  } finally {
    await browser.close()
  }
}

void run()
