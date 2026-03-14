import { component$, useStyles$ } from '@builder.io/qwik'
import type { AuthFormState } from '@features/auth/auth-form-state'
import authStyles from '@features/auth/auth.css?inline'
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
  initialFormState: AuthFormState
}

export const StaticLoginRoute = component$<StaticLoginRouteProps>(({ copy, lang }) => {
  useStyles$(authStyles)

  return (
    <StaticPageRoot
      routeDataScriptId={STATIC_ISLAND_DATA_SCRIPT_ID}
      routeData={createStaticIslandRouteData('/login', lang, 'login')}
    >
      <section class="fragment-shell auth-shell">
        <div class="fragment-grid auth-grid" data-fragment-grid="main">
          <article class="fragment-card" style={{ gridColumn: 'span 12' }}>
            <div class="auth-card" data-static-login-root data-mode="login" data-state="idle">
                <div class="auth-header">
                <div class="meta-line">{copy.loginMetaLine}</div>
                <div class="auth-title">
                  <h1>{copy.loginTitle}</h1>
                  <p>{copy.loginDescription}</p>
                </div>
              </div>

              <div class="auth-panels">
                <div
                  class="auth-panel"
                  data-panel="login"
                  role="group"
                  aria-label={copy.authMethodsLabel}
                >
                  <div class="auth-actions">
                    <button
                      class="auth-primary"
                      type="button"
                      data-static-login-method="magic-link"
                      data-static-login-disable
                    >
                      {copy.loginAction}
                    </button>
                  </div>

                  <div class="auth-social">
                    <p class="auth-social-label">{copy.authSocialSectionLabel}</p>
                    <div class="auth-social-actions">
                      <button
                        type="button"
                        class="auth-social-button"
                        data-static-login-method="google"
                        data-static-login-disable
                      >
                        Google
                      </button>
                      <button
                        type="button"
                        class="auth-social-button"
                        data-static-login-method="github"
                        data-static-login-disable
                      >
                        GitHub
                      </button>
                    </div>
                  </div>

                  <div class="auth-status" role="status" aria-live="polite" data-tone="neutral">
                    {copy.authHostedStatus}
                  </div>
                </div>
              </div>

              <div
                class="auth-status"
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
