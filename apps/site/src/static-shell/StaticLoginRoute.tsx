import { component$ } from '@builder.io/qwik'
import authModuleStyles from '@features/auth/auth.module.css'
import type { Lang } from '../lang'
import type { UiCopy } from '../lang/types'
import { STATIC_ISLAND_DATA_SCRIPT_ID } from './constants'
import { createStaticIslandRouteData } from './island-static-data'
import { StaticPageRoot } from './StaticPageRoot'

type StaticLoginRouteProps = {
  copy: Pick<
    UiCopy,
    | 'authHostedStatus'
    | 'authMethodsLabel'
    | 'authSocialSectionLabel'
    | 'loginAction'
    | 'loginDescription'
    | 'loginMetaLine'
    | 'loginTitle'
  >
  lang: Lang
}

const authClass = {
  shell: authModuleStyles['auth-shell'],
  grid: authModuleStyles['auth-grid'],
  card: authModuleStyles['auth-card'],
  header: authModuleStyles['auth-header'],
  title: authModuleStyles['auth-title'],
  panels: authModuleStyles['auth-panels'],
  panel: authModuleStyles['auth-panel'],
  actions: authModuleStyles['auth-actions'],
  primary: authModuleStyles['auth-primary'],
  social: authModuleStyles['auth-social'],
  socialLabel: authModuleStyles['auth-social-label'],
  socialActions: authModuleStyles['auth-social-actions'],
  socialButton: authModuleStyles['auth-social-button'],
  status: authModuleStyles['auth-status']
} as const

export const StaticLoginRoute = component$<StaticLoginRouteProps>(({ copy, lang }) => {
  return (
    <StaticPageRoot
      routeDataScriptId={STATIC_ISLAND_DATA_SCRIPT_ID}
      routeData={createStaticIslandRouteData('/login', lang, 'login')}
    >
      <section class={['fragment-shell', authClass.shell].join(' ')}>
        <div class={['fragment-grid', authClass.grid].join(' ')} data-fragment-grid="main">
          <article class="fragment-card" style={{ gridColumn: 'span 12' }}>
            <div class={authClass.card} data-static-login-root data-mode="login" data-state="idle">
                <div class={authClass.header}>
                <div class="meta-line">{copy.loginMetaLine}</div>
                <div class={authClass.title}>
                  <h1>{copy.loginTitle}</h1>
                  <p>{copy.loginDescription}</p>
                </div>
              </div>

              <div class={authClass.panels}>
                <div
                  class={authClass.panel}
                  data-panel="login"
                  role="group"
                  aria-label={copy.authMethodsLabel}
                >
                  <div class={authClass.actions}>
                    <button
                      class={authClass.primary}
                      type="button"
                      data-static-login-method="magic-link"
                      data-static-login-disable
                    >
                      {copy.loginAction}
                    </button>
                  </div>

                  <div class={authClass.social}>
                    <p class={authClass.socialLabel}>{copy.authSocialSectionLabel}</p>
                    <div class={authClass.socialActions}>
                      <button
                        type="button"
                        class={authClass.socialButton}
                        data-static-login-method="google"
                        data-static-login-disable
                      >
                        Google
                      </button>
                      <button
                        type="button"
                        class={authClass.socialButton}
                        data-static-login-method="github"
                        data-static-login-disable
                      >
                        GitHub
                      </button>
                    </div>
                  </div>

                  <div class={authClass.status} role="status" aria-live="polite" data-tone="neutral">
                    {copy.authHostedStatus}
                  </div>
                </div>
              </div>

              <div
                class={authClass.status}
                role="status"
                aria-live="polite"
                hidden
                data-tone="neutral"
                data-static-login-status
              />
            </div>
          </article>
        </div>
      </section>
    </StaticPageRoot>
  )
})
