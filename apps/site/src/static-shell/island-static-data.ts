import type { Lang } from '../lang'
import type { StaticIslandRouteData, StaticIslandRouteKind } from './seed'
import { getStaticShellRouteConfig } from './constants'

export const createStaticIslandRouteData = (
  path: string,
  lang: Lang,
  island: StaticIslandRouteKind
): StaticIslandRouteData => {
  const routeConfig = getStaticShellRouteConfig(path)
  return {
    lang,
    path,
    island,
    authPolicy: routeConfig?.authPolicy ?? 'protected'
  }
}
