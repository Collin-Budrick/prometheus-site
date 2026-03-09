import { bootstrapStaticHome } from './home-bootstrap'

declare global {
  interface Window {
    __PROM_STATIC_HOME_ENTRY__?: boolean
  }
}

if (typeof window !== 'undefined') {
  window.__PROM_STATIC_HOME_ENTRY__ = true

  void bootstrapStaticHome()
    .catch((error) => {
      console.error('Static home bootstrap failed:', error)
    })
}

export {}
