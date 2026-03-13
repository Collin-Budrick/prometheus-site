import { primeTrustedTypesPolicies } from '../security/client'
import {
  bindHomeDemoActivation,
  type HomeDemoController
} from './home-demo-controller'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { normalizeHomeDemoAssetMap } from './home-demo-runtime-types'

type HomeDemoEntryWindow = Window & {
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean
}

type InstallHomeDemoEntryOptions = {
  win?: HomeDemoEntryWindow | null
  doc?: Document | null
}

const destroyHomeDemoController = (controller: HomeDemoController) => {
  controller.destroyed = true
  for (const result of controller.demoRenders.values()) {
    result.cleanup()
  }
  controller.demoRenders.clear()
  controller.pendingDemoRoots.clear()
}

export const installHomeDemoEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeDemoEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null
}: InstallHomeDemoEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_DEMO_ENTRY__) {
    return () => undefined
  }

  const data = readStaticHomeBootstrapData({ doc })
  if (!data) {
    return () => undefined
  }

  primeTrustedTypesPolicies()
  win.__PROM_STATIC_HOME_DEMO_ENTRY__ = true
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    performance.mark('prom:home:demo-entry-install')
  }

  const controller: HomeDemoController = {
    path: data.currentPath,
    lang: data.lang,
    fragmentOrder: data.fragmentOrder,
    planSignature: data.planSignature ?? '',
    assets: normalizeHomeDemoAssetMap(data.homeDemoAssets),
    demoRenders: new Map(),
    pendingDemoRoots: new Set(),
    destroyed: false
  }

  const manager = bindHomeDemoActivation({ controller })
  manager.observeWithin(doc)

  return () => {
    manager.destroy()
    destroyHomeDemoController(controller)
    win.__PROM_STATIC_HOME_DEMO_ENTRY__ = false
  }
}

if (typeof window !== 'undefined') {
  installHomeDemoEntry()
}
