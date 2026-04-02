import type { RequestEvent } from "@builder.io/qwik-city";
import { hasTemplateFeature, resolveTemplateFeatures } from "@prometheus/template-config";
import {
  renderToStream,
  renderToString,
  type RenderOptions,
  type RenderToStreamOptions,
} from "@builder.io/qwik/server";
import { manifest } from "@qwik-client-manifest";
import Root from "./root";
import { defaultTheme, readThemeFromCookie } from "@prometheus/ui";
import {
  FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH,
  PREWARMED_FRAGMENT_RUNTIME_STATE_KEY,
  FRAGMENT_RUNTIME_WORKER_ASSET_PATH,
} from "./fragment/runtime/client-bridge";
import { readServiceWorkerSeedFromCookie } from "./shared/service-worker-seed";
import {
  getStaticShellRouteConfig,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_HOME_WORKER_DATA_SCRIPT_ID,
  STATIC_ISLAND_DATA_SCRIPT_ID,
  STATIC_PAGE_ROOT_ATTR,
  isStaticShellPath,
  normalizeStaticShellRoutePath,
} from "./shell/core/constants";
import { getOrCreateRequestCspNonce } from "./security/server";
import {
  CSP_NONCE_ATTR,
  TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME,
} from "./security/shared";
import { existsSync } from "node:fs";
import { getStaticShellBuildVersion } from "./shell/core/build-version.server";
import { expandStaticShellPreloadPaths } from "./shell/core/build-manifest.server";
import {
  resolveStaticAssetPublicHref,
  shouldUseStaticShellSourceModules,
} from "./shell/core/static-asset-url";
import {
  HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
} from "./shell/home/runtime-loaders";
import {
  HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH,
} from "./shell/home/runtime-loaders";
import {
  HOME_DEMO_ENTRY_ASSET_PATH,
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH,
} from "./shell/home/home-demo-runtime-types";
import { HOME_DEFERRED_GLOBAL_STYLE_META_NAME } from "./shell/home/home-deferred-global-style-loader";
import { prewarmStaticFragmentResources } from "./routes/fragment-resource";

const STATIC_BOOTSTRAP_BUNDLE_PATHS = {
  "home-static": HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
  "fragment-static":
    "build/static-shell/apps/site/src/shell/fragments/fragment-static-entry.js",
  "island-static":
    "build/static-shell/apps/site/src/shell/core/island-static-entry.js",
} as const;

const STATIC_BOOTSTRAP_PRELOAD_PATHS = {
  "home-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["home-static"],
    HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH,
  ],
  "fragment-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["fragment-static"],
    "build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js",
  ],
  "island-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["island-static"],
    "build/static-shell/apps/site/src/shell/core/island-bootstrap-runtime.js",
  ],
} as const;

const STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS = {} as const;
const MANIFEST_INJECTION_STYLESHEET_MARKERS = [
  "global-deferred.css",
  "home-demo-shared.css",
  "home-static-eager.css",
] as const;

const STATIC_BOOTSTRAP_BUNDLE_URLS = Object.fromEntries(
  Object.entries(STATIC_BOOTSTRAP_BUNDLE_PATHS).map(([mode, bundlePath]) => [
    mode,
    new URL(`../dist/${bundlePath}`, import.meta.url),
  ]),
) as Record<keyof typeof STATIC_BOOTSTRAP_BUNDLE_PATHS, URL>;

const normalizeStaticPublicBase = (base: string) => {
  const normalized = base.endsWith("/") ? base : `${base}/`;
  if (normalized === "/build/") return "/";
  if (normalized === "./build/" || normalized === "build/") return "./";
  if (normalized.endsWith("/build/")) {
    return normalized.slice(0, -"build/".length);
  }
  return normalized;
};

const resolvePublicBase = (opts: RenderOptions) => {
  let base = opts.base;
  if (typeof base === "function") {
    base = base(opts);
  }
  if (typeof base === "string") {
    return normalizeStaticPublicBase(base);
  }
  const configured = import.meta.env.BASE_URL || "/";
  return normalizeStaticPublicBase(configured);
};

