import { appendStaticAssetVersion, resolveStaticAssetVersion } from './asset-version'

const STATIC_SHELL_BUNDLE_MARKER = 'build/static-shell/'
const STATIC_SHELL_SOURCE_PREFIX = 'build/static-shell/apps/site/src/'
const STATIC_SHELL_DEV_SOURCE_PREFIX = 'src/'

type ScriptLike = {
  getAttribute?: (name: string) => string | null
  src?: string
}

type StaticAssetModeOptions = {
  preferSourceModules?: boolean
}

type ResolveStaticAssetOptions = {
  origin?: string
  scripts?: ArrayLike<ScriptLike> | Iterable<ScriptLike>
  version?: string | null
} & StaticAssetModeOptions

type ResolveStaticAssetHrefOptions = {
  publicBase: string
  version?: string | null
} & StaticAssetModeOptions

type StaticShellImportMetaEnv = {
  VITE_STATIC_SHELL_DEV_SOURCE?: string
}

const withTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`)
const normalizePublicBase = (value: string) =>
  value === './' ? './' : withTrailingSlash(value.startsWith('/') ? value : `/${value}`)

const readScriptSrc = (script: ScriptLike) => script.src ?? script.getAttribute?.('src') ?? ''

const readStaticShellDevSourceFlag = () =>
  (typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: StaticShellImportMetaEnv }).env?.VITE_STATIC_SHELL_DEV_SOURCE
    : undefined) === '1'

const shouldUseStaticShellSourceModules = (preferSourceModules?: boolean) =>
  preferSourceModules ?? readStaticShellDevSourceFlag()

const toStaticShellSourceModulePath = (assetPath: string) => {
  const normalizedAssetPath = assetPath.replace(/^\/+/, '')
  if (!normalizedAssetPath.startsWith(STATIC_SHELL_SOURCE_PREFIX) || !normalizedAssetPath.endsWith('.js')) {
    return normalizedAssetPath
  }
  const relativePath = normalizedAssetPath
    .slice(STATIC_SHELL_SOURCE_PREFIX.length, -'.js'.length)
    .replace(/\\/g, '/')
  return `${STATIC_SHELL_DEV_SOURCE_PREFIX}${relativePath}.ts`
}

export const resolveStaticAssetBase = ({ origin, scripts }: ResolveStaticAssetOptions = {}) => {
  const fallbackOrigin =
    origin ??
    (typeof window !== 'undefined' && typeof window.location?.origin === 'string'
      ? window.location.origin
      : 'http://localhost')
  const fallbackBase = withTrailingSlash(fallbackOrigin)
  const availableScripts =
    scripts ??
    (typeof document !== 'undefined' && document.scripts ? document.scripts : [])
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

export const resolveStaticAssetRequestPath = (assetPath: string, options?: StaticAssetModeOptions) =>
  shouldUseStaticShellSourceModules(options?.preferSourceModules)
    ? toStaticShellSourceModulePath(assetPath)
    : assetPath.replace(/^\/+/, '')

export const resolveStaticAssetPublicHref = (
  assetPath: string,
  { publicBase, version, preferSourceModules }: ResolveStaticAssetHrefOptions
) => {
  const requestPath = resolveStaticAssetRequestPath(assetPath, { preferSourceModules })
  const normalizedBase = normalizePublicBase(publicBase)
  const href =
    normalizedBase === './'
      ? `./${requestPath}`
      : `${normalizedBase}${requestPath}`

  if (shouldUseStaticShellSourceModules(preferSourceModules)) {
    return href
  }

  return appendStaticAssetVersion(href, version)
}

export const resolveStaticAssetUrl = (assetPath: string, options?: ResolveStaticAssetOptions) => {
  const requestPath = resolveStaticAssetRequestPath(assetPath, options)
  const url = new URL(requestPath, resolveStaticAssetBase(options)).toString()

  if (shouldUseStaticShellSourceModules(options?.preferSourceModules)) {
    return url
  }

  return appendStaticAssetVersion(url, resolveStaticAssetVersion(options))
}

export { shouldUseStaticShellSourceModules }
