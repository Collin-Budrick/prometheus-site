import type { RequestEvent } from '@builder.io/qwik-city'
import { renderToStream, renderToString, type RenderOptions, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import Root from './root'
import { defaultTheme, readThemeFromCookie } from '@prometheus/ui'
import { readServiceWorkerSeedFromCookie } from './shared/service-worker-seed'
import {
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_PAGE_ROOT_ATTR,
  isStaticShellPath
} from './static-shell/constants'
import { existsSync } from 'node:fs'

const HOME_STATIC_BUNDLE_PATH = 'build/static-home/src/static-shell/home-static-entry.js'
const HOME_STATIC_BUNDLE_URL = new URL(`../dist/${HOME_STATIC_BUNDLE_PATH}`, import.meta.url)

const normalizeStaticPublicBase = (base: string) => {
  const normalized = base.endsWith('/') ? base : `${base}/`
  if (normalized === '/build/') return '/'
  if (normalized === './build/' || normalized === 'build/') return './'
  if (normalized.endsWith('/build/')) {
    return normalized.slice(0, -'build/'.length)
  }
  return normalized
}

const resolvePublicBase = (opts: RenderOptions) => {
  let base = opts.base
  if (typeof base === 'function') {
    base = base(opts)
  }
  if (typeof base === 'string') {
    return normalizeStaticPublicBase(base)
  }
  const configured = import.meta.env.BASE_URL || '/'
  return normalizeStaticPublicBase(configured)
}

const hasStaticHomeBundle = () => existsSync(HOME_STATIC_BUNDLE_URL)

const stripStaticQwikScripts = (html: string) =>
  html
    .replace(/<script\b[^>]*type=["']qwik\/json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*q:func=["']qwik\/json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*>\s*document\["qFuncs_[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*>\s*\(window\.qwikevents\|\|\(window\.qwikevents=\[\]\)\)\.push[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*id=["']qwikloader["'][^>]*>[\s\S]*?<\/script>/gi, '')

const injectStaticBootstrap = (html: string, publicBase: string) => {
  const scriptTag = `<script type="module" src="${publicBase}${HOME_STATIC_BUNDLE_PATH}"></script>`
  return html.replace('</body>', `${scriptTag}</body>`)
}

const hasStaticOnlyMarker = (html: string) =>
  html.includes(`id="${STATIC_HOME_DATA_SCRIPT_ID}"`) ||
  html.includes(`id="${STATIC_FRAGMENT_DATA_SCRIPT_ID}"`) ||
  html.includes(STATIC_PAGE_ROOT_ATTR)

export default function (opts: RenderToStreamOptions) {
  const lang = opts.containerAttributes?.lang ?? opts.serverData?.locale ?? 'en'
  const requestEv = opts.serverData?.qwikcity?.ev as RequestEvent | undefined
  const pathname = requestEv?.url.pathname ?? (requestEv?.request ? new URL(requestEv.request.url).pathname : '')
  const cookieHeader = requestEv?.request.headers.get('cookie') ?? null
  const theme = requestEv ? readThemeFromCookie(cookieHeader) : null
  const swSeed = readServiceWorkerSeedFromCookie(cookieHeader)
  const disableSw = import.meta.env.VITE_DISABLE_SW === '1' || import.meta.env.VITE_DISABLE_SW === 'true'
  const containerAttributes: Record<string, string> = {
    ...opts.containerAttributes,
    lang
  }
  if (theme) {
    containerAttributes['data-theme'] = theme
  } else {
    containerAttributes['data-theme'] = defaultTheme
  }
  containerAttributes['data-sw-disabled'] = disableSw ? '1' : '0'
  if (swSeed.cleanupVersion) {
    containerAttributes['data-sw-cleanup-version'] = swSeed.cleanupVersion
  }
  if (swSeed.forceCleanup !== undefined) {
    containerAttributes['data-sw-force-cleanup'] = swSeed.forceCleanup ? '1' : '0'
  }
  if (swSeed.optOut !== undefined) {
    containerAttributes['data-sw-opt-out'] = swSeed.optOut ? '1' : '0'
  }
  const preloader = import.meta.env.PROD ? false : opts.preloader ?? { ssrPreloads: 1, maxIdlePreloads: 4 }
  const qwikLoader = import.meta.env.PROD ? 'inline' : opts.qwikLoader ?? 'inline'
  const renderOptions = {
    manifest,
    ...opts,
    preloader,
    qwikLoader,
    containerTagName: opts.containerTagName ?? 'html',
    containerAttributes
  } satisfies RenderToStreamOptions

  if (isStaticShellPath(pathname)) {
    return renderToString(<Root />, {
      ...renderOptions
    }).then((result) => {
      if (!hasStaticOnlyMarker(result.html)) {
        return result
      }
      if (!hasStaticHomeBundle()) {
        console.warn('Missing static shell bootstrap bundle; falling back to default Qwik startup.')
        return result
      }

      return {
        ...result,
        html: injectStaticBootstrap(stripStaticQwikScripts(result.html), resolvePublicBase(renderOptions))
      }
    })
  }

  return renderToStream(<Root />, {
    ...renderOptions
  })
}
