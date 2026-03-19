import { loadHomeAnchorCore } from './home-anchor-core-loader'

export const installHomeStaticAnchorEntry = (
  options?: Record<string, unknown>
) => {
  let cleanup: (() => void) | undefined
  let disposed = false

  void loadHomeAnchorCore()
    .then(({ installHomeStaticAnchorEntry }) => {
      if (disposed) {
        return
      }
      cleanup = installHomeStaticAnchorEntry(options)
    })
    .catch((error) => {
      console.error('Static home anchor entry failed:', error)
    })

  return () => {
    disposed = true
    cleanup?.()
  }
}

if (typeof window !== 'undefined') {
  installHomeStaticAnchorEntry()
}
