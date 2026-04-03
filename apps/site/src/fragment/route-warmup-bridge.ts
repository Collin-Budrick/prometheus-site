import { fragmentPlanCache } from './plan-cache'
import { createRouteFragmentWarmupManager } from './route-warmup'
import { ROUTE_WARMUP_STATE_KEY, buildUserFragmentCacheScope } from './cache-scope'
import { getPersistentRuntimeCache } from './runtime/persistent-cache-instance'

type RouteWarmupState = {
  publicHrefs?: string[]
  authHrefs?: string[]
  isAuthenticated?: boolean
  userCacheKey?: string | null
}

type FragmentRouteWarmupBridgeWindow = Window & typeof globalThis & {
  __PROM_FRAGMENT_ROUTE_WARMUP_BRIDGE__?: boolean
  [ROUTE_WARMUP_STATE_KEY]?: RouteWarmupState
}

const persistentFragmentRuntimeCache = getPersistentRuntimeCache()
let fragmentWarmupManager: ReturnType<typeof createRouteFragmentWarmupManager> | null = null

const getFragmentWarmupManager = (win: FragmentRouteWarmupBridgeWindow) => {
  fragmentWarmupManager ??= createRouteFragmentWarmupManager({
    payloadCache: persistentFragmentRuntimeCache,
    pageWindow: win
  })
  return fragmentWarmupManager
}

const resolveRouteWarmupState = (win: FragmentRouteWarmupBridgeWindow) =>
  win[ROUTE_WARMUP_STATE_KEY] ?? null

const clearScopedFragmentCaches = async (scopeKey?: string | null) => {
  if (!scopeKey) {
    fragmentPlanCache.clear?.()
    await persistentFragmentRuntimeCache.clearAllPayloads()
    return
  }
  fragmentPlanCache.clearScope?.(scopeKey)
  await persistentFragmentRuntimeCache.clearPayloadScope(scopeKey)
}

const warmFragmentRoutes = (
  win: FragmentRouteWarmupBridgeWindow,
  audience: 'public' | 'auth',
  force = false
) => {
  const warmup = resolveRouteWarmupState(win)
  if (!warmup) return
  const hrefs = audience === 'public' ? warmup.publicHrefs ?? [] : warmup.authHrefs ?? []
  if (!hrefs.length) return
  if (audience === 'auth' && !warmup.userCacheKey) return
  getFragmentWarmupManager(win).warmIdleRoutes(hrefs, force ? { force: true } : undefined)
}

export const installFragmentRouteWarmupBridge = ({
  win = typeof window !== 'undefined' ? (window as FragmentRouteWarmupBridgeWindow) : null,
  doc = typeof document !== 'undefined' ? document : null
}: {
  win?: FragmentRouteWarmupBridgeWindow | null
  doc?: Document | null
} = {}) => {
  if (!win || !doc || win.__PROM_FRAGMENT_ROUTE_WARMUP_BRIDGE__) {
    return () => undefined
  }

  win.__PROM_FRAGMENT_ROUTE_WARMUP_BRIDGE__ = true

  const handleWarmPublic = () => {
    warmFragmentRoutes(win, 'public')
  }
  const handleWarmUser = () => {
    warmFragmentRoutes(win, 'auth')
  }
  const handleForceWarm = () => {
    warmFragmentRoutes(win, 'public', true)
    warmFragmentRoutes(win, 'auth', true)
  }
  const handleCacheCleared = (event: Event) => {
    const detail = event instanceof CustomEvent ? (event.detail as Record<string, unknown> | undefined) : undefined
    void clearScopedFragmentCaches(
      detail?.scope === 'user' && typeof detail.userCacheKey === 'string'
        ? buildUserFragmentCacheScope(detail.userCacheKey)
        : null
    )
  }
  const warmInitialFragments = () => {
    handleWarmPublic()
    handleWarmUser()
  }

  win.addEventListener('prom:sw-warm-public', handleWarmPublic)
  win.addEventListener('prom:sw-warm-user', handleWarmUser)
  win.addEventListener('prom:sw-manual-refresh', handleForceWarm)
  win.addEventListener('prom:sw-refresh-cache', handleForceWarm)
  win.addEventListener('prom:sw-cache-cleared', handleCacheCleared)

  if (doc.readyState === 'complete') {
    warmInitialFragments()
  } else {
    win.addEventListener('load', warmInitialFragments, { once: true })
  }

  return () => {
    win.removeEventListener('prom:sw-warm-public', handleWarmPublic)
    win.removeEventListener('prom:sw-warm-user', handleWarmUser)
    win.removeEventListener('prom:sw-manual-refresh', handleForceWarm)
    win.removeEventListener('prom:sw-refresh-cache', handleForceWarm)
    win.removeEventListener('prom:sw-cache-cleared', handleCacheCleared)
    win.__PROM_FRAGMENT_ROUTE_WARMUP_BRIDGE__ = false
  }
}
