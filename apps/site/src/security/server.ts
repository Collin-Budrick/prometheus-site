import type { RequestEvent } from '@builder.io/qwik-city'
import { randomBytes } from 'node:crypto'
import { appConfig, type PublicAppConfig } from '../public-app-config'
import { isHomeStaticPath } from '../static-shell/constants'
import {
  CSP_NONCE_SHARED_MAP_KEY,
  TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME,
  TRUSTED_TYPES_SERVER_POLICY_NAME,
  TRUSTED_TYPES_TEMPLATE_POLICY_NAME
} from './shared'

type RequestLike = {
  sharedMap: Map<string, unknown>
}

type SiteCspOptions = {
  nonce: string
  currentOrigin: string
  pathname?: string
  config?: PublicAppConfig
}

const resolveHttpOrigin = (value: string | undefined, fallbackOrigin: string) => {
  if (!value) return null

  try {
    const url = new URL(value, fallbackOrigin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

const toSocketOrigin = (origin: string | null) => {
  if (!origin) return null

  try {
    const url = new URL(origin)
    if (url.protocol === 'http:') {
      url.protocol = 'ws:'
      return url.origin
    }
    if (url.protocol === 'https:') {
      url.protocol = 'wss:'
      return url.origin
    }
  } catch {
    return null
  }

  return null
}

const uniqueValues = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))

export const generateCspNonce = () => randomBytes(18).toString('base64')

export const getOrCreateRequestCspNonce = (requestLike: RequestLike | RequestEvent) => {
  const cached = requestLike.sharedMap.get(CSP_NONCE_SHARED_MAP_KEY)
  if (typeof cached === 'string' && cached.length > 0) {
    return cached
  }

  const nextNonce = generateCspNonce()
  requestLike.sharedMap.set(CSP_NONCE_SHARED_MAP_KEY, nextNonce)
  return nextNonce
}

export const buildSiteConnectSrc = (
  currentOrigin: string,
  config: PublicAppConfig = appConfig
) => {
  const apiOrigin = resolveHttpOrigin(config.apiBase, currentOrigin)
  const spacetimeDbOrigin = resolveHttpOrigin(config.spacetimeDbUri, currentOrigin)
  const webTransportOrigin =
    config.enableFragmentStreaming && (config.preferWebTransport || config.preferWebTransportDatagrams)
      ? resolveHttpOrigin(config.webTransportBase, currentOrigin)
      : null
  const analyticsOrigin =
    config.analytics?.enabled && config.analytics.beaconUrl
      ? resolveHttpOrigin(config.analytics.beaconUrl, currentOrigin)
      : null

  return uniqueValues([
    "'self'",
    currentOrigin,
    apiOrigin,
    toSocketOrigin(apiOrigin),
    spacetimeDbOrigin,
    toSocketOrigin(spacetimeDbOrigin),
    webTransportOrigin,
    analyticsOrigin
  ])
}

const requiresDynamicScriptEvaluation = (config: PublicAppConfig) =>
  Boolean(config.spacetimeDbUri || config.spacetimeDbModule)

const requiresWebAssemblyCompilation = (pathname: string | undefined) =>
  Boolean(pathname && isHomeStaticPath(pathname))

export const buildSiteCsp = ({
  nonce,
  currentOrigin,
  pathname,
  config = appConfig
}: SiteCspOptions) => {
  const relaxedScriptPolicy = requiresDynamicScriptEvaluation(config)
  const requiresWasmCompilation = requiresWebAssemblyCompilation(pathname)
  const scriptSrcTokens = [`'nonce-${nonce}'`, `'strict-dynamic'`, `'unsafe-inline'`, 'https:', 'http:', "'inline-speculation-rules'"]

  if (relaxedScriptPolicy) {
    scriptSrcTokens.splice(3, 0, "'unsafe-eval'")
  }

  if (requiresWasmCompilation) {
    scriptSrcTokens.splice(relaxedScriptPolicy ? 4 : 3, 0, "'wasm-unsafe-eval'")
  }

  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `script-src ${scriptSrcTokens.join(' ')}`,
    `script-src-attr 'none'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${buildSiteConnectSrc(currentOrigin, config).join(' ')}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `trusted-types ${TRUSTED_TYPES_SERVER_POLICY_NAME} ${TRUSTED_TYPES_TEMPLATE_POLICY_NAME} ${TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME}`,
    `require-trusted-types-for 'script'`
  ]

  return directives.join('; ')
}
