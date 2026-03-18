import type { RequestEvent } from "@builder.io/qwik-city";
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
} from "./static-shell/constants";
import { getOrCreateRequestCspNonce } from "./security/server";
import {
  CSP_NONCE_ATTR,
  TRUSTED_TYPES_RUNTIME_SCRIPT_POLICY_NAME,
} from "./security/shared";
import { existsSync } from "node:fs";
import { appendStaticAssetVersion } from "./static-shell/asset-version";
import { getStaticShellBuildVersion } from "./static-shell/build-version.server";
import {
  HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
} from "./static-shell/home-static-entry-loader";
import {
  HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH,
} from "./static-shell/home-bootstrap-runtime-loader";
import {
  HOME_DEMO_ENTRY_ASSET_PATH,
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH,
} from "./static-shell/home-demo-runtime-types";
import homeCriticalStyles from "@prometheus/ui/global-critical-home.css?inline";
import { prewarmStaticFragmentResources } from "./routes/fragment-resource";
import homeInteractiveDeferredStylesheetHref from "./static-shell/home-static-deferred.css?url";

const STATIC_BOOTSTRAP_BUNDLE_PATHS = {
  "home-static": HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
  "fragment-static":
    "build/static-shell/apps/site/src/static-shell/fragment-static-entry.js",
  "island-static":
    "build/static-shell/apps/site/src/static-shell/island-static-entry.js",
} as const;

const STATIC_BOOTSTRAP_PRELOAD_PATHS = {
  "home-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["home-static"],
    HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH,
    FRAGMENT_RUNTIME_WORKER_ASSET_PATH,
    FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH,
  ],
  "fragment-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["fragment-static"],
    "build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js",
  ],
  "island-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["island-static"],
    "build/static-shell/apps/site/src/static-shell/island-bootstrap-runtime.js",
  ],
} as const;

const STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS = {} as const;

const STATIC_BOOTSTRAP_ROUTE_STYLE_PRELOAD_HREFS = {
  "/": [homeInteractiveDeferredStylesheetHref],
} as const;

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
  return Array.from(
    new Set([
      ...STATIC_BOOTSTRAP_PRELOAD_PATHS[routeConfig.bootstrapMode],
      ...(STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS[
        normalizedPath as keyof typeof STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS
      ] ?? []),
    ]),
  );
};

const hasStaticBootstrapBundle = (pathname: string) => {
  const routeConfig = getStaticShellRouteConfig(pathname);
  if (!routeConfig) return false;
  return existsSync(STATIC_BOOTSTRAP_BUNDLE_URLS[routeConfig.bootstrapMode]);
};

const escapeHtmlAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const minifyInlineCss = (value: string) =>
  value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
