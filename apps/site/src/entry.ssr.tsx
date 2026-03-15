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
import { readServiceWorkerSeedFromCookie } from "./shared/service-worker-seed";
import {
  getStaticShellRouteConfig,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_ISLAND_DATA_SCRIPT_ID,
  STATIC_PAGE_ROOT_ATTR,
  isStaticShellPath,
  normalizeStaticShellRoutePath,
} from "./static-shell/constants";
import { getOrCreateRequestCspNonce } from "./security/server";
import { CSP_NONCE_ATTR } from "./security/shared";
import { existsSync } from "node:fs";
import { appendStaticAssetVersion } from "./static-shell/asset-version";
import { getStaticShellBuildVersion } from "./static-shell/build-version.server";

const STATIC_BOOTSTRAP_BUNDLE_PATHS = {
  "home-static":
    "build/static-shell/apps/site/src/static-shell/home-static-entry.js",
  "fragment-static":
    "build/static-shell/apps/site/src/static-shell/fragment-static-entry.js",
  "island-static":
    "build/static-shell/apps/site/src/static-shell/island-static-entry.js",
} as const;

const STATIC_BOOTSTRAP_PRELOAD_PATHS = {
  "home-static": [STATIC_BOOTSTRAP_BUNDLE_PATHS["home-static"]],
  "fragment-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["fragment-static"],
    "build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js",
  ],
  "island-static": [
    STATIC_BOOTSTRAP_BUNDLE_PATHS["island-static"],
    "build/static-shell/apps/site/src/static-shell/island-bootstrap-runtime.js",
  ],
} as const;

const STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS = {
  "/store": [
    "build/static-shell/apps/site/src/static-shell/store-static-runtime.js",
  ],
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
const STATIC_SHELL_BUILD_VERSION = getStaticShellBuildVersion();

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

const stripBlockingDeferredStylesheet = (html: string) =>
  html
    .replace(
      /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*global-deferred\.css[^"']*["'][^>]*>\s*/gi,
      "",
    )
    .replace(
      /<style\b[^>]*data-src=["'][^"']*(?:global-deferred|home-static-deferred|home-demo-active)\.css[^"']*["'][^>]*>[\s\S]*?<\/style>\s*/gi,
      "",
    )
    .replace(
      /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*home-demo-active\.css[^"']*["'][^>]*>\s*/gi,
      "",
    )
    .replace(
      /<link\b[^>]*rel=["']preload["'][^>]*as=["']style["'][^>]*href=["'][^"']*home-demo-active\.css[^"']*["'][^>]*>\s*/gi,
      "",
    );

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
  const preloadTags = resolveStaticBootstrapPreloadPaths(pathname)
    .map(
      (path) =>
        `<link rel="modulepreload" href="${appendStaticAssetVersion(`${publicBase}${path}`, STATIC_SHELL_BUILD_VERSION)}">`,
    )
    .join("");
  const nonceAttr = nonce ? ` nonce="${escapeHtmlAttr(nonce)}"` : "";
  const scriptTag = `<script type="module" src="${bundleHref}"${nonceAttr}></script>`;
  return html
    .replace("</head>", `${preloadTags}</head>`)
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
    return renderToString(<Root />, {
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
          stripBlockingDeferredStylesheet(stripStaticQwikScripts(result.html)),
          resolvePublicBase(renderOptions),
          pathname,
          nonce,
        ),
      };
    });
  }

  return renderToStream(<Root />, {
    ...(renderOptions as RenderToStreamOptions),
  });
}
