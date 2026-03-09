declare global {
  interface Window {
    __PROM_STATIC_HOME_ENTRY__?: boolean
  }
}

if (typeof window !== 'undefined') {
  window.__PROM_STATIC_HOME_ENTRY__ = true

  void import('./static-entry')
    .then(({ bootstrapStaticEntry }) => bootstrapStaticEntry())
    .catch((error) => {
      console.error('Static shell bootstrap failed:', error)
    })
}

export {}