const resolveStaticBootstrapBundlePath = (pathname: string) => {
  const routeConfig = getStaticShellRouteConfig(pathname);
  if (!routeConfig) return null;
  return STATIC_BOOTSTRAP_BUNDLE_PATHS[routeConfig.bootstrapMode];
};

const resolveStaticBootstrapMode = (pathname: string) => {
  const routeConfig = getStaticShellRouteConfig(normalizeStaticShellRoutePath(pathname));
  return routeConfig?.bootstrapMode ?? null;
};

const resolveStaticBootstrapPreloadPaths = (pathname: string) => {
  const normalizedPath = normalizeStaticShellRoutePath(pathname);
  const routeConfig = getStaticShellRouteConfig(normalizedPath);
  if (!routeConfig) return [];
  return expandStaticShellPreloadPaths(
    Array.from(
      new Set([
        ...STATIC_BOOTSTRAP_PRELOAD_PATHS[routeConfig.bootstrapMode],
        ...(STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS[
          normalizedPath as keyof typeof STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS
        ] ?? []),
      ]),
    ),
  );
};

const resolveRenderManifest = () => {
  const resolvedManifest = manifest as
    | ({
        injections?: Array<{
          tag?: string;
          location?: string;
          attributes?: Record<string, unknown>;
        }>;
      } & RenderOptions["manifest"])
    | null
    | undefined;
  if (!resolvedManifest || typeof resolvedManifest !== "object") {
    return undefined;
  }
  const injections = (resolvedManifest as { injections?: Array<{
    tag?: string;
    location?: string;
    attributes?: Record<string, unknown>;
  }> }).injections;
  if (!Array.isArray(injections) || injections.length === 0) {
    return resolvedManifest as RenderOptions['manifest'];
  }
  return {
    ...resolvedManifest,
    injections: injections.filter((injection) => {
      if (injection?.tag !== "link" || injection?.location !== "head") {
        return true;
      }
      const rel = injection.attributes?.rel;
      const href = injection.attributes?.href;
      if (rel !== "stylesheet" || typeof href !== "string") {
        return true;
      }
        return !MANIFEST_INJECTION_STYLESHEET_MARKERS.some((marker) =>
          href.includes(marker),
        );
      }),
  } as RenderOptions['manifest'];
};

const hasStaticBootstrapBundle = (pathname: string) => {
  const routeConfig = getStaticShellRouteConfig(pathname);
  if (!routeConfig) return false;
  if (shouldUseStaticShellSourceModules()) {
    return true;
  }
  return existsSync(STATIC_BOOTSTRAP_BUNDLE_URLS[routeConfig.bootstrapMode]);
};

const escapeHtmlAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const STATIC_SHELL_BUILD_VERSION = getStaticShellBuildVersion();
const ssrTemplate = resolveTemplateFeatures(process.env);
const ssrPwaEnabled = hasTemplateFeature(ssrTemplate, "pwa");
const staticFragmentPrewarmPromise = import.meta.env.PROD
  ? prewarmStaticFragmentResources().catch((error) => {
      console.warn("Static fragment prewarm failed.", error);
    })
  : null;

