import { describe, expect, it } from 'bun:test'
import { homeUiKeys, loginUiKeys } from '../../lang/selection'

const readSource = async (relativePath: string) =>
  Bun.file(new URL(relativePath, import.meta.url)).text()

describe('pretext contract wiring', () => {
  it('keeps shared shell copy on the language selection surfaces', () => {
    expect(homeUiKeys).toContain('homeIntroAuditLine')
    expect(homeUiKeys).toContain('homePrimaryStoreAction')
    expect(homeUiKeys).toContain('homePrimaryLabAction')
    expect(homeUiKeys).toContain('homePrimaryAuthAction')
    expect(homeUiKeys).toContain('homePrimaryShellAction')
    expect(homeUiKeys).toContain('homeSecondaryAuthAction')
    expect(homeUiKeys).toContain('homeSecondaryOfflineAction')
    expect(loginUiKeys).toContain('loginRuntimePendingLabel')
    expect(loginUiKeys).toContain('loginNextLabel')
  })

  it('uses language-seeded copy instead of legacy inline defaults', async () => {
    const homeSource = await readSource('../home/StaticHomeRoute.tsx')
    const loginRouteSource = await readSource('../../routes/login/index.tsx')
    const loginShellSource = await readSource('../auth/StaticLoginRoute.tsx')

    expect(homeSource).toContain('uiCopy.homePrimaryStoreAction')
    expect(homeSource).toContain('uiCopy.homePrimaryLabAction')
    expect(homeSource).toContain('uiCopy.homePrimaryAuthAction')
    expect(homeSource).toContain('uiCopy.homePrimaryShellAction')
    expect(homeSource).toContain('uiCopy.homeSecondaryAuthAction')
    expect(homeSource).toContain('uiCopy.homeSecondaryOfflineAction')
    expect(homeSource).not.toContain('Open store shell')
    expect(homeSource).not.toContain('Launch lab shell')
    expect(homeSource).not.toContain('Open auth shell')
    expect(homeSource).not.toContain('Account route')
    expect(homeSource).not.toContain('Offline route')

    expect(loginRouteSource).toContain('loginRuntimePendingLabel')
    expect(loginRouteSource).toContain('loginNextLabel')
    expect(loginShellSource).toContain('copy.loginRuntimePendingLabel')
    expect(loginShellSource).toContain('copy.loginNextLabel')
    expect(loginShellSource).not.toContain('Waiting for runtime')
    expect(loginShellSource).not.toContain('After sign in:')
  })

  it('marks shared card and text shells with the pretext DOM contract', async () => {
    const fragmentCardSource = await readSource('../../../../../packages/ui/src/components/FragmentCard.tsx')
    const staticTemplateSource = await readSource(
      '../../../../../packages/ui/src/components/StaticRouteTemplate.tsx'
    )
    const loginShellSource = await readSource('../auth/StaticLoginRoute.tsx')

    expect(fragmentCardSource).toContain('data-pretext-card-root="true"')
    expect(staticTemplateSource).toContain('data-pretext-role="meta"')
    expect(staticTemplateSource).toContain('data-pretext-role="title"')
    expect(staticTemplateSource).toContain('data-pretext-role="body"')
    expect(loginShellSource).toContain('data-pretext-role="meta"')
    expect(loginShellSource).toContain('data-pretext-role="title"')
    expect(loginShellSource).toContain('data-pretext-role="body"')
  })
})
