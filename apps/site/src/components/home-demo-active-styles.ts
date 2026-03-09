const HOME_DEMO_ACTIVE_STYLE_ATTR = 'data-home-demo-active-styles'
const HOME_DEMO_ACTIVE_STYLE_URL = new URL('./home-demo-active.css', import.meta.url).href

export const ensureHomeDemoActiveStyles = () => {
  if (typeof document === 'undefined') return
  if (document.head.querySelector(`link[${HOME_DEMO_ACTIVE_STYLE_ATTR}]`)) return

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = HOME_DEMO_ACTIVE_STYLE_URL
  link.setAttribute(HOME_DEMO_ACTIVE_STYLE_ATTR, 'true')
  document.head.appendChild(link)
}