const buildImmediateHomeStaticEntryTag = (
  bundleHref: string,
  workerHref: string,
  decodeWorkerHref: string,
  nonceAttr: string,
) =>
  `<script${nonceAttr}>(() => {
const win = window;
const doc = document;
if (!win || !doc) return;
const dataScriptId = ${JSON.stringify(STATIC_HOME_WORKER_DATA_SCRIPT_ID)};
const prewarmedWorkerKey = ${JSON.stringify(PREWARMED_FRAGMENT_RUNTIME_STATE_KEY)};
const anchorEntryHref = ${JSON.stringify(bundleHref)};
const workerHref = ${JSON.stringify(workerHref)};
const decodeWorkerHref = ${JSON.stringify(decodeWorkerHref)};
const trustedTypesRuntimeScriptPolicyName = ${JSON.stringify(
  TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME,
)};
const promPerfDebugKey = "__PROM_PERF_DEBUG__";
const promPerfDebugFlag = "__PROM_STATIC_SHELL_DEBUG_PERF__";
const workerPrewarmMark = "prom:perf:worker-prewarm";
const maxAnchorEntryAttempts = 4;
const anchorEntryRetryBaseDelayMs = 250;
const importModule = (href) => import(/* @vite-ignore */ href);
const getPromPerfNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
const ensurePromPerfDebug = () => {
  if (!win[promPerfDebugFlag]) {
    return null;
  }
  const current = win[promPerfDebugKey];
  if (current && typeof current === "object") {
    return current;
  }
  const next = {
    staticShellBootstrapAt: null,
    workerPrewarmAt: null,
    firstFragmentCommitAt: null,
    firstActionableControlAt: null,
    routeTransitions: [],
  };
  win[promPerfDebugKey] = next;
  return next;
};
const recordPromPerfTimestamp = (field, markName) => {
  const state = ensurePromPerfDebug();
  if (!state || state[field] !== null) {
    return state ? state[field] : null;
  }
  const at = getPromPerfNow();
  state[field] = at;
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark(markName);
  }
  return at;
};
let anchorEntryLoaded = false;
let anchorEntryAttemptCount = 0;
const scheduleAnchorEntryRetry = () => {
  if (anchorEntryLoaded || anchorEntryAttemptCount >= maxAnchorEntryAttempts) {
    return false;
  }
  const delayMs = anchorEntryRetryBaseDelayMs * anchorEntryAttemptCount;
  win.setTimeout(importAnchorEntry, delayMs);
  return true;
};
const importAnchorEntry = () => {
  if (anchorEntryLoaded) {
    return;
  }
  anchorEntryAttemptCount += 1;
  void importModule(anchorEntryHref)
    .then(() => {
      anchorEntryLoaded = true;
    })
    .catch((error) => {
      if (scheduleAnchorEntryRetry()) {
        console.warn("Static home anchor entry import failed; retrying.", error);
        return;
      }
      console.error("Static home anchor entry failed:", error);
    });
};
const parseJsonScript = (scriptId) => {
  const element = doc.getElementById(scriptId);
  if (!element || !element.textContent) {
    return null;
  }
  try {
    return JSON.parse(element.textContent);
  } catch (error) {
    console.error("Static home bootstrap data parse failed:", error);
    return null;
  }
};
const scheduleAnchorEntry = () => {
  const run = () => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        win.setTimeout(importAnchorEntry, 0);
      });
      return;
    }
    win.setTimeout(importAnchorEntry, 0);
  };
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }
  run();
};
const decodeBase64Bytes = (value) => {
  if (typeof value !== "string" || value.length === 0 || typeof win.atob !== "function") {
    return null;
  }
  const decoded = win.atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
};
const resolveKnownVersions = (knownVersions) => {
  if (!knownVersions || typeof knownVersions !== "object") {
    return {};
  }
  return Object.entries(knownVersions).reduce((acc, [fragmentId, version]) => {
    if (typeof version === "number" && Number.isFinite(version)) {
      acc[fragmentId] = Math.round(version);
    }
    return acc;
  }, {});
};
const resolveApiBase = (href) => {
  if (typeof href !== "string" || href.length === 0) {
    return "/api";
  }
  try {
    const url = new URL(href, win.location.origin);
    const marker = "/fragments/bootstrap";
    const nextPath = url.pathname.includes(marker)
      ? url.pathname.slice(0, url.pathname.indexOf(marker)) || "/api"
      : "/api";
    return url.origin === win.location.origin ? nextPath : url.origin + nextPath;
  } catch {
    return "/api";
  }
};
const getTrustedTypesRuntimeScriptPolicy = () => {
  const cached = win.__PROM_TT_POLICIES__?.[trustedTypesRuntimeScriptPolicyName];
  if (cached && (typeof cached.createScript === "function" || typeof cached.createScriptURL === "function")) {
    return cached;
  }
  const factory = win.trustedTypes;
  if (!factory || typeof factory.createPolicy !== "function") {
    return null;
  }
  try {
    const policy = factory.createPolicy(trustedTypesRuntimeScriptPolicyName, {
      createScript: (input) => input,
      createScriptURL: (input) => input,
    });
    win.__PROM_TT_POLICIES__ = {
      ...(win.__PROM_TT_POLICIES__ ?? {}),
      [trustedTypesRuntimeScriptPolicyName]: policy,
    };
    return policy;
  } catch {
    return win.__PROM_TT_POLICIES__?.[trustedTypesRuntimeScriptPolicyName] ?? null;
  }
};
const asTrustedScriptUrl = (url) => {
  const policy = getTrustedTypesRuntimeScriptPolicy();
  if (!policy || typeof policy.createScriptURL !== "function") {
    return url;
  }
  return policy.createScriptURL(url);
};
const createClientId = () => {
  if (win.crypto && typeof win.crypto.randomUUID === "function") {
    return "home-inline:" + win.crypto.randomUUID();
  }
  return "home-inline:" + Date.now().toString(36) + ":" + Math.random().toString(36).slice(2);
};
const prewarmWorker = () => {
  let data;
  try {
    data = parseJsonScript(dataScriptId);
  } catch (error) {
    console.error("Static home worker bootstrap failed:", error);
    return true;
  }
  if (!data) {
    return false;
  }
  const anchorBootstrapHref =
    data && typeof data.runtimeAnchorBootstrapHref === "string"
      ? data.runtimeAnchorBootstrapHref
      : null;
  const anchorBootstrapBase64 =
    data && typeof data.runtimeAnchorBootstrapPayloadBase64 === "string"
      ? data.runtimeAnchorBootstrapPayloadBase64
      : null;
  let existing = win[prewarmedWorkerKey] ?? null;
  if (
    existing &&
    (existing.path !== (data?.path || "/") ||
      existing.lang !== (data?.lang || "en") ||
      !(existing.worker instanceof Worker))
  ) {
    try {
      existing.worker.terminate();
    } catch {}
    delete win[prewarmedWorkerKey];
    existing = null;
  }
  if (!existing && typeof Worker === "function" && anchorBootstrapHref && anchorBootstrapBase64) {
    const clientId = createClientId();
    const apiBase = resolveApiBase(anchorBootstrapHref);
    const path = typeof data?.path === "string" && data.path ? data.path : "/";
    const lang = typeof data?.lang === "string" && data.lang ? data.lang : "en";
    const worker = new Worker(asTrustedScriptUrl(workerHref), {
      type: "module",
      name: "fragment-runtime",
    });
    recordPromPerfTimestamp("workerPrewarmAt", workerPrewarmMark);
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark("prom:home:worker-instantiated");
    }
    win[prewarmedWorkerKey] = {
      worker,
      clientId,
      apiBase,
      path,
      lang,
      claimed: false,
    };
    worker.postMessage({
      type: "init",
      clientId,
      apiBase,
      path,
      lang,
      planEntries: [],
      fetchGroups: [],
      initialFragments: [],
      initialSizing: {},
      knownVersions: resolveKnownVersions(data?.knownVersions),
      visibleIds: [],
      viewportWidth: typeof win.innerWidth === "number" && win.innerWidth > 0 ? win.innerWidth : 1280,
      enableStreaming: false,
      startupMode: "visible-only",
      bootstrapHref: anchorBootstrapHref,
      decodeWorkerHref,
    });
    const bootstrapBytes = decodeBase64Bytes(anchorBootstrapBase64);
    if (bootstrapBytes && bootstrapBytes.byteLength > 0) {
      worker.postMessage({
        type: "prime-bootstrap",
        clientId,
        requestId: "static-home-anchor-bootstrap",
        bytes: bootstrapBytes.buffer,
        href: anchorBootstrapHref,
      }, [bootstrapBytes.buffer]);
    }
  }
  return true;
};
if (!prewarmWorker()) {
  const retryPrewarm = () => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        win.setTimeout(prewarmWorker, 0);
      });
      return;
    }
    win.setTimeout(prewarmWorker, 0);
  };
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", retryPrewarm, { once: true });
  } else if (typeof queueMicrotask === "function") {
    queueMicrotask(retryPrewarm);
  } else {
    setTimeout(retryPrewarm, 0);
  }
}
scheduleAnchorEntry();
})();</script>`;

