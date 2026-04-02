import { TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME } from '../security/shared'
import type { RouteSafetyMode, RouteWarmupAudience } from './route-navigation'

export type RouteShellBootstrapNavigationDescriptor = {
  href: string
  rootHref: string
  index: number
}

export type RouteShellBootstrapWarmupDescriptor = {
  href: string
  safety: RouteSafetyMode
  warmupAudience: RouteWarmupAudience
}

type RouteShellBootstrapConfig = {
  navigationDescriptors: ReadonlyArray<RouteShellBootstrapNavigationDescriptor>
  warmupDescriptors: ReadonlyArray<RouteShellBootstrapWarmupDescriptor>
  isAuthenticated: boolean
}

const ROUTE_TRANSITION_STATE_KEY = '__PROMETHEUS_ROUTE_TRANSITION__'
const PROM_PERF_DEBUG_KEY = '__PROM_PERF_DEBUG__'
const PROM_PERF_DEBUG_FLAG = '__PROM_STATIC_SHELL_DEBUG_PERF__'
const FIRST_ACTIONABLE_CONTROL_MARK = 'prom:perf:first-actionable-control'
const ROUTE_TRANSITION_START_MARK = 'prom:perf:route-transition-start'
const ROUTE_TRANSITION_END_MARK = 'prom:perf:route-transition-end'
const ROUTE_TRANSITION_MEASURE = 'prom:perf:route-transition'
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
  var perfDebugKey = ${serializeJson(PROM_PERF_DEBUG_KEY)};
  var perfDebugFlag = ${serializeJson(PROM_PERF_DEBUG_FLAG)};
  var firstActionableControlMark = ${serializeJson(FIRST_ACTIONABLE_CONTROL_MARK)};
  var routeTransitionStartMark = ${serializeJson(ROUTE_TRANSITION_START_MARK)};
  var routeTransitionEndMark = ${serializeJson(ROUTE_TRANSITION_END_MARK)};
  var routeTransitionMeasure = ${serializeJson(ROUTE_TRANSITION_MEASURE)};
  var fallbackAttr = 'data-nav-fallback';
  var fallbackDurationMs = ${String(ROUTE_FALLBACK_ANIMATION_DURATION_MS)};
  var skippedTransitionThresholdMs = 80;
  var normalizePath = function (value) {
    var trimmed = String(value || '').trim();
    if (!trimmed || trimmed === '/') return '/';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };
  var now = function () {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  };
  var allowPerfDebug = function () {
    return Boolean(window[perfDebugFlag]);
  };
  var markPerf = function (name) {
    if (!allowPerfDebug()) return;
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark(name);
    }
  };
  var measurePerf = function (name, startMark, endMark) {
    if (!allowPerfDebug()) return;
    if (typeof performance === 'undefined' || typeof performance.measure !== 'function') {
      return;
    }
    try {
      performance.measure(name, startMark, endMark);
    } catch (error) {
      // Ignore measure collisions or missing marks.
    }
  };
  var ensurePerfDebugState = function () {
    if (!allowPerfDebug()) return null;
    var existing = window[perfDebugKey];
    if (existing && typeof existing === 'object') {
      return existing;
    }
    var next = {
      staticShellBootstrapAt: null,
      workerPrewarmAt: null,
      firstFragmentCommitAt: null,
      firstActionableControlAt: null,
      routeTransitions: []
    };
    window[perfDebugKey] = next;
    return next;
  };
  var recordFirstActionableControl = function () {
    var state = ensurePerfDebugState();
    if (!state || state.firstActionableControlAt !== null) return;
    state.firstActionableControlAt = now();
    markPerf(firstActionableControlMark);
  };
  var scheduleFirstActionableControl = function () {
    var run = function () {
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(recordFirstActionableControl);
        return;
      }
      window.setTimeout(recordFirstActionableControl, 0);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
      return;
    }
    run();
  };
  scheduleFirstActionableControl();
  var reconstructPerfStart = function (startedAtEpoch) {
    if (typeof startedAtEpoch !== 'number' || !isFinite(startedAtEpoch)) return null;
    var elapsed = Date.now() - startedAtEpoch;
    var reconstructed = now() - elapsed;
    return reconstructed > 0 ? reconstructed : 0;
  };
  var routeTransitionDebugEntry = null;
  var finishRouteTransition = function () {
    if (!routeTransitionDebugEntry || routeTransitionDebugEntry.endAt !== null) return;
    routeTransitionDebugEntry.endAt = now();
    markPerf(routeTransitionEndMark);
    measurePerf(routeTransitionMeasure, routeTransitionStartMark, routeTransitionEndMark);
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
    var perfDebugState = ensurePerfDebugState();
    if (perfDebugState) {
      routeTransitionDebugEntry = {
        from: typeof parsed.from === 'string' ? parsed.from : normalizePath(location.pathname),
        to: typeof parsed.to === 'string' ? parsed.to : normalizePath(location.pathname),
        startAt: reconstructPerfStart(parsed.startedAtEpoch),
        endAt: null
      };
      perfDebugState.routeTransitions.push(routeTransitionDebugEntry);
      markPerf(routeTransitionStartMark);
    }
    sessionStorage.removeItem(stateKey);
  } catch (error) {
    console.warn('Failed to restore route transition state:', error);
  }
  if (!restoredDirection || restoredDirection === 'none') return;
  var wireFallback = function (transition) {
    var startedAt = now();
    var handled = false;
    var scheduleOnce = function () {
      if (handled) return;
      handled = true;
      scheduleFallback(restoredDirection);
      finishRouteTransition();
    };
    if (!transition) {
      scheduleOnce();
      return;
    }
    var handleSkippedTransition = function (error) {
      if (!isSkippedTransitionError(error)) return;
      scheduleOnce();
    };
    var handleFinished = function () {
      if (handled) {
        finishRouteTransition();
        return;
      }
      if (now() - startedAt <= skippedTransitionThresholdMs) {
        scheduleOnce();
        return;
      }
      finishRouteTransition();
    };
    if (transition.ready && typeof transition.ready.catch === 'function') {
      transition.ready.catch(handleSkippedTransition);
    }
    if (transition.finished && typeof transition.finished.catch === 'function') {
      transition.finished.catch(handleSkippedTransition);
    }
    if (transition.finished && typeof transition.finished.then === 'function') {
      transition.finished.then(handleFinished, handleSkippedTransition);
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

export const buildRouteShellBootstrapScript = ({
  navigationDescriptors,
  warmupDescriptors,
  isAuthenticated
}: RouteShellBootstrapConfig) => `(function () {
  var navigationDescriptors = ${serializeJson(navigationDescriptors)};
  var warmupDescriptors = ${serializeJson(warmupDescriptors)};
  var isAuthenticated = ${serializeJson(isAuthenticated)};
  var stateKey = ${serializeJson(ROUTE_TRANSITION_STATE_KEY)};
  var nonceAttr = ${serializeJson(CSP_NONCE_ATTR)};
  var runtimeScriptPolicyName = ${serializeJson(TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME)};
  var speculationSelector = 'script[type="speculationrules"][data-route-speculation="shell"]';
  var prefetchSelector = 'link[rel="prefetch"][data-route-prefetch="shell"]';
  var supportsSpeculation = typeof HTMLScriptElement !== 'undefined' &&
    typeof HTMLScriptElement.supports === 'function' &&
    HTMLScriptElement.supports('speculationrules');
  var idleScheduled = false;
  var idlePrefetchUrls = [];
  var idlePrerenderUrls = [];
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
    for (var index = 0; index < navigationDescriptors.length; index += 1) {
      var descriptor = navigationDescriptors[index];
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
    var prefetchUrls = normalizeWarmupUrls(idlePrefetchUrls);
    var prerenderUrls = supportsSpeculation ? normalizeWarmupUrls(idlePrerenderUrls) : [];
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

  var scheduleIdleWarmup = function () {
    if (idleScheduled || isWarmupConstrained()) return;
    idleScheduled = true;
    var run = function () {
      var currentKey = comparableKey(new URL(location.href));
      idlePrefetchUrls = [];
      idlePrerenderUrls = [];

      warmupDescriptors.forEach(function (descriptor) {
        if (descriptor.safety === 'no-warmup') return;
        if (!isAuthenticated && descriptor.warmupAudience === 'auth') return;

        var url = new URL(descriptor.href, location.origin);
        if (comparableKey(url) === currentKey) return;

        if (descriptor.safety === 'prerender-ok' && supportsSpeculation) {
          idlePrerenderUrls.push(url.href);
          return;
        }

        idlePrefetchUrls.push(url.href);
      });
      renderWarmupMarkup();
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1600 });
      return;
    }

    window.setTimeout(run, 220);
  };
  scheduleIdleWarmup();

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

    var direction = resolveDirection(currentUrl.pathname, targetUrl.pathname).replace('none', 'neutral');
    document.documentElement.dataset.navDirection = direction;

    try {
      sessionStorage.setItem(
        stateKey,
        JSON.stringify({
          direction: direction,
          targetKey: targetKey,
          from: normalizePath(currentUrl.pathname),
          to: normalizePath(targetUrl.pathname),
          startedAtEpoch: Date.now()
        })
      );
    } catch (error) {
      console.warn('Failed to store route transition state:', error);
    }
  }, true);
})();`
