import { describe, expect, it } from "bun:test";

const readSource = async () =>
  await Bun.file(new URL("./entry.ssr.tsx", import.meta.url)).text();

describe("entry.ssr static bootstrap injection", () => {
  it("defines route-aware static shell runtime preloads", async () => {
    const source = await readSource();

    expect(source).toContain('"home-static": [');
    expect(source).toContain(
      '"build/static-shell/apps/site/src/static-shell/home-bootstrap-core-runtime.js"',
    );
    expect(source).toContain(
      '"build/static-shell/apps/site/src/fragment/runtime/worker.js"',
    );
    expect(source).toContain(
      '"build/static-shell/apps/site/src/fragment/runtime/decode-pool.worker.js"',
    );
    expect(source).toContain("buildImmediateHomeStaticEntryTag");
    expect(source).toContain(
      'void import(bootstrapHref).catch((error) => console.error("Static home entry immediate failed:", error));',
    );
    expect(source).not.toContain("HOME_STATIC_ENTRY_DEFER_DELAY_MS");
    expect(source).not.toContain("const loadFromIntent = (event) => {");
    expect(source).not.toContain('document.addEventListener("focusin", load');
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/static-shell/home-bootstrap-runtime.js"',
    );
    expect(source).not.toContain(
      '"build/static-shell/apps/site/src/static-shell/home-demo-entry.js"',
    );
    expect(source).toContain('"fragment-static": [');
    expect(source).toContain(
      '"build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js"',
    );
    expect(source).toContain('"island-static": [');
    expect(source).toContain(
      '"build/static-shell/apps/site/src/static-shell/island-bootstrap-runtime.js"',
    );
    expect(source).toContain("const STATIC_BOOTSTRAP_ROUTE_PRELOAD_PATHS = {} as const;");
    expect(source).not.toContain("store-static-runtime.js");
    expect(source).toContain("resolveStaticBootstrapPreloadPaths(pathname)");
  });

  it("strips the shared deferred stylesheet only on home static routes", async () => {
    const source = await readSource();

    expect(source).toContain("const stripHomeBlockingDeferredStylesheet = (html: string, pathname: string) => {");
    expect(source).toContain('if (resolveStaticBootstrapMode(pathname) !== "home-static")');
    expect(source).toContain('\\brel=["\']stylesheet["\']');
    expect(source).toContain('\\bhref=["\'][^"\']*global-deferred\\.css');
    expect(source).toContain('\\bas=["\']style["\']');
    expect(source).toContain("stripHomeBlockingDeferredStylesheet(");
  });

  it("still strips non-critical inline static-route styles only on home and fragment static routes", async () => {
    const source = await readSource();

    expect(source).toContain("const stripNonCriticalStaticRouteStyles = (html: string, pathname: string) => {");
    expect(source).toContain('if (mode !== "home-static" && mode !== "fragment-static")');
    expect(source).toContain('data-src=["\']');
    expect(source).toContain('*-style\\.css');
    expect(source).toContain("stripNonCriticalStaticRouteStyles(");
  });

  it("collapses home static critical css to a single hidden style block", async () => {
    const source = await readSource();

    expect(source).toContain("const minifyInlineCss = (value: string) =>");
    expect(source).toContain("const HOME_CRITICAL_STYLES = minifyInlineCss(homeCriticalStyles);");
    expect(source).toContain("const replaceHomeCriticalStyles = (html: string, pathname: string) => {");
    expect(source).toContain('if (resolveStaticBootstrapMode(pathname) !== "home-static")');
    expect(source).toContain("if (hiddenStyleIndex === 1) {");
    expect(source).toContain("return `<style hidden>${HOME_CRITICAL_STYLES}</style>`;");
    expect(source).toContain('return hiddenStyleIndex === 2 ? "" : match;');
    expect(source).not.toContain('.replace(/<style\\\\b[^>]*>[\\\\s\\\\S]*?\\\\.viewport-fade');
    expect(source).not.toContain('.replace(/<div\\\\b[^>]*class=["\'][^"\']*\\\\bviewport-fade');
  });

  it("prewarms home static fragment resources before rendering the shell", async () => {
    const source = await readSource();

    expect(source).toContain('import { prewarmStaticFragmentResources } from "./routes/fragment-resource";');
    expect(source).toContain("const staticFragmentPrewarmPromise = import.meta.env.PROD");
    expect(source).toContain('resolveStaticBootstrapMode(pathname) === "home-static"');
    expect(source).toContain("return staticFragmentPrewarmPromise.then(() => renderStaticShell());");
  });
});
