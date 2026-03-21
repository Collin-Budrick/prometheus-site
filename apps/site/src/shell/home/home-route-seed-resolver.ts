import type { LanguageSeedPayload } from '../../lang/selection'
import type { HomeStaticBootstrapData } from './home-bootstrap-data'
import { loadStaticRouteLanguageSeed } from '../core/language-seed-client'

const hasSeedValues = (seed: LanguageSeedPayload | null | undefined) =>
  Boolean(
    seed?.lab ||
      (seed?.ui && Object.keys(seed.ui).length > 0) ||
      (seed?.demos && Object.keys(seed.demos).length > 0) ||
      (seed?.fragments && Object.keys(seed.fragments).length > 0) ||
      (seed?.fragmentHeaders && Object.keys(seed.fragmentHeaders).length > 0)
  )

export const resolveStaticHomeRouteSeed = async (
  data: Pick<HomeStaticBootstrapData, 'currentPath' | 'lang' | 'routeSeed'>,
  loadRouteSeed: typeof loadStaticRouteLanguageSeed = loadStaticRouteLanguageSeed
) => {
  if (hasSeedValues(data.routeSeed)) {
    return data.routeSeed
  }
  return await loadRouteSeed(data.currentPath, data.lang)
}
