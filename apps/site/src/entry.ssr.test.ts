import { describe, expect, it } from "bun:test";

const readSource = async () =>
  await Bun.file(new URL("./entry.ssr.tsx", import.meta.url)).text();

describe("entry.ssr static bootstrap injection", () => {
  it("defines route-aware static shell runtime preloads", async () => {
    const source = await readSource();

    expect(source).toContain(
      '"home-static": [STATIC_BOOTSTRAP_BUNDLE_PATHS["home-static"]]',
    );
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
    expect(source).toContain('"/store": [');
    expect(source).toContain("store-static-runtime.js");
    expect(source).toContain("resolveStaticBootstrapPreloadPaths(pathname)");
  });
});
