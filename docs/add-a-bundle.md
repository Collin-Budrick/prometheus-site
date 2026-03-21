# Add A Bundle

Use this contract whenever you add a detachable feature to the template. The goal is to keep every reusable feature removable by config rather than by file surgery.

## 1. Declare The Bundle

Add the new feature id to `packages/template-config/src/index.ts`, then define a `FeatureBundleManifest` entry with:

- `id`, `title`, and `description`
- `dependsOn`
- `routes`
- `envKeys`
- `composeProfiles`
- `navItems`
- `stories`
- `tests`
- `staticShellEntries`
- `apiRegistrations`
- `demoSections`
- `starterData`
- `visibility`
- `placement`
- `defaultEnabledIn`

If the bundle is reusable in starter projects, mark it `starter-safe`. If it is mostly showcase material, mark it `showcase-only`.

## 2. Gate The Runtime

Make the bundle optional everywhere it participates:

- Qwik routes use `ensureFeatureEnabled()` or `createFeatureRouteHandler()`
- site navigation comes from `collectTemplateNavItems()`
- Storybook story discovery comes from `collectTemplateStoryGlobs()`
- static-shell wiring is listed in the bundle manifest
- API registration is listed in the bundle manifest and only activated when the feature is enabled
- compose services only attach through bundle-owned profiles

Do not rely on “remember to delete this import later” patterns. Optional behavior should be data-driven by the bundle manifest.

## 3. Keep Demo Content Structured

If the bundle adds reusable demos or sample content:

- put reusable home/demo metadata in `apps/site/src/template-demos.ts`
- put starter/sample records in `apps/site/src/template-starter-data.ts`
- add the corresponding `demoSections` and `starterData` ids to the manifest

Keep copy and seed content editable without forcing future forks to change route logic.

## 4. Register Tests And Stories

Every bundle must declare the tests and stories it owns. That keeps `full` and `core` predictable and prevents orphaned coverage when a bundle is disabled.

At minimum:

- add Storybook story globs if the bundle ships reusable UI
- add unit/integration test globs
- add browser smoke coverage if the bundle changes visible route availability or dock behavior

## 5. Sync And Verify

After adding or changing a bundle:

1. Run `bun run template:sync`
2. Run `bun run check:template`
3. Run the relevant preset builds, typechecks, and tests
4. Rebuild and restart containers before testing `https://prometheus.prod/`

If the bundle can be disabled, confirm the disabled state removes nav links, returns `404` on owned routes, and avoids registering bundle-owned runtime hooks.
