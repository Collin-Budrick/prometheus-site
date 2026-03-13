import { prewarmSpacetimeConnection } from '../shared/spacetime-client'
import { normalizeStaticShellRoutePath, STATIC_FRAGMENT_DATA_SCRIPT_ID } from './constants'
import type { StaticFragmentRouteData } from './fragment-static-data'
import {
  hasRegisteredStoreStaticController,
  registerStoreStaticControllerCleanup
} from './store-static-controller-state'

const STORE_STATIC_ROUTE_PATH = '/store'

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
  prewarmSpacetimeConnection()

  const { activateStoreStaticController } = await import('./controllers/store-static-controller')
  if (hasRegisteredStoreStaticController()) {
    return
  }

  const cleanup = await activateStoreStaticController({ routeData })
  registerStoreStaticControllerCleanup(cleanup)
  performance.mark?.('prom:store:fast-bootstrap-end')
}
