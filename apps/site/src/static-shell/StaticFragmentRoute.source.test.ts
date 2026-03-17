import { describe, expect, it } from 'bun:test'

const readSource = async (path: string) =>
  await Bun.file(new URL(path, import.meta.url)).text()

describe('StaticFragmentRoute source invariants', () => {
  it('keeps static fragment cards visible at first paint across render paths', async () => {
    const [routeSource, bootstrapSource] = await Promise.all([
      readSource('./StaticFragmentRoute.tsx'),
      readSource('./static-bootstrap.ts')
    ])

    expect(routeSource).toContain('data-reveal-phase="visible"')
    expect(routeSource).toContain("[READY_STAGGER_STATE_ATTR]: 'done'")
    expect(routeSource).not.toContain("data-ready-stagger-state='queued'")
    expect(routeSource).not.toContain("data-reveal-phase='queued'")
    expect(routeSource).not.toContain('buildFragmentHeightPersistenceScript')

    expect(bootstrapSource).toContain('data-reveal-phase="visible"')
    expect(bootstrapSource).toContain('data-ready-stagger-state="done"')
    expect(bootstrapSource).not.toContain('data-ready-stagger-state="queued"')
    expect(bootstrapSource).not.toContain('data-reveal-phase="queued"')
  })
})
