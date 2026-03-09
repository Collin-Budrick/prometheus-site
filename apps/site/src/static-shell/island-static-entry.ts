import { bootstrapStaticIslandShell } from './island-bootstrap'

declare global {
  interface Window {
    __PROM_STATIC_ISLAND_ENTRY__?: boolean
  }
}

if (typeof window !== 'undefined') {
  window.__PROM_STATIC_ISLAND_ENTRY__ = true

  void bootstrapStaticIslandShell()
    .catch((error) => {
      console.error('Static island bootstrap failed:', error)
    })
}

export {}
