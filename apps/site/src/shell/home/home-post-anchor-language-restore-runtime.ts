import type { HomeStaticBootstrapData } from './home-bootstrap-data'
import { loadHomeLanguageRuntime } from './runtime-loaders'
import type { HomeControllerState } from './home-active-controller'
import { resolvePreferredStaticHomeLang } from './home-language-preference'

type RestorePreferredStaticHomeLanguageIfNeededOptions = {
  controller: HomeControllerState
  data: HomeStaticBootstrapData
  bootstrapStaticHome: () => Promise<void>
  destroyActiveController: () => Promise<void>
}

export const restorePreferredStaticHomeLanguageIfNeeded = async ({
  controller,
  data,
  bootstrapStaticHome,
  destroyActiveController
}: RestorePreferredStaticHomeLanguageIfNeededOptions) => {
  if (controller.destroyed) {
    return false
  }

  const preferredLang = resolvePreferredStaticHomeLang(data.lang)
  if (preferredLang === data.lang) {
    return false
  }

  try {
    const { restorePreferredStaticHomeLanguage } = await loadHomeLanguageRuntime()
    return await restorePreferredStaticHomeLanguage({
      current: data,
      preferredLang,
      destroyActiveController,
      bootstrapStaticHome
    })
  } catch (error) {
    console.error('Failed to restore preferred home language snapshot:', error)
    return false
  }
}
