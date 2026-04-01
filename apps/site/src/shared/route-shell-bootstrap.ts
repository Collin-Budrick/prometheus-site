import { TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME } from '../security/shared'
import type { RouteSafetyMode } from './route-navigation'

export type RouteShellBootstrapDescriptor = {
  href: string
  rootHref: string
  index: number
  safety: RouteSafetyMode
}

const ROUTE_TRANSITION_STATE_KEY = '__PROMETHEUS_ROUTE_TRANSITION__'
const CSP_NONCE_ATTR = 'data-csp-nonce'
const ROUTE_FALLBACK_ANIMATION_DURATION_MS = 420

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

export const routeShellTransitionStyle = `@view-transition {
  navigation: auto;
}
@supports (view-transition-name: none) {
  [data-view-transition="shell-header"] {
    view-transition-name: shell-header;
  }
  [data-view-transition="shell-main"] {
    view-transition-name: shell-main;
  }
  .dock-shell {
    view-transition-name: dock-shell;
  }
  :root[data-theme-direction] [data-view-transition],
  :root[data-theme-direction] .dock-shell,
  :root[data-theme-direction] .viewport-fade {
    view-transition-name: none !important;
  }
  ::view-transition-old(shell-header),
  ::view-transition-new(shell-header) {
    animation-duration: var(--view-transition-duration, 220ms);
    animation-timing-function: var(--view-transition-ease, cubic-bezier(0.22, 1, 0.36, 1));
  }
  ::view-transition-old(shell-main),
  ::view-transition-new(shell-main) {
    animation-duration: var(--view-transition-duration-long, 360ms);
    animation-timing-function: var(--view-transition-ease, cubic-bezier(0.22, 1, 0.36, 1));
    animation-fill-mode: both;
  }
  ::view-transition-old(shell-main) {
    animation-name: slide-out-left;
  }
  ::view-transition-new(shell-main) {
    animation-name: slide-in-right;
  }
  :root[data-nav-direction="back"]::view-transition-old(shell-main) {
    animation-name: slide-out-right;
  }
  :root[data-nav-direction="back"]::view-transition-new(shell-main) {
    animation-name: slide-in-left;
  }
  :root[data-nav-direction="neutral"]::view-transition-old(shell-main) {
    animation-name: lang-fade-out;
  }
  :root[data-nav-direction="neutral"]::view-transition-new(shell-main) {
    animation-name: lang-fade-in;
  }
  :root[data-nav-fallback="forward"] [data-view-transition="shell-main"] {
    animation: slide-in-right var(--view-transition-duration-long, 360ms)
      var(--view-transition-ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
  }
  :root[data-nav-fallback="back"] [data-view-transition="shell-main"] {
    animation: slide-in-left var(--view-transition-duration-long, 360ms)
      var(--view-transition-ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
  }
  :root[data-nav-fallback="neutral"] [data-view-transition="shell-main"] {
    animation: lang-fade-in var(--view-transition-duration-long, 360ms)
      var(--view-transition-ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
  }
}
@media (prefers-reduced-motion: reduce) {
  @supports (view-transition-name: none) {
    [data-view-transition],
    .dock-shell,
    .viewport-fade {
      view-transition-name: none !important;
    }
    ::view-transition-old(shell-header),
    ::view-transition-new(shell-header),
    ::view-transition-old(shell-main),
    ::view-transition-new(shell-main) {
      animation-duration: 0.001ms !important;
      animation-delay: 0s !important;
    }
    :root[data-nav-fallback] [data-view-transition="shell-main"] {
      animation: none !important;
    }
  }
}
}`

