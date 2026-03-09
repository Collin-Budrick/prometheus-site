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

export const StaticLoginRoute = component$<StaticLoginRouteProps>(({ lang, initialFormState }) => {
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
            <div
              class="auth-card"
              data-static-login-root
              data-mode="login"
              data-state="idle"
              data-passkey="idle"
            >
              <div class="auth-header">
                <div class="meta-line">{copy.value.loginMetaLine}</div>
                <div class="auth-title">
                  <h1 data-static-login-title>{copy.value.loginTitle}</h1>
                  <p data-static-login-description>{copy.value.loginDescription}</p>
                </div>
              </div>

              <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
                <button
                  class="auth-tab"
                  type="button"
                  role="tab"
                  aria-selected="true"
                  aria-controls="auth-panel-login"
                  data-static-login-tab="login"
                  data-static-login-disable
                >
                  {copy.value.loginTab}
                </button>
                <button
                  class="auth-tab"
                  type="button"
                  role="tab"
                  aria-selected="false"
                  aria-controls="auth-panel-signup"
                  data-static-login-tab="signup"
                  data-static-login-disable
                >
                  {copy.value.signupTab}
                </button>
              </div>

              <div class="auth-panels">
                <form
                  id="auth-panel-login"
                  class="auth-panel"
                  data-panel="login"
                  data-static-login-panel="login"
                  data-static-login-form="login"
                  role="tabpanel"
                  aria-hidden="false"
                >
                  <label class="auth-field">
                    <span>{copy.value.authEmailLabel}</span>
                    <input
                      class="auth-input"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="name@domain.com"
                      value={initialFormState.email}
                      required
                      data-static-login-email
                      data-static-login-disable
                    />
                  </label>
                  <label class="auth-field">
                    <span>{copy.value.authPasswordLabel}</span>
                    <input
                      class="auth-input"
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      placeholder="********"
                      required
                      data-static-login-disable
                    />
                  </label>
                  <label class="auth-check">
                    <input
                      class="auth-check-input"
                      type="checkbox"
                      name="remember"
                      checked={initialFormState.remember}
                      data-static-login-remember
                      data-static-login-disable
                    />
                    <span>{copy.value.authRememberLabel}</span>
                  </label>
                  <div class="auth-actions">
                    <button class="auth-primary" type="submit" data-static-login-disable>
                      {copy.value.loginAction}
                    </button>
                    <button
                      class="auth-passkey"
                      type="button"
                      data-static-login-passkey
                      data-static-login-disable
                    >
                      <span class="auth-passkey-label">{copy.value.authPasskeyLabel}</span>
                      <span class="auth-passkey-hint">{copy.value.authPasskeyHint}</span>
                    </button>
                    <button
                      class="auth-biometric"
                      type="button"
                      hidden
                      data-static-login-biometric
                      data-static-login-disable
                    >
                      <span class="auth-biometric-label">{copy.value.authBiometricLoginLabel}</span>
                      <span class="auth-biometric-hint">{copy.value.authBiometricLoginHint}</span>
                    </button>
                  </div>
                  <div class="auth-social" hidden data-static-login-social="login">
                    <p class="auth-social-label">{copy.value.authSocialSectionLabel}</p>
                    <div class="auth-social-actions" data-static-login-social-actions="login" />
                  </div>
                </form>

                <form
                  id="auth-panel-signup"
                  class="auth-panel"
                  data-panel="signup"
                  data-static-login-panel="signup"
                  data-static-login-form="signup"
                  role="tabpanel"
                  aria-hidden="true"
                  hidden
                >
                  <label class="auth-field">
                    <span>{copy.value.authNameLabel}</span>
                    <input
                      class="auth-input"
                      type="text"
                      name="name"
                      autoComplete="name"
                      placeholder="Nova Lane"
                      value={initialFormState.name}
                      minLength={2}
                      maxLength={64}
                      required
                      data-static-login-name
                      data-static-login-disable
                    />
                  </label>
                  <label class="auth-field">
                    <span>{copy.value.authEmailLabel}</span>
                    <input
                      class="auth-input"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="name@domain.com"
                      value={initialFormState.email}
                      required
                      data-static-login-email
                      data-static-login-disable
                    />
                  </label>
                  <label class="auth-field">
                    <span>{copy.value.authPasswordLabel}</span>
                    <input
                      class="auth-input"
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      placeholder="********"
                      minLength={6}
                      required
                      data-static-login-disable
                    />
                  </label>
                  <label class="auth-check">
                    <input
                      class="auth-check-input"
                      type="checkbox"
                      name="remember"
                      checked={initialFormState.remember}
                      data-static-login-remember
                      data-static-login-disable
                    />
                    <span>{copy.value.authRememberLabel}</span>
                  </label>
                  <div class="auth-actions">
                    <button class="auth-primary" type="submit" data-static-login-disable>
                      {copy.value.signupAction}
                    </button>
                  </div>
                  <div class="auth-social" hidden data-static-login-social="signup">
                    <p class="auth-social-label">{copy.value.authSocialSectionLabel}</p>
                    <div class="auth-social-actions" data-static-login-social-actions="signup" />
                  </div>
                </form>
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
