import { bootstrapStaticFragmentShell } from './static-bootstrap'

declare global {
  interface Window {
    __PROM_STATIC_FRAGMENT_ENTRY__?: boolean
  }
}

if (typeof window !== 'undefined') {
  window.__PROM_STATIC_FRAGMENT_ENTRY__ = true

  void bootstrapStaticFragmentShell()
    .catch((error) => {
      console.error('Static fragment bootstrap failed:', error)
    })
}

export {}