export const routeDirectionRestoreScript = `(function () {
  var stateKey = ${serializeJson(ROUTE_TRANSITION_STATE_KEY)};
  var fallbackAttr = 'data-nav-fallback';
  var fallbackDurationMs = ${String(ROUTE_FALLBACK_ANIMATION_DURATION_MS)};
  var normalizePath = function (value) {
    var trimmed = String(value || '').trim();
    if (!trimmed || trimmed === '/') return '/';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };
  var isSkippedTransitionError = function (error) {
    if (!error || typeof error !== 'object') return false;
    var name = 'name' in error ? String(error.name || '') : '';
    var message = 'message' in error ? String(error.message || '') : '';
    return name === 'AbortError' || message.indexOf('Transition was skipped') !== -1;
  };
  var prefersReducedMotion = function () {
    try {
      return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      return false;
    }
  };
  var fallbackTimer = 0;
  var clearFallback = function () {
    if (fallbackTimer) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    document.documentElement.removeAttribute(fallbackAttr);
  };
  var scheduleFallback = function (direction) {
    if (!direction || direction === 'none' || prefersReducedMotion()) return;
    var run = function () {
      clearFallback();
      document.documentElement.setAttribute(fallbackAttr, direction);
      fallbackTimer = window.setTimeout(clearFallback, fallbackDurationMs);
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        requestAnimationFrame(run);
      });
      return;
    }
    run();
  };
  window.addEventListener('unhandledrejection', function (event) {
    if (isSkippedTransitionError(event.reason)) {
      event.preventDefault();
    }
  });
  var comparableKey = normalizePath(location.pathname) + location.search + location.hash;
  var restoredDirection = null;
  try {
    var raw = sessionStorage.getItem(stateKey);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (!parsed || parsed.targetKey !== comparableKey || typeof parsed.direction !== 'string') return;
    restoredDirection = parsed.direction;
    document.documentElement.dataset.navDirection = restoredDirection;
    sessionStorage.removeItem(stateKey);
  } catch (error) {
    console.warn('Failed to restore route transition state:', error);
  }
  if (!restoredDirection || restoredDirection === 'none') return;
  var wireFallback = function (transition) {
    if (!transition) {
      scheduleFallback(restoredDirection);
      return;
    }
    var handleSkippedTransition = function (error) {
      if (!isSkippedTransitionError(error)) return;
      scheduleFallback(restoredDirection);
    };
    if (transition.ready && typeof transition.ready.catch === 'function') {
      transition.ready.catch(handleSkippedTransition);
    }
    if (transition.finished && typeof transition.finished.catch === 'function') {
      transition.finished.catch(handleSkippedTransition);
    }
  };
  if ('onpagereveal' in window) {
    window.addEventListener('pagereveal', function (event) {
      wireFallback(event && typeof event === 'object' && 'viewTransition' in event
        ? event.viewTransition
        : null);
    }, { once: true });
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scheduleFallback(restoredDirection);
    }, { once: true });
    return;
  }
  scheduleFallback(restoredDirection);
})();`

