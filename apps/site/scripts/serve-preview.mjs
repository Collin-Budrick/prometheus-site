import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const previewEntryPath = path.resolve(siteRoot, 'server', 'entry.preview.js')
const routeShellBootstrapPath = path.resolve(siteRoot, 'src', 'shared', 'route-shell-bootstrap.ts')
const host = process.env.HOST || '127.0.0.1'
const port = Number.parseInt(process.env.PORT || '4173', 10)

const previewModule = await import(pathToFileURL(previewEntryPath).href)
const { routeShellTransitionStyle } = await import(pathToFileURL(routeShellBootstrapPath).href)
const app = previewModule.default

const ROUTE_TRANSITION_STATE_KEY = '__PROMETHEUS_ROUTE_TRANSITION__'
const ROUTE_TRANSITION_BOOTSTRAP_ATTR = 'data-route-shell-bootstrap'
const routeStyleTagPattern = /<style\b[^>]*\bdata-route-shell-transition=["']true["'][^>]*>/i
const routeBootstrapScriptPattern = /<script\b[^>]*\bdata-route-shell-bootstrap=["']true["'][^>]*>/i

const escapeAttribute = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

const routeTransitionBootstrapScript = `(function () {
  var stateKey = ${escapeScript(ROUTE_TRANSITION_STATE_KEY)};
  var normalizePath = function (value) {
    var trimmed = String(value || '').trim();
    if (!trimmed || trimmed === '/') return '/';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };
  var comparableKey = function (url) {
    return normalizePath(url.pathname) + url.search + url.hash;
  };
  var resolveAnchor = function (target) {
    return target instanceof Element ? target.closest('a[href]') : null;
  };
  var resolveRouteUrl = function (anchor) {
    if (!anchor || anchor.hasAttribute('download')) return null;
    if (anchor.target && anchor.target !== '_self') return null;
    if (!anchor.href) return null;
    try {
      var url = new URL(anchor.href, location.origin);
      return url.origin === location.origin ? url : null;
    } catch (error) {
      return null;
    }
  };
  var isHashOnlyNavigation = function (currentUrl, targetUrl) {
    return (
      normalizePath(currentUrl.pathname) === normalizePath(targetUrl.pathname) &&
      currentUrl.search === targetUrl.search &&
      currentUrl.hash !== targetUrl.hash
    );
  };
  var getDockDescriptors = function () {
    var links = Array.from(document.querySelectorAll('.dock-shell a[href], [data-route-link][href]'));
    var descriptors = [];
    var seen = Object.create(null);
    for (var index = 0; index < links.length; index += 1) {
      var anchor = links[index];
      var url = resolveRouteUrl(anchor);
      if (!url) continue;
      var key = normalizePath(url.pathname);
      if (seen[key]) continue;
      seen[key] = true;
      descriptors.push({ href: key, index: descriptors.length });
    }
    return descriptors;
  };
  var resolveDockOwner = function (pathname) {
    var descriptors = getDockDescriptors();
    var normalizedPath = normalizePath(pathname);
    var match = null;
    for (var index = 0; index < descriptors.length; index += 1) {
      var descriptor = descriptors[index];
      var candidate = descriptor.href;
      var matches = candidate === '/'
        ? normalizedPath === '/'
        : normalizedPath === candidate || normalizedPath.indexOf(candidate + '/') === 0;
      if (!matches) continue;
      if (!match || candidate.length > match.href.length) {
        match = descriptor;
      }
    }
    return match;
  };
  var resolveDirection = function (currentPathname, targetPathname) {
    if (normalizePath(currentPathname) === normalizePath(targetPathname)) {
      return 'none';
    }
    var currentOwner = resolveDockOwner(currentPathname);
    var targetOwner = resolveDockOwner(targetPathname);
    if (!currentOwner || !targetOwner || currentOwner.href === targetOwner.href) {
      return 'neutral';
    }
    return targetOwner.index > currentOwner.index ? 'forward' : 'back';
  };
  var restoreDirection = function () {
    var comparable = normalizePath(location.pathname) + location.search + location.hash;
    try {
      var raw = sessionStorage.getItem(stateKey);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.targetKey !== comparable || typeof parsed.direction !== 'string') return;
      document.documentElement.dataset.navDirection = parsed.direction;
      sessionStorage.removeItem(stateKey);
    } catch (error) {
      console.warn('Failed to restore route transition state:', error);
    }
  };
  restoreDirection();
  document.addEventListener('click', function (event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    var anchor = resolveAnchor(event.target);
    if (!anchor) return;

    var targetUrl = resolveRouteUrl(anchor);
    if (!targetUrl) return;

    var currentUrl = new URL(location.href);
    if (isHashOnlyNavigation(currentUrl, targetUrl)) {
      return;
    }

    var currentKey = comparableKey(currentUrl);
    var targetKey = comparableKey(targetUrl);
    if (currentKey === targetKey) {
      event.preventDefault();
      return;
    }

    var direction = resolveDirection(currentUrl.pathname, targetUrl.pathname);
    if (direction === 'none') {
      direction = 'neutral';
    }
    document.documentElement.dataset.navDirection = direction;

    try {
      sessionStorage.setItem(stateKey, JSON.stringify({
        direction: direction,
        targetKey: targetKey
      }));
    } catch (error) {
      console.warn('Failed to store route transition state:', error);
    }
  }, true);
})();`

const injectRouteTransitionMarkup = (html) => {
  if (!html.includes('</head>')) {
    return html
  }

  const nonceMatch = html.match(/\bnonce=(["'])([^"']+)\1/i)
  const nonceAttr = nonceMatch ? ` nonce="${escapeAttribute(nonceMatch[2])}"` : ''
  const hasRouteStyle = routeStyleTagPattern.test(html)
  const hasRouteScript = routeBootstrapScriptPattern.test(html)
  if (hasRouteStyle && hasRouteScript) {
    return html
  }

  const parts = []
  if (!hasRouteStyle) {
    parts.push(`<style data-route-shell-transition="true"${nonceAttr}>${routeShellTransitionStyle}</style>`)
  }
  if (!hasRouteScript) {
    parts.push(`<script ${ROUTE_TRANSITION_BOOTSTRAP_ATTR}="true"${nonceAttr}>${routeTransitionBootstrapScript}</script>`)
  }

  return html.replace('</head>', `${parts.join('')}</head>`)
}

if (!app) {
  throw new Error('Missing preview entry default export.')
}

const middlewares = [app.staticFile, app.router, app.notFound].filter(
  (entry) => typeof entry === 'function'
)

const server = http.createServer((req, res) => {
  const originalWrite = res.write.bind(res)
  const originalEnd = res.end.bind(res)
  const chunks = []

  res.write = (chunk, encoding, callback) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined)
    chunks.push(buffer)
    if (typeof callback === 'function') {
      callback()
    }
    return true
  }

  res.end = (chunk, encoding, callback) => {
    const resolvedEncoding = typeof encoding === 'string' ? encoding : undefined
    const resolvedCallback =
      typeof encoding === 'function'
        ? encoding
        : typeof callback === 'function'
          ? callback
          : undefined

    if (chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, resolvedEncoding)
      chunks.push(buffer)
    }

    const contentType = String(res.getHeader('content-type') || '')
    const body = Buffer.concat(chunks)
    const shouldInject = contentType.includes('text/html') || body.toString('utf8', 0, Math.min(body.length, 64)).includes('<!DOCTYPE html')

    if (!shouldInject) {
      return originalEnd(body, resolvedEncoding, resolvedCallback)
    }

    const html = injectRouteTransitionMarkup(body.toString('utf8'))
    res.setHeader('content-length', Buffer.byteLength(html))
    return originalEnd(html, 'utf8', resolvedCallback)
  }

  let index = 0

  const next = (error) => {
    if (error) {
      if (!res.headersSent) {
        res.statusCode = 500
      }
      if (!res.writableEnded) {
        res.end(error instanceof Error ? error.message : 'Preview middleware failed')
      }
      return
    }

    const middleware = middlewares[index]
    index += 1
    if (!middleware) {
      if (!res.writableEnded) {
        res.statusCode = 404
        res.end('Not found')
      }
      return
    }

    try {
      const result = middleware(req, res, next)
      if (result && typeof result.then === 'function') {
        result.catch(next)
      }
    } catch (caughtError) {
      next(caughtError)
    }
  }

  next()
})

server.listen(port, host, () => {
  console.log(`Serving preview bundle at http://${host}:${port}`)
})
