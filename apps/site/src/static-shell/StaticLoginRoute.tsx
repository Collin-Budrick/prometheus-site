import { component$, useStyles$ } from '@builder.io/qwik'
import type { AuthFormState } from '@features/auth/auth-form-state'
import authStyles from '@features/auth/auth.css?inline'
import type { Lang } from '../lang'
import { useLangCopy } from '../shared/lang-bridge'
import { STATIC_ISLAND_DATA_SCRIPT_ID } from './constants'
import { createStaticIslandRouteData } from './island-static-data'
import { StaticPageRoot } from './StaticPageRoot'

type StaticLoginRouteProps = {
  lang: Lang
  initialFormState: AuthFormState
}

export const StaticLoginRoute = component$<StaticLoginRouteProps>(({ lang }) => {
  useStyles$(authStyles)
  const copy = useLangCopy()

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
                <div class="meta-line">{copy.value.loginMetaLine}</div>
                <div class="auth-title">
                  <h1>{copy.value.loginTitle}</h1>
                  <p>{copy.value.loginDescription}</p>
                </div>
              </div>

              <div class="auth-panels">
                <div class="auth-panel" data-panel="login">
                  <div class="auth-actions">
                    <button
                      class="auth-primary"
                      type="button"
                      data-static-login-method="magic-link"
                      data-static-login-disable
                    >
                      Magic link
                    </button>
                  </div>

                  <div class="auth-social">
                    <p class="auth-social-label">{copy.value.authSocialSectionLabel}</p>
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
                    Hosted sign-in completes on SpacetimeAuth and returns here with an OIDC session.
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
