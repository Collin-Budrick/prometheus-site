const STATIC_SHELL_BUNDLE_MARKER = 'build/static-shell/'

type ScriptLike = {
  getAttribute?: (name: string) => string | null
  src?: string
}

type ResolveStaticAssetOptions = {
  origin?: string
  scripts?: ArrayLike<ScriptLike> | Iterable<ScriptLike>
}

const withTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`)

const readScriptSrc = (script: ScriptLike) => script.src ?? script.getAttribute?.('src') ?? ''

export const resolveStaticAssetBase = ({ origin, scripts }: ResolveStaticAssetOptions = {}) => {
  const fallbackOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  const fallbackBase = withTrailingSlash(fallbackOrigin)
  const availableScripts = scripts ?? (typeof document !== 'undefined' ? document.scripts : [])
  const script = Array.from(availableScripts).find((entry) => readScriptSrc(entry).includes(STATIC_SHELL_BUNDLE_MARKER))
  const scriptSrc = script ? readScriptSrc(script) : ''

  if (!scriptSrc) {
    return fallbackBase
  }

  const markerIndex = scriptSrc.indexOf(STATIC_SHELL_BUNDLE_MARKER)
  if (markerIndex < 0) {
    return fallbackBase
  }

  return scriptSrc.slice(0, markerIndex)
}

export const resolveStaticAssetUrl = (assetPath: string, options?: ResolveStaticAssetOptions) =>
  new URL(assetPath, resolveStaticAssetBase(options)).toString()