const stripStaticQwikScripts = (html: string) =>
  html
    .replace(/<!--\/?qv[\s\S]*?-->/g, "")
    .replace(
      /<script\b[^>]*type=["']qwik\/json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
      "",
    )
    .replace(
      /<script\b[^>]*q:func=["']qwik\/json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
      "",
    )
    .replace(/<script\b[^>]*>\s*document\["qFuncs_[\s\S]*?<\/script>\s*/gi, "")
    .replace(
      /<script\b[^>]*>\s*\(window\.qwikevents\|\|\(window\.qwikevents=\[\]\)\)\.push[\s\S]*?<\/script>\s*/gi,
      "",
    )
    .replace(
      /<script\b[^>]*id=["']qwikloader["'][^>]*>[\s\S]*?<\/script>\s*/gi,
      "",
    )
    .replace(
      /<script\b[^>]*q:type=["']preload["'][^>]*>[\s\S]*?<\/script>\s*/gi,
      "",
    )
    .replace(/<script\b[^>]*on-document:[^>]*>[\s\S]*?<\/script>\s*/gi, "")
    .replace(
      /<script\b[^>]*type=["']module["'][^>]*>\s*let b=fetch\([^<]*?<\/script>\s*/gi,
      "",
    )
    .replace(
      /<script\b[^>]*src=["'][^"']*\/build\/q-[^"']+["'][^>]*>\s*<\/script>\s*/gi,
      "",
    )
    .replace(
      /<link\b[^>]*rel=["']modulepreload["'][^>]*href=["'][^"']*\/build\/q-[^"']+["'][^>]*>\s*/gi,
      "",
    )
    .replace(
      /<link\b[^>]*rel=["']preload["'][^>]*href=["'][^"']*bundle-graph\.json[^"']*["'][^>]*>\s*/gi,
      "",
    )
    .replace(/\s+(?:q|on-document):[\w:-]+=(["'])[\s\S]*?\1/gi, "")
    .replace(/\s+(?:q|on-document):[\w:-]+/gi, "");

const stripNonCriticalStaticRouteStyles = (html: string, pathname: string) => {
  const mode = resolveStaticBootstrapMode(pathname);
  if (mode !== "home-static" && mode !== "fragment-static") {
    return html;
  }

  return html.replace(
    /<style\b[^>]*data-src=["'][^"']*\/assets\/[^"']*-style\.css[^"']*["'][^>]*>[\s\S]*?<\/style>\s*/gi,
    "",
  );
};

const stripHomeStaticDeferredDemoStylesheet = (html: string, pathname: string) => {
  if (resolveStaticBootstrapMode(pathname) !== "home-static") {
    return html;
  }

  return html.replace(
    /<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["'][^"']*\/assets\/[^"']*home-demo-shared\.css[^"']*["'])[^>]*>\s*/gi,
    "",
  );
};

const stripHomeStaticDeferredGlobalStylesheet = (html: string, pathname: string) => {
  if (resolveStaticBootstrapMode(pathname) !== "home-static") {
    return { html, href: null as string | null };
  }

  let deferredHref: string | null = null;
  const nextHtml = html.replace(
    /<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["']([^"']*\/assets\/[^"']*-style\.css[^"']*)["'])[^>]*>\s*/i,
    (_match, href: string) => {
      deferredHref = href;
      return "";
    },
  );

  return {
    html: nextHtml,
    href: deferredHref,
  };
};

const buildStaticBootstrapPreloadTag = (path: string, publicBase: string) => {
  const href = resolveStaticAssetPublicHref(path, {
    publicBase,
    version: STATIC_SHELL_BUILD_VERSION,
  });
  if (path === HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH) {
    return `<link rel="modulepreload" href="${href}" data-home-demo-startup-attach="true">`;
  }
  if (path === HOME_DEMO_ENTRY_ASSET_PATH) {
    return `<link rel="modulepreload" href="${href}" data-home-demo-entry-preload="true">`;
  }

  return `<link rel="modulepreload" href="${href}">`;
};

const buildStaticBootstrapPerfTag = (nonceAttr: string) =>
  `<script${nonceAttr}>(() => {
const win = window;
if (!win || !win.__PROM_STATIC_SHELL_DEBUG_PERF__) return;
const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
const mark = (name) => {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    performance.mark(name);
  }
};
const state = win.__PROM_PERF_DEBUG__ ?? (win.__PROM_PERF_DEBUG__ = {
  staticShellBootstrapAt: null,
  workerPrewarmAt: null,
  firstFragmentCommitAt: null,
  firstActionableControlAt: null,
  routeTransitions: []
});
mark('prom:perf:static-shell-bootstrap-start');
if (state.staticShellBootstrapAt === null) {
  state.staticShellBootstrapAt = now();
}
mark('prom:perf:static-shell-bootstrap-end');
})();</script>`;

export const injectStaticBootstrap = (
  html: string,
  publicBase: string,
  pathname: string,
  nonce?: string,
  deferredHomeGlobalStylesheetHref?: string | null,
) => {
  const bundlePath = resolveStaticBootstrapBundlePath(pathname);
  if (!bundlePath) return html;
  const bundleHref = resolveStaticAssetPublicHref(bundlePath, {
    publicBase,
    version: STATIC_SHELL_BUILD_VERSION,
  });
  const workerHref = resolveStaticAssetPublicHref(FRAGMENT_RUNTIME_WORKER_ASSET_PATH, {
    publicBase,
    version: STATIC_SHELL_BUILD_VERSION,
  });
  const decodeWorkerHref = resolveStaticAssetPublicHref(FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH, {
    publicBase,
    version: STATIC_SHELL_BUILD_VERSION,
  });
  const preloadTags = resolveStaticBootstrapPreloadPaths(pathname)
    .map((path) => buildStaticBootstrapPreloadTag(path, publicBase))
    .join("");
  const stylePreloadTags = "";
  const nonceAttr = nonce ? ` nonce="${escapeHtmlAttr(nonce)}"` : "";
  const perfScriptTag = buildStaticBootstrapPerfTag(nonceAttr)
  const deferredHomeGlobalStyleMetaTag = deferredHomeGlobalStylesheetHref
    ? `<meta name="${HOME_DEFERRED_GLOBAL_STYLE_META_NAME}" content="${escapeHtmlAttr(
        deferredHomeGlobalStylesheetHref,
      )}">`
    : "";
  const scriptTag =
    resolveStaticBootstrapMode(pathname) === "home-static"
      ? buildImmediateHomeStaticEntryTag(
          bundleHref,
          workerHref,
          decodeWorkerHref,
          nonceAttr,
        )
      : `<script type="module" src="${bundleHref}"${nonceAttr}></script>`;
  if (resolveStaticBootstrapMode(pathname) === "home-static") {
    return html.replace(
      "</head>",
      `${preloadTags}${stylePreloadTags}${deferredHomeGlobalStyleMetaTag}${perfScriptTag}${scriptTag}</head>`,
    );
  }

  return html
    .replace("</head>", `${preloadTags}${stylePreloadTags}</head>`)
    .replace("</body>", `${perfScriptTag}${scriptTag}</body>`);
};

const hasStaticOnlyMarker = (html: string) =>
  html.includes(`id="${STATIC_HOME_DATA_SCRIPT_ID}"`) ||
  html.includes(`id="${STATIC_FRAGMENT_DATA_SCRIPT_ID}"`) ||
  html.includes(`id="${STATIC_ISLAND_DATA_SCRIPT_ID}"`) ||
  html.includes(STATIC_PAGE_ROOT_ATTR);

export default function (opts: RenderOptions & Partial<RenderToStreamOptions>) {
  const lang =
    opts.containerAttributes?.lang ?? opts.serverData?.locale ?? "en";
  const requestEv = opts.serverData?.qwikcity?.ev as RequestEvent | undefined;
  const nonce = requestEv ? getOrCreateRequestCspNonce(requestEv) : undefined;
  const pathname =
    requestEv?.url.pathname ??
    (requestEv?.request ? new URL(requestEv.request.url).pathname : "");
  const cookieHeader = requestEv?.request.headers.get("cookie") ?? null;
  const theme = requestEv ? readThemeFromCookie(cookieHeader) : null;
  const swSeed = readServiceWorkerSeedFromCookie(cookieHeader);
  const disableSw =
    !ssrPwaEnabled ||
    import.meta.env.VITE_DISABLE_SW === "1" ||
    import.meta.env.VITE_DISABLE_SW === "true";
  const containerAttributes: Record<string, string> = {
    ...opts.containerAttributes,
    lang,
  };
  if (nonce) {
    containerAttributes[CSP_NONCE_ATTR] = nonce;
  }
  if (theme) {
    containerAttributes["data-theme"] = theme;
  } else {
    containerAttributes["data-theme"] = defaultTheme;
  }
  containerAttributes["data-sw-disabled"] = disableSw ? "1" : "0";
  if (swSeed.cleanupVersion) {
    containerAttributes["data-sw-cleanup-version"] = swSeed.cleanupVersion;
  }
  if (swSeed.forceCleanup !== undefined) {
    containerAttributes["data-sw-force-cleanup"] = swSeed.forceCleanup
      ? "1"
      : "0";
  }
  if (swSeed.optOut !== undefined) {
    containerAttributes["data-sw-opt-out"] = swSeed.optOut ? "1" : "0";
  }
  const preloader = import.meta.env.PROD
    ? false
    : (opts.preloader ?? { ssrPreloads: 1, maxIdlePreloads: 4 });
  const qwikLoader = import.meta.env.PROD
    ? "inline"
    : (opts.qwikLoader ?? "inline");
  const renderManifest = resolveRenderManifest();
  const renderOptions = {
    ...opts,
    manifest: renderManifest,
    preloader,
    qwikLoader,
    serverData: {
      ...opts.serverData,
      nonce,
    },
    containerTagName: opts.containerTagName ?? "html",
    containerAttributes,
  } satisfies RenderOptions & Partial<RenderToStreamOptions>;

  if (isStaticShellPath(pathname)) {
    const renderStaticShell = () =>
      renderToString(<Root />, {
        ...renderOptions,
      }).then((result) => {
        if (!hasStaticOnlyMarker(result.html)) {
          return result;
        }
        if (!hasStaticBootstrapBundle(pathname)) {
          console.warn(
            "Missing static shell bootstrap bundle; falling back to default Qwik startup.",
          );
          return result;
        }

        const { html: homeDeferredStyleStrippedHtml, href: deferredHomeGlobalStylesheetHref } =
          stripHomeStaticDeferredGlobalStylesheet(
            stripHomeStaticDeferredDemoStylesheet(
              stripNonCriticalStaticRouteStyles(
                stripStaticQwikScripts(result.html),
                pathname,
              ),
              pathname,
            ),
            pathname,
          );

        return {
          ...result,
          html: injectStaticBootstrap(
            homeDeferredStyleStrippedHtml,
            resolvePublicBase(renderOptions),
            pathname,
            nonce,
            deferredHomeGlobalStylesheetHref,
          ),
        };
      });

    if (resolveStaticBootstrapMode(pathname) === "home-static" && staticFragmentPrewarmPromise) {
      return staticFragmentPrewarmPromise.then(() => renderStaticShell());
    }

    return renderStaticShell();
  }

  return renderToStream(<Root />, {
    ...(renderOptions as RenderToStreamOptions),
  });
}
