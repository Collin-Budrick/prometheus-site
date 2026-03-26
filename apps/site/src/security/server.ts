import type { RequestEvent } from '@builder.io/qwik-city'
import { randomBytes } from 'node:crypto'
import { appConfig, type PublicAppConfig } from '../site-config'
import { isHomeStaticPath } from '../shell/core/constants'
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
  allowDevServer?: boolean
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

const shouldAllowViteDevServer = (allowDevServer?: boolean) =>
  allowDevServer ?? import.meta.env.VITE_STATIC_SHELL_DEV_SOURCE === '1'

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
  config: PublicAppConfig = appConfig,
  options?: Pick<SiteCspOptions, 'allowDevServer'>
) => {
  const allowDevServer = shouldAllowViteDevServer(options?.allowDevServer)
  const apiOrigin = resolveHttpOrigin(config.apiBase, currentOrigin)
  const spacetimeAuthOrigin = resolveHttpOrigin(config.spacetimeAuthAuthority, currentOrigin)
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
    allowDevServer ? toSocketOrigin(currentOrigin) : null,
    apiOrigin,
    toSocketOrigin(apiOrigin),
    spacetimeAuthOrigin,
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
  config = appConfig,
  allowDevServer
}: SiteCspOptions) => {
  const enableViteDevScripts = shouldAllowViteDevServer(allowDevServer)
  const relaxedScriptPolicy = requiresDynamicScriptEvaluation(config)
  const requiresWasmCompilation = requiresWebAssemblyCompilation(pathname)
  const scriptSrcTokens = [
    ...(enableViteDevScripts ? ["'self'"] : [`'nonce-${nonce}'`, "'strict-dynamic'"]),
    "'unsafe-inline'",
    ...(relaxedScriptPolicy ? ["'unsafe-eval'"] : []),
    ...(requiresWasmCompilation ? ["'wasm-unsafe-eval'"] : []),
    'https:',
    'http:',
    "'inline-speculation-rules'"
  ]

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
    `connect-src ${buildSiteConnectSrc(currentOrigin, config, { allowDevServer }).join(' ')}`,
    `worker-src 'self'`,
    `manifest-src 'self'`
  ]

  if (!enableViteDevScripts) {
    directives.push(
      `trusted-types ${TRUSTED_TYPES_SERVER_POLICY_NAME} ${TRUSTED_TYPES_TEMPLATE_POLICY_NAME} ${TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME}`,
      `require-trusted-types-for 'script'`
    )
  }

  return directives.join('; ')
}
