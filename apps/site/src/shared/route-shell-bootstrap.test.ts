import { describe, expect, it } from 'bun:test'

import { buildRouteShellBootstrapScript } from './route-shell-bootstrap'

describe('route shell bootstrap script', () => {
  it('keeps navigation state wiring but leaves document warmup ownership to the shared controller', () => {
    const script = buildRouteShellBootstrapScript({
      navigationDescriptors: [
        { href: '/?lang=en', rootHref: '/', index: 0 },
        { href: '/store?lang=en', rootHref: '/store', index: 1 }
      ],
      warmupDescriptors: [
        { href: '/store?lang=en', safety: 'prefetch-only', warmupAudience: 'public' }
      ],
      isAuthenticated: false
    })

    expect(script).toContain('sessionStorage.setItem')
    expect(script).toContain("document.addEventListener('click'")
    expect(script).not.toContain('data-route-speculation="shell"')
    expect(script).not.toContain('data-route-prefetch="shell"')
    expect(script).not.toContain('requestIdleCallback(run')
  })
})
