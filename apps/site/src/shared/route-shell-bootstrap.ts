import { TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME } from '../security/shared'
import { STATIC_ROUTE_ATTR } from '../shell/core/constants'
import {
  SERVER_HEALTH_INTERVAL_MS,
  SERVER_HEALTH_PERIODIC_SYNC_TAG
} from './server-health'
import {
  SERVER_REACHABILITY_EVENT,
  SERVER_REACHABILITY_WINDOW_KEY
} from './server-reachability'
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
  userCacheKey?: string | null
}

const ROUTE_TRANSITION_STATE_KEY = '__PROMETHEUS_ROUTE_TRANSITION__'
const ROUTE_WARMUP_STATE_KEY = '__PROMETHEUS_ROUTE_WARMUP__'
const PROM_PERF_DEBUG_KEY = '__PROM_PERF_DEBUG__'
const PROM_PERF_DEBUG_FLAG = '__PROM_STATIC_SHELL_DEBUG_PERF__'
const FIRST_ACTIONABLE_CONTROL_MARK = 'prom:perf:first-actionable-control'
const ROUTE_TRANSITION_START_MARK = 'prom:perf:route-transition-start'
const ROUTE_TRANSITION_END_MARK = 'prom:perf:route-transition-end'
const ROUTE_TRANSITION_MEASURE = 'prom:perf:route-transition'
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
  isAuthenticated,
  userCacheKey = null
}: RouteShellBootstrapConfig) => `(function () {
  var navigationDescriptors = ${serializeJson(navigationDescriptors)};
  var warmupDescriptors = ${serializeJson(warmupDescriptors)};
  var isAuthenticated = ${serializeJson(isAuthenticated)};
  var userCacheKey = ${serializeJson(userCacheKey)};
  var stateKey = ${serializeJson(ROUTE_TRANSITION_STATE_KEY)};
  var routeWarmupStateKey = ${serializeJson(ROUTE_WARMUP_STATE_KEY)};
  var runtimeScriptPolicyName = ${serializeJson(TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME)};
  var staticRouteAttr = ${serializeJson(STATIC_ROUTE_ATTR)};
  var serverReachabilityEvent = ${serializeJson(SERVER_REACHABILITY_EVENT)};
  var serverReachabilityKey = ${serializeJson(SERVER_REACHABILITY_WINDOW_KEY)};
  var serverHealthIntervalMs = ${String(SERVER_HEALTH_INTERVAL_MS)};
  var serverHealthPeriodicSyncTag = ${serializeJson(SERVER_HEALTH_PERIODIC_SYNC_TAG)};
  var swOptOutKey = 'fragment:sw-opt-out';
  var swBridgeReadyKey = '__PROMETHEUS_ROUTE_SW_BRIDGE_READY__';
  var swBridgeInstalledKey = '__PROMETHEUS_ROUTE_SW_BRIDGE_INSTALLED__';
  var swHeartbeatInstalledKey = '__PROMETHEUS_ROUTE_SW_HEARTBEAT_INSTALLED__';
  var swRegistrationPromise = null;

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

  var toAbsoluteUrl = function (href) {
    try {
      var url = new URL(href, location.origin);
      if (url.pathname !== '/' && !url.pathname.endsWith('/')) {
        url.pathname = url.pathname + '/';
      }
      if (!url.search) {
        var currentParams = new URLSearchParams(location.search);
        if (currentParams.has('lang')) {
          url.searchParams.set('lang', currentParams.get('lang'));
        }
      }
      return url.toString();
    } catch (error) {
      return null;
    }
  };

  var dispatchSwEvent = function (name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  };

  var resolveBrowserOnline = function () {
    return navigator.onLine !== false;
  };

  var readServerReachability = function () {
    var browserOnline = resolveBrowserOnline();
    var current = window[serverReachabilityKey];
    if (!current || typeof current !== 'object') {
      return {
        online: browserOnline,
        browserOnline: browserOnline,
        checkedAt: null,
        key: null,
        source: 'bootstrap'
      };
    }
    return {
      online: current.online === true,
      browserOnline: 'browserOnline' in current ? current.browserOnline !== false : browserOnline,
      checkedAt: typeof current.checkedAt === 'number' && isFinite(current.checkedAt) ? current.checkedAt : null,
      key: typeof current.key === 'string' && current.key.trim() ? current.key.trim() : null,
      source: typeof current.source === 'string' && current.source.trim() ? current.source.trim() : 'bootstrap'
    };
  };

  var hasReachabilityChanged = function (current, next) {
    return current.online !== next.online ||
      current.browserOnline !== next.browserOnline ||
      current.checkedAt !== next.checkedAt ||
      current.key !== next.key ||
      current.source !== next.source;
  };

  var writeServerReachability = function (patch) {
    var current = readServerReachability();
    var next = {
      online: typeof patch.online === 'boolean' ? patch.online : current.online,
      browserOnline: typeof patch.browserOnline === 'boolean' ? patch.browserOnline : resolveBrowserOnline(),
      checkedAt: typeof patch.checkedAt === 'number' && isFinite(patch.checkedAt) ? patch.checkedAt : current.checkedAt,
      key: typeof patch.key === 'string' && patch.key.trim() ? patch.key.trim() : current.key,
      source: typeof patch.source === 'string' && patch.source.trim() ? patch.source.trim() : current.source
    };
    if (!hasReachabilityChanged(current, next)) {
      return current;
    }
    window[serverReachabilityKey] = next;
    dispatchSwEvent(serverReachabilityEvent, next);
    return next;
  };

  var isServiceWorkerDisabled = function () {
    if (!('serviceWorker' in navigator)) return true;
    if (document.documentElement.getAttribute('data-sw-disabled') === '1') return true;
    if (window.__FRAGMENT_PRIME_DISABLE_SW__ === true) return true;
    try {
      return window.localStorage.getItem(swOptOutKey) === '1';
    } catch (error) {
      return false;
    }
  };

  var resolveServiceWorkerLocation = function () {
    return {
      swUrl: new URL('/service-worker.js', location.origin).toString(),
      scope: '/',
      scopeUrl: new URL('/', location.origin).toString()
    };
  };

  var asTrustedScriptUrl = function (url) {
    var target = window;
    var factory = target.trustedTypes;
    if (!factory || typeof factory.createPolicy !== 'function') {
      return url;
    }
    var policies = target.__PROM_TT_POLICIES__ || {};
    var cached = policies[runtimeScriptPolicyName];
    if (cached && typeof cached.createScriptURL === 'function') {
      return cached.createScriptURL(url);
    }
    try {
      var policy = factory.createPolicy(runtimeScriptPolicyName, {
        createScript: function (input) {
          return input;
        },
        createScriptURL: function (input) {
          return input;
        }
      });
      target.__PROM_TT_POLICIES__ = Object.assign({}, policies, {
        [runtimeScriptPolicyName]: policy
      });
      return typeof policy.createScriptURL === 'function' ? policy.createScriptURL(url) : url;
    } catch (error) {
      var existing = (target.__PROM_TT_POLICIES__ || {})[runtimeScriptPolicyName];
      if (existing && typeof existing.createScriptURL === 'function') {
        return existing.createScriptURL(url);
      }
      return url;
    }
  };

  var registerServiceWorker = function () {
    if (swRegistrationPromise) return swRegistrationPromise;
    if (isServiceWorkerDisabled()) {
      swRegistrationPromise = Promise.resolve(null);
      return swRegistrationPromise;
    }
    var serviceWorkerLocation = resolveServiceWorkerLocation();
    swRegistrationPromise = navigator.serviceWorker
      .getRegistration(serviceWorkerLocation.scopeUrl)
      .then(function (registration) {
        if (registration) return registration;
        return navigator.serviceWorker.register(asTrustedScriptUrl(serviceWorkerLocation.swUrl), {
          scope: serviceWorkerLocation.scope
        });
      })
      .catch(function (error) {
        console.error('Route shell service worker registration failed:', error);
        return null;
      });
    return swRegistrationPromise;
  };

  var resolveServiceWorkerTarget = function () {
    return registerServiceWorker()
      .then(function (registration) {
        if (registration && registration.active) {
          return registration.active;
        }
        return navigator.serviceWorker.ready
          .then(function (readyRegistration) {
            return readyRegistration.active || navigator.serviceWorker.controller || null;
          })
          .catch(function () {
            return navigator.serviceWorker.controller || null;
          });
      })
      .catch(function () {
        return navigator.serviceWorker.controller || null;
      });
  };

  var setupServiceWorkerBridge = function () {
    if (!('serviceWorker' in navigator)) return;
    if (window[swBridgeInstalledKey]) return;
    window[swBridgeInstalledKey] = true;

    navigator.serviceWorker.addEventListener('message', function (event) {
      var payload = event && event.data ? event.data : null;
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'sw:cache-refreshed') {
        dispatchSwEvent('prom:sw-cache-refreshed', payload);
        return;
      }
      if (payload.type === 'sw:cache-cleared') {
        dispatchSwEvent('prom:sw-cache-cleared', payload);
        return;
      }
      if (payload.type === 'sw:warm-complete') {
        dispatchSwEvent('prom:sw-warm-complete', payload);
        return;
      }
      if (payload.type === 'sw:resource-updated') {
        dispatchSwEvent('prom:sw-resource-updated', payload);
        return;
      }
      if (payload.type === 'sw:resource-invalidated') {
        dispatchSwEvent('prom:sw-resource-invalidated', payload);
        return;
      }
      if (payload.type === 'sw:status') {
        writeServerReachability({
          online: payload.online === true,
          browserOnline: resolveBrowserOnline(),
          checkedAt: typeof payload.checkedAt === 'number' ? payload.checkedAt : Date.now(),
          key: typeof payload.key === 'string' ? payload.key : null,
          source: typeof payload.source === 'string' ? payload.source : 'heartbeat'
        });
        dispatchSwEvent('prom:network-status', payload);
      }
    });

    window.addEventListener('online', function () {
      writeServerReachability({
        online: false,
        browserOnline: true,
        checkedAt: readServerReachability().checkedAt,
        source: 'online-event'
      });
      dispatchSwEvent('prom:network-status', { online: true, source: 'online-event' });
    });
    window.addEventListener('offline', function () {
      writeServerReachability({
        online: false,
        browserOnline: false,
        checkedAt: Date.now(),
        source: 'offline-event'
      });
      dispatchSwEvent('prom:network-status', { online: false, source: 'offline-event' });
    });

    window.addEventListener('prom:sw-manual-refresh', function () {
      postServiceWorkerMessage({ type: 'sw:manual-refresh' });
    });
    window.addEventListener('prom:sw-warm-public', function () {
      if (!publicHrefs.length) return;
      postServiceWorkerMessage({ type: 'sw:warm-public', hrefs: publicHrefs });
    });
    window.addEventListener('prom:sw-warm-user', function () {
      if (!isAuthenticated || !userCacheKey || !authHrefs.length) return;
      postServiceWorkerMessage({
        type: 'sw:warm-user',
        hrefs: authHrefs,
        userCacheKey: userCacheKey
      });
    });
    window.addEventListener('prom:sw-update-resource', function (event) {
      var detail = event && event.detail ? event.detail : null;
      if (!detail || typeof detail.resourceKey !== 'string') return;
      postServiceWorkerMessage(Object.assign({ type: 'sw:update-resource' }, detail));
    });
    window.addEventListener('prom:sw-invalidate-resource', function (event) {
      var detail = event && event.detail ? event.detail : null;
      if (!detail || typeof detail.resourceKey !== 'string') return;
      postServiceWorkerMessage(Object.assign({ type: 'sw:invalidate-resource' }, detail));
    });
    window.addEventListener('prom:sw-refresh-cache', function () {
      postServiceWorkerMessage({ type: 'sw:manual-refresh' });
    });
    window.addEventListener('prom:sw-clear-cache', function () {
      postServiceWorkerMessage({ type: 'sw:clear-cache' });
    });
    window.addEventListener('prom:sw-manual-sync', function () {
      dispatchSwEvent('prom:sw-sync-requested', { method: 'message' });
      postServiceWorkerMessage({ type: 'p2p:flush-outbox' });
      postServiceWorkerMessage({ type: 'store:cart:flush' });
      postServiceWorkerMessage({ type: 'contact-invites:flush-queue' });
    });
  };

  var postServiceWorkerMessage = function (message) {
    if (!('serviceWorker' in navigator)) return;
    resolveServiceWorkerTarget().then(function (target) {
      if (!target || typeof target.postMessage !== 'function') return;
      target.postMessage(message);
    }).catch(function () {
      // Ignore warmup failures during bootstrap.
    });
  };

  var hasStaticRoute = Boolean(document.querySelector('[' + staticRouteAttr + ']'));

  var requestServerHealth = function (reason) {
    postServiceWorkerMessage({
      type: 'sw:check-server-health',
      reason: reason || 'heartbeat'
    });
  };

  var registerPeriodicServerHealthCheck = function () {
    return registerServiceWorker()
      .then(function (registration) {
        var periodicSync = registration && registration.periodicSync;
        if (!periodicSync || typeof periodicSync.register !== 'function') {
          return null;
        }
        return periodicSync.register(serverHealthPeriodicSyncTag, {
          minInterval: serverHealthIntervalMs
        }).catch(function () {
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  };

  var setupServerHealthHeartbeat = function () {
    if (!hasStaticRoute || window[swHeartbeatInstalledKey]) return;
    window[swHeartbeatInstalledKey] = true;
    registerServiceWorker()
      .then(function () {
        requestServerHealth('heartbeat');
        window.setInterval(function () {
          requestServerHealth('heartbeat');
        }, serverHealthIntervalMs);
        return registerPeriodicServerHealthCheck();
      })
      .catch(function () {
        // Ignore service worker heartbeat setup failures during bootstrap.
      });

    window.addEventListener('online', function () {
      requestServerHealth('online-event');
    });
    window.addEventListener('pageshow', function (event) {
      if (event && event.persisted) {
        requestServerHealth('heartbeat');
      }
    });
  };

  var publicHrefs = warmupDescriptors
    .filter(function (descriptor) {
      return descriptor.warmupAudience === 'public' && descriptor.safety !== 'no-warmup';
    })
    .map(function (descriptor) {
      return toAbsoluteUrl(descriptor.href);
    })
    .filter(Boolean);

  var authHrefs = warmupDescriptors
    .filter(function (descriptor) {
      return descriptor.warmupAudience === 'auth' && descriptor.safety !== 'no-warmup';
    })
    .map(function (descriptor) {
      return toAbsoluteUrl(descriptor.href);
    })
    .filter(Boolean);

  window[routeWarmupStateKey] = {
    publicHrefs: publicHrefs,
    authHrefs: authHrefs,
    isAuthenticated: isAuthenticated,
    userCacheKey: userCacheKey
  };

  writeServerReachability({
    online: resolveBrowserOnline(),
    browserOnline: resolveBrowserOnline(),
    source: 'bootstrap'
  });
  registerServiceWorker();
  setupServiceWorkerBridge();
  setupServerHealthHeartbeat();

  var warmRoutes = function () {
    if (publicHrefs.length) {
      postServiceWorkerMessage({
        type: 'sw:warm-public',
        hrefs: publicHrefs
      });
    }
    if (isAuthenticated && userCacheKey && authHrefs.length) {
      postServiceWorkerMessage({
        type: 'sw:warm-user',
        hrefs: authHrefs,
        userCacheKey: userCacheKey
      });
    }
  };

  if (document.readyState === 'complete') {
    warmRoutes();
  } else {
    window.addEventListener('load', warmRoutes, { once: true });
  }

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
