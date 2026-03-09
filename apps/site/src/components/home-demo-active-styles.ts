const HOME_DEMO_ACTIVE_STYLE_ATTR = 'data-home-demo-active-styles'
const HOME_DEMO_ACTIVE_STYLE_URL = new URL('./home-demo-active.css', import.meta.url).href
const HOME_DEMO_ACTIVE_STYLE_READY_ATTR = 'data-home-demo-active-styles-ready'

let homeDemoActiveStylesPromise: Promise<void> | null = null

export const ensureHomeDemoActiveStyles = () => {
  if (typeof document === 'undefined') return Promise.resolve()

  const existing = document.head.querySelector<HTMLLinkElement>(`link[${HOME_DEMO_ACTIVE_STYLE_ATTR}]`)
  if (existing?.getAttribute(HOME_DEMO_ACTIVE_STYLE_READY_ATTR) === 'true') {
    return Promise.resolve()
  }
  if (homeDemoActiveStylesPromise) {
    return homeDemoActiveStylesPromise
  }

  const link = existing ?? document.createElement('link')
  if (!existing) {
    link.rel = 'stylesheet'
    link.href = HOME_DEMO_ACTIVE_STYLE_URL
    link.setAttribute(HOME_DEMO_ACTIVE_STYLE_ATTR, 'true')
    document.head.appendChild(link)
  }

  homeDemoActiveStylesPromise = new Promise((resolve) => {
    const finish = () => {
      link.setAttribute(HOME_DEMO_ACTIVE_STYLE_READY_ATTR, 'true')
      homeDemoActiveStylesPromise = Promise.resolve()
      resolve()
    }
    const handleLoad = () => {
      link.removeEventListener('load', handleLoad)
      link.removeEventListener('error', handleError)
      finish()
    }
    const handleError = () => {
      console.warn('Failed to load home demo active styles.')
      link.removeEventListener('load', handleLoad)
      link.removeEventListener('error', handleError)
      finish()
    }

    link.addEventListener('load', handleLoad, { once: true })
    link.addEventListener('error', handleError, { once: true })

    // Browsers may not fire load for already-complete stylesheets during BFCache restores.
    if (link.sheet) {
      handleLoad()
    }
  })

  return homeDemoActiveStylesPromise
}