export const buildRouteShellBootstrapScript = (
  descriptors: ReadonlyArray<RouteShellBootstrapDescriptor>
) => `(function () {
  var descriptors = ${serializeJson(descriptors)};
  var stateKey = ${serializeJson(ROUTE_TRANSITION_STATE_KEY)};
  var nonceAttr = ${serializeJson(CSP_NONCE_ATTR)};
  var runtimeScriptPolicyName = ${serializeJson(TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME)};
  var speculationSelector = 'script[type="speculationrules"][data-route-speculation="shell"]';
  var prefetchSelector = 'link[rel="prefetch"][data-route-prefetch="shell"]';
  var supportsSpeculation = typeof HTMLScriptElement !== 'undefined' &&
    typeof HTMLScriptElement.supports === 'function' &&
    HTMLScriptElement.supports('speculationrules');
  var intentSeen = false;
  var idleScheduled = false;
  var idlePrefetchUrls = [];
  var intentTargetUrl = null;
  var intentPrerenderEnabled = false;
  var lastWarmupKey = '';
  var previousRenderState = '';

  var normalizePath = function (value) {
    var trimmed = String(value || '').trim();
    if (!trimmed || trimmed === '/') return '/';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };

  var comparableKey = function (url) {
    return normalizePath(url.pathname) + url.search + url.hash;
  };

  var isHashOnlyNavigation = function (currentUrl, targetUrl) {
    return (
      normalizePath(currentUrl.pathname) === normalizePath(targetUrl.pathname) &&
      currentUrl.search === targetUrl.search &&
      currentUrl.hash !== targetUrl.hash
    );
  };

  var resolveDockOwner = function (pathname) {
    var normalizedPath = normalizePath(pathname);
    var match = null;
    for (var index = 0; index < descriptors.length; index += 1) {
      var descriptor = descriptors[index];
      var candidate = normalizePath(descriptor.rootHref);
      var matches = candidate === '/'
        ? normalizedPath === '/'
        : normalizedPath === candidate || normalizedPath.indexOf(candidate + '/') === 0;
      if (!matches) continue;
      if (!match || candidate.length > normalizePath(match.rootHref).length) {
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
    if (!currentOwner || !targetOwner || currentOwner.rootHref === targetOwner.rootHref) {
      return 'neutral';
    }

    return targetOwner.index > currentOwner.index ? 'forward' : 'back';
  };

  var resolveSafety = function (pathname) {
    var normalizedPath = normalizePath(pathname);
    if (
      normalizedPath === '/offline' ||
      normalizedPath === '/login/callback' ||
      normalizedPath.indexOf('/login/callback/') === 0 ||
      normalizedPath === '/store/items' ||
      normalizedPath.indexOf('/store/items/') === 0
    ) {
      return 'no-warmup';
    }

    if (normalizedPath === '/' || normalizedPath === '/store' || normalizedPath === '/lab') {
      return 'prerender-ok';
    }

    if (
      normalizedPath === '/login' ||
      normalizedPath === '/profile' ||
      normalizedPath === '/settings' ||
      normalizedPath === '/dashboard' ||
      normalizedPath === '/chat' ||
      normalizedPath === '/privacy'
    ) {
      return 'prefetch-only';
    }

    return 'no-warmup';
  };

  var isWarmupConstrained = function () {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var effectiveType = connection && typeof connection.effectiveType === 'string'
      ? connection.effectiveType.trim().toLowerCase()
      : '';
    return (connection && connection.saveData === true) || effectiveType === '2g' || effectiveType === 'slow-2g';
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

  var normalizeWarmupUrls = function (urls) {
    var seen = new Set();
    var normalized = [];
    for (var index = 0; index < urls.length; index += 1) {
      try {
        var url = new URL(urls[index], location.origin);
        if (url.origin !== location.origin || seen.has(url.href)) continue;
        seen.add(url.href);
        normalized.push(url.href);
      } catch (error) {
        // Ignore invalid warmup URLs.
      }
    }
    return normalized;
  };

  var toTrustedScript = function (value) {
    var target = window;
    var cached = target.__PROM_TT_POLICIES__ && target.__PROM_TT_POLICIES__[runtimeScriptPolicyName];
    if (cached && typeof cached.createScript === 'function') {
      return cached.createScript(value);
    }

    var factory = target.trustedTypes;
    if (!factory || typeof factory.createPolicy !== 'function') {
      return value;
    }

    try {
      var policy = factory.createPolicy(runtimeScriptPolicyName, {
        createScript: function (input) { return input; },
        createScriptURL: function (input) { return input; }
      });
      target.__PROM_TT_POLICIES__ = Object.assign({}, target.__PROM_TT_POLICIES__ || {}, {
        [runtimeScriptPolicyName]: policy
      });
      return policy.createScript ? policy.createScript(value) : value;
    } catch (error) {
      var existing = target.__PROM_TT_POLICIES__ && target.__PROM_TT_POLICIES__[runtimeScriptPolicyName];
      return existing && typeof existing.createScript === 'function'
        ? existing.createScript(value)
        : value;
    }
  };

  var clearWarmupMarkup = function () {
    Array.from(document.querySelectorAll(speculationSelector)).forEach(function (node) {
      node.parentNode && node.parentNode.removeChild(node);
    });
    Array.from(document.querySelectorAll(prefetchSelector)).forEach(function (node) {
      node.parentNode && node.parentNode.removeChild(node);
    });
  };

  var renderWarmupMarkup = function () {
    var prefetchUrls = normalizeWarmupUrls(
      idlePrefetchUrls.concat(intentTargetUrl && !intentPrerenderEnabled ? [intentTargetUrl] : [])
    );
    var prerenderUrls =
      supportsSpeculation && intentPrerenderEnabled && intentTargetUrl
        ? normalizeWarmupUrls([intentTargetUrl])
        : [];
    var nextState = JSON.stringify({ prefetchUrls: prefetchUrls, prerenderUrls: prerenderUrls });

    if (nextState === previousRenderState) return;
    previousRenderState = nextState;
    clearWarmupMarkup();

    if (!prefetchUrls.length && !prerenderUrls.length) {
      return;
    }

    if (supportsSpeculation) {
      var script = document.createElement('script');
      script.type = 'speculationrules';
      script.setAttribute('data-route-speculation', 'shell');
      var nonce = document.documentElement.getAttribute(nonceAttr);
      if (nonce) {
        script.nonce = nonce;
      }
      script.text = toTrustedScript(JSON.stringify({
        prefetch: prefetchUrls.length ? [{ source: 'list', urls: prefetchUrls }] : [],
        prerender: prerenderUrls.length ? [{ source: 'list', urls: prerenderUrls }] : []
      }));
      document.head.appendChild(script);
      return;
    }

    normalizeWarmupUrls(prefetchUrls.concat(prerenderUrls)).forEach(function (href) {
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'document';
      link.href = href;
      link.setAttribute('data-route-prefetch', 'shell');
      document.head.appendChild(link);
    });
  };

  var warmTarget = function (targetUrl) {
    if (isWarmupConstrained()) return;
    var safety = resolveSafety(targetUrl.pathname);
    if (safety === 'no-warmup') return;
    intentTargetUrl = targetUrl.href;
    intentPrerenderEnabled = safety === 'prerender-ok';
    renderWarmupMarkup();
  };

  var scheduleIdleWarmup = function () {
    if (idleScheduled || isWarmupConstrained()) return;
    idleScheduled = true;
    var run = function () {
      var currentOwner = resolveDockOwner(location.pathname);
      if (!currentOwner) return;
      idlePrefetchUrls = descriptors
        .filter(function (descriptor) {
          return (
            Math.abs(descriptor.index - currentOwner.index) === 1 &&
            descriptor.safety !== 'no-warmup'
          );
        })
        .map(function (descriptor) {
          return new URL(descriptor.href, location.origin).href;
        });
      renderWarmupMarkup();
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1600 });
      return;
    }

    window.setTimeout(run, 220);
  };

  var noteIntent = function () {
    if (intentSeen) return;
    intentSeen = true;
    scheduleIdleWarmup();
  };

  var handleWarmupIntent = function (event) {
    noteIntent();
    var anchor = resolveAnchor(event.target);
    if (!anchor) return;
    var targetUrl = resolveRouteUrl(anchor);
    if (!targetUrl) return;

    var nextKey = comparableKey(targetUrl);
    if (nextKey === comparableKey(new URL(location.href)) || nextKey === lastWarmupKey) {
      return;
    }

    lastWarmupKey = nextKey;
    warmTarget(targetUrl);
  };

  document.addEventListener('pointerdown', noteIntent, true);
  document.addEventListener('focusin', noteIntent, true);
  document.addEventListener('keydown', noteIntent, true);
  document.addEventListener('pointerover', handleWarmupIntent, true);
  document.addEventListener('focusin', handleWarmupIntent, true);
  document.addEventListener('pointerdown', handleWarmupIntent, true);

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

    noteIntent();
    warmTarget(targetUrl);
    var direction = resolveDirection(currentUrl.pathname, targetUrl.pathname).replace('none', 'neutral');
    document.documentElement.dataset.navDirection = direction;

    try {
      sessionStorage.setItem(
        stateKey,
        JSON.stringify({
          direction: direction,
          targetKey: targetKey
        })
      );
    } catch (error) {
      console.warn('Failed to store route transition state:', error);
    }
  }, true);
})();`
