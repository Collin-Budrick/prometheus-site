import { describe, expect, it } from "bun:test";

const readSource = async () =>
  await Bun.file(new URL("./entry.ssr.tsx", import.meta.url)).text();

describe("entry.ssr static bootstrap injection", () => {
  it("defines route-aware static shell runtime preloads", async () => {
    const source = await readSource();

    expect(source).toContain('"home-static": [');
    expect(source).toContain("HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH");
    expect(source).toContain("HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH");
    expect(source).toContain("HOME_DEMO_ENTRY_ASSET_PATH");
    expect(source).toContain(
      "FRAGMENT_RUNTIME_WORKER_ASSET_PATH",
    );
    expect(source).toContain(
      "FRAGMENT_RUNTIME_DECODE_WORKER_ASSET_PATH",
    );
    expect(source).not.toContain('data-fragment-runtime-preload="worker"');
    expect(source).not.toContain('data-fragment-runtime-preload="decode"');
    expect(source).toContain('data-home-demo-startup-attach="true"');
    expect(source).toContain("buildImmediateHomeStaticEntryTag");
    expect(source).toContain("STATIC_HOME_WORKER_DATA_SCRIPT_ID");
    expect(source).toContain("const dataScriptId =");
    expect(source).toContain("scheduleAnchorEntry");
    expect(source).toContain("const maxAnchorEntryAttempts = 4;");
    expect(source).toContain("const anchorEntryRetryBaseDelayMs = 250;");
    expect(source).toContain('const anchorEntryRetryQueryParam = "__anchor_retry";');
    expect(source).toContain("const resolveAnchorEntryImportHref = (attemptCount) => {");
    expect(source).toContain("scheduleAnchorEntryRetry");
    expect(source).toContain("void importModule(resolveAnchorEntryImportHref(anchorEntryAttemptCount))");
    expect(source).toContain('console.warn("Static home anchor entry import failed; retrying.", error);');
    expect(source).toContain('requestId: "static-home-anchor-bootstrap"');
    expect(source).toContain('console.error("Static home anchor entry failed:", error);');
    expect(source).toContain('console.error("Static home worker bootstrap failed:", error);');
    expect(source).toContain('console.error("Static home bootstrap data parse failed:", error);');
    expect(source).not.toContain("const stylesheet = document.querySelector('link[data-home-demo-stylesheet]');");
    expect(source).not.toContain("stylesheet.setAttribute('rel', 'stylesheet');");
    expect(source).not.toContain("HOME_STATIC_ENTRY_DEFER_DELAY_MS");
    expect(source).not.toContain("const loadFromIntent = (event) => {");
    expect(source).not.toContain('document.addEventListener("focusin", load');
    expect(source).not.toContain("const homeDataScriptId =");
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/shell/home/home-bootstrap-runtime.js"',
    );
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/shell/home/home-bootstrap-core-runtime.js"',
    );
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/shell/home/home-demo-startup-entry.js"',
    );
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/shell/fragments/fragment-height-patch-runtime.js"',
    );
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/fragment/runtime/worker.js"',
    );
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/fragment/runtime/decode-pool.worker.js"',
    );
    expect(source).toContain('"fragment-static": [');
    expect(source).toContain(
      '"build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js"',
    );
    expect(source).toContain('"island-static": [');
    expect(source).toContain(
      '"build/static-shell/apps/site/src/shell/core/island-bootstrap-runtime.js"',
    );
    expect(source).toContain("const STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS = {} as const;");
    expect(source).not.toContain("store-static-runtime.js");
    expect(source).toContain("resolveStaticBootstrapPreloadPaths(pathname)");
  });

  it("does not keep the old home deferred stylesheet strip path", async () => {
    const source = await readSource();

    expect(source).not.toContain("const stripHomeBlockingDeferredStylesheet = (html: string, pathname: string) => {");
    expect(source).not.toContain("home-static-deferred\\.css");
  });

  it("still strips non-critical inline static-route styles only on home and fragment static routes", async () => {
    const source = await readSource();

    expect(source).toContain("const stripNonCriticalStaticRouteStyles = (html: string, pathname: string) => {");
    expect(source).toContain('if (mode !== "home-static" && mode !== "fragment-static")');
    expect(source).toContain('data-src=["\']');
    expect(source).toContain('*-style\\.css');
    expect(source).toContain("stripNonCriticalStaticRouteStyles(");
  });

  it("strips the shared style.css stylesheet from static home SSR output only and preserves its href for deferred loading", async () => {
    const source = await readSource();

    expect(source).toContain("const stripHomeStaticDeferredGlobalStylesheet = (html: string, pathname: string) => {");
    expect(source).toContain('if (resolveStaticBootstrapMode(pathname) !== "home-static")');
    expect(source).toContain('*-style\\.css');
    expect(source).toContain('HOME_DEFERRED_GLOBAL_STYLE_META_NAME');
    expect(source).toContain("deferredHomeGlobalStylesheetHref");
    expect(source).toContain("stripHomeStaticDeferredGlobalStylesheet(");
  });

  it("strips the deferred home demo stylesheet from static home SSR output only", async () => {
    const source = await readSource();

    expect(source).toContain("const stripHomeStaticDeferredDemoStylesheet = (html: string, pathname: string) => {");
    expect(source).toContain('if (resolveStaticBootstrapMode(pathname) !== "home-static")');
    expect(source).toContain('home-demo-shared\\.css');
    expect(source).toContain("stripHomeStaticDeferredDemoStylesheet(");
  });

  it("does not inline or rewrite home critical css in the SSR output", async () => {
    const source = await readSource();

    expect(source).not.toContain("const minifyInlineCss = (value: string) =>");
    expect(source).not.toContain("const HOME_CRITICAL_STYLES =");
    expect(source).not.toContain("const replaceHomeCriticalStyles = (html: string, pathname: string) => {");
    expect(source).not.toContain("global-critical-home.css?inline");
  });

  it("prewarms home static fragment resources before rendering the shell", async () => {
    const source = await readSource();

    expect(source).toContain('import { prewarmStaticFragmentResources } from "./routes/fragment-resource";');
    expect(source).toContain("const staticFragmentPrewarmPromise = import.meta.env.PROD");
    expect(source).toContain('resolveStaticBootstrapMode(pathname) === "home-static"');
    expect(source).toContain("return staticFragmentPrewarmPromise.then(() => renderStaticShell());");
  });

  it("injects the static bootstrap perf tag in head for every static route mode", async () => {
    const source = await readSource();

    expect(source).toContain(
      '`${preloadTags}${stylePreloadTags}${deferredHomeGlobalStyleMetaTag}${perfScriptTag}${scriptTag}</head>`',
    );
    expect(source).toContain(
      '.replace("</head>", `${preloadTags}${stylePreloadTags}${perfScriptTag}</head>`)',
    );
    expect(source).toContain('.replace("</body>", `${scriptTag}</body>`);');
  });

  it("guards against a missing client manifest during preview static-shell rendering", async () => {
    const source = await readSource();

    expect(source).toContain("const resolvedManifest = manifest as");
    expect(source).toContain("if (!resolvedManifest || typeof resolvedManifest !== \"object\")");
    expect(source).toContain("return undefined;");
  });

  it("applies the filtered render manifest after incoming render options", async () => {
    const source = await readSource();

    expect(source).toContain("const renderManifest = resolveRenderManifest();");
    expect(source).toContain("const renderOptions = {");
    expect(source).toContain("...opts,");
    expect(source).toContain("manifest: renderManifest,");
    expect(source.indexOf("...opts,")).toBeLessThan(
      source.indexOf("manifest: renderManifest,"),
    );
  });
});
