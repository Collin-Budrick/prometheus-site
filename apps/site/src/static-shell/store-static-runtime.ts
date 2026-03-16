import {
  normalizeStaticShellRoutePath,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_FRAGMENT_PAINT_ATTR
} from './constants'
import type { StaticFragmentRouteData } from './fragment-static-data'
import {
  hasRegisteredStoreStaticController,
  registerStoreStaticControllerCleanup
} from './store-static-controller-state'
import { releaseQueuedReadyStaggerWithin } from '@prometheus/ui/ready-stagger'

const STORE_STATIC_ROUTE_PATH = '/store'
const STATIC_FRAGMENT_READY_STAGGER_SELECTOR =
  '[data-static-fragment-root] .fragment-card[data-ready-stagger-state="queued"]'

const readJsonScript = <T,>(id: string) => {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLScriptElement) || !element.textContent) return null
  try {
    return JSON.parse(element.textContent) as T
  } catch {
    return null
  }
}

export const bootstrapStaticStoreShell = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  if (hasRegisteredStoreStaticController()) {
    return
  }

  const routeData = readJsonScript<StaticFragmentRouteData>(STATIC_FRAGMENT_DATA_SCRIPT_ID)
  if (!routeData || normalizeStaticShellRoutePath(routeData.path) !== STORE_STATIC_ROUTE_PATH) {
    return
  }

  performance.mark?.('prom:store:fast-bootstrap-start')

  const { activateStoreStaticController } = await import('./controllers/store-static-controller')
  if (hasRegisteredStoreStaticController()) {
    return
  }

  const cleanup = await activateStoreStaticController({ routeData })
  registerStoreStaticControllerCleanup(cleanup)
  const root = document.querySelector<HTMLElement>('[data-static-fragment-root]')
  root?.setAttribute(STATIC_FRAGMENT_PAINT_ATTR, 'ready')
  releaseQueuedReadyStaggerWithin({
    root: document,
    queuedSelector: STATIC_FRAGMENT_READY_STAGGER_SELECTOR,
    group: 'static-fragment-ready'
  })
  performance.mark?.('prom:store:fast-bootstrap-end')
}
