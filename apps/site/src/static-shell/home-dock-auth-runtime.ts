import type { Lang } from '../lang/types'
import { loadClientAuthSession } from './auth-client'
import {
  staticDockRootNeedsSync,
  syncStaticDockRootState,
  writeStaticShellSeed
} from './seed-client'

type HomeDockController = {
  destroyed?: boolean
  isAuthenticated: boolean
  lang: Lang
  path: string
}

export const syncHomeDockIfNeeded = async (
  controller: Pick<HomeDockController, 'isAuthenticated' | 'lang' | 'path'>
) => {
  const dockState = {
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    lang: controller.lang
  }

  if (!staticDockRootNeedsSync(dockState)) {
    syncStaticDockRootState(dockState)
    return
  }

  const dockRoot = syncStaticDockRootState(dockState)
  if (!dockRoot) return

  const { syncStaticDockMarkup } = await import('./home-dock-dom')
  syncStaticDockMarkup({
    root: dockRoot,
    lang: controller.lang,
    currentPath: controller.path,
    isAuthenticated: controller.isAuthenticated,
    force: true,
    lockMetrics: true
  })
}

export const refreshHomeDockAuthIfNeeded = async (controller: HomeDockController) => {
  const session = await loadClientAuthSession()
  if (controller.destroyed) return

  const isAuthenticated = session.status === 'authenticated'
  if (controller.isAuthenticated === isAuthenticated) return

  controller.isAuthenticated = isAuthenticated
  writeStaticShellSeed({ isAuthenticated })
  await syncHomeDockIfNeeded(controller)
}