const STATIC_SHELL_BUILD_VERSION = getStaticShellBuildVersion();
const HOME_CRITICAL_STYLES = minifyInlineCss(homeCriticalStyles);
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
const importModule = (href) => import(/* @vite-ignore */ href);
const importAnchorEntry = () => {
  void importModule(anchorEntryHref).catch((error) => {
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
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", importAnchorEntry, { once: true });
    return;
  }
  importAnchorEntry();
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
try {
  const data = parseJsonScript(dataScriptId);
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
} catch (error) {
  console.error("Static home worker bootstrap failed:", error);
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

const stripHomeBlockingDeferredStylesheet = (html: string, pathname: string) => {
  if (resolveStaticBootstrapMode(pathname) !== "home-static") {
    return html;
  }

  return html
    .replace(
      /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'][^"']*global-deferred\.css[^"']*["'])[^>]*>\s*/gi,
      "",
    )
    .replace(
      /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'][^"']*home-static-deferred\.css[^"']*["'])[^>]*>\s*/gi,
      "",
    )
    .replace(
      /<style\b(?=[^>]*\bdata-src=["'][^"']*(?:global-deferred|home-static-deferred|home-demo-active)\.css[^"']*["'])[^>]*>[\s\S]*?<\/style>\s*/gi,
      "",
    )
    .replace(
      /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'][^"']*home-demo-active\.css[^"']*["'])[^>]*>\s*/gi,
      "",
    )
    .replace(
      /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']style["'])(?=[^>]*\bhref=["'][^"']*home-static-deferred\.css[^"']*["'])[^>]*>\s*/gi,
      "",
    )
    .replace(
      /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']style["'])(?=[^>]*\bhref=["'][^"']*home-demo-active\.css[^"']*["'])[^>]*>\s*/gi,
      "",
    );
};

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

const replaceHomeCriticalStyles = (html: string, pathname: string) => {
  if (resolveStaticBootstrapMode(pathname) !== "home-static") {
    return html;
  }

  let hiddenStyleIndex = 0;
  return html
    .replace(/<style\b[^>]*hidden[^>]*>[\s\S]*?<\/style>/gi, (match) => {
      hiddenStyleIndex += 1;
      if (hiddenStyleIndex === 1) {
        return `<style hidden>${HOME_CRITICAL_STYLES}</style>`;
      }
      return hiddenStyleIndex === 2 ? "" : match;
    });
};

const buildStaticBootstrapPreloadTag = (path: string, publicBase: string) => {
  const href = appendStaticAssetVersion(
    `${publicBase}${path}`,
    STATIC_SHELL_BUILD_VERSION,
  );
  if (path === FRAGMENT_RUNTIME_WORKER_ASSET_PATH) {
    return `<link rel="modulepreload" href="${href}" data-fragment-runtime-preload="worker">`;
  }
  if (path === FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH) {
    return `<link rel="modulepreload" href="${href}" data-fragment-runtime-preload="decode">`;
  }
  if (path === HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH) {
    return `<link rel="modulepreload" href="${href}" data-home-demo-startup-attach="true">`;
  }
  if (path === HOME_DEMO_ENTRY_ASSET_PATH) {
    return `<link rel="modulepreload" href="${href}" data-home-demo-entry-preload="true">`;
  }

  return `<link rel="modulepreload" href="${href}">`;
};

const buildStaticBootstrapStylePreloadTag = (href: string) =>
  `<link rel="preload" as="style" href="${href}" data-home-demo-stylesheet="true">`;

export const injectStaticBootstrap = (
  html: string,
  publicBase: string,
  pathname: string,
  nonce?: string,
) => {
  const bundlePath = resolveStaticBootstrapBundlePath(pathname);
  if (!bundlePath) return html;
  const bundleHref = appendStaticAssetVersion(
    `${publicBase}${bundlePath}`,
    STATIC_SHELL_BUILD_VERSION,
  );
  const workerHref = appendStaticAssetVersion(
    `${publicBase}${FRAGMENT_RUNTIME_WORKER_ASSET_PATH}`,
    STATIC_SHELL_BUILD_VERSION,
  );
  const decodeWorkerHref = appendStaticAssetVersion(
    `${publicBase}${FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH}`,
    STATIC_SHELL_BUILD_VERSION,
  );
  const preloadTags = resolveStaticBootstrapPreloadPaths(pathname)
    .map((path) => buildStaticBootstrapPreloadTag(path, publicBase))
    .join("");
  const stylePreloadTags = (
    STATIC_BOOTSTRAP_ROUTE_STYLE_PRELOAD_HREFS[
      normalizeStaticShellRoutePath(pathname) as keyof typeof STATIC_BOOTSTRAP_ROUTE_STYLE_PRELOAD_HREFS
    ] ?? []
  )
    .map((href) => buildStaticBootstrapStylePreloadTag(href))
    .join("");
  const nonceAttr = nonce ? ` nonce="${escapeHtmlAttr(nonce)}"` : "";
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
    return html.replace("</head>", `${preloadTags}${stylePreloadTags}${scriptTag}</head>`);
  }

  return html
    .replace("</head>", `${preloadTags}${stylePreloadTags}</head>`)
    .replace("</body>", `${scriptTag}</body>`);
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
  const renderOptions = {
    manifest,
    ...opts,
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

        return {
          ...result,
          html: injectStaticBootstrap(
            replaceHomeCriticalStyles(
              stripNonCriticalStaticRouteStyles(
                stripHomeBlockingDeferredStylesheet(
                  stripStaticQwikScripts(result.html),
                  pathname,
                ),
                pathname,
              ),
              pathname,
            ),
            resolvePublicBase(renderOptions),
            pathname,
            nonce,
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
