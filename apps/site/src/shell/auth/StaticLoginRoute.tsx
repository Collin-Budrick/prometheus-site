import { component$ } from '@builder.io/qwik'
import authModuleStyles from '@site/features/auth/auth.module.css'
import { FRAGMENT_RESERVED_HEIGHT_VAR } from '@prometheus/ui/fragment-height'
import type { Lang } from '../../lang'
import type { UiCopy } from '../../lang/types'
import { STATIC_ISLAND_DATA_SCRIPT_ID } from '../core/constants'
import { createStaticIslandRouteData } from '../core/island-static-data'
import { StaticPageRoot } from '../core/StaticPageRoot'
import {
  buildPretextCardAttrs,
  buildPretextTextAttrs,
  PRETEXT_BODY_SPEC,
  PRETEXT_LOGIN_STATUS_SPEC,
  PRETEXT_META_SPEC,
  PRETEXT_TITLE_SPEC
} from '../pretext/pretext-static'
import {
  resolveStaticLoginRuntimeHint,
  resolveStaticLoginRuntimeLabel,
  type StaticLoginHostedProvider,
  type StaticLoginRuntimeMode
} from './static-login-runtime'

type StaticLoginRouteProps = {
  copy: Pick<
    UiCopy,
    | 'authHostedStatus'
    | 'authNotConfigured'
    | 'authMethodsLabel'
    | 'authEmailLabel'
    | 'authNameLabel'
    | 'authPasskeyHint'
    | 'authPasskeyLabel'
    | 'authPasswordLabel'
    | 'authRememberLabel'
    | 'authSocialSectionLabel'
    | 'loginNextLabel'
    | 'loginAction'
    | 'loginDescription'
    | 'loginMetaLine'
    | 'loginRuntimePendingLabel'
    | 'loginTab'
    | 'loginTitle'
    | 'signupAction'
    | 'signupDescription'
    | 'signupTab'
    | 'signupTitle'
  >
  lang: Lang
  hostedProviders: ReadonlyArray<StaticLoginHostedProvider>
  nextPath?: string | null
  runtimeMode: StaticLoginRuntimeMode
}

const authClass = {
  shell: authModuleStyles['auth-shell'],
  grid: authModuleStyles['auth-grid'],
  card: authModuleStyles['auth-card'],
  header: authModuleStyles['auth-header'],
  title: authModuleStyles['auth-title'],
  tabs: authModuleStyles['auth-tabs'],
  tab: authModuleStyles['auth-tab'],
  panels: authModuleStyles['auth-panels'],
  panel: authModuleStyles['auth-panel'],
  field: authModuleStyles['auth-field'],
  input: authModuleStyles['auth-input'],
  check: authModuleStyles['auth-check'],
  checkInput: authModuleStyles['auth-check-input'],
  actions: authModuleStyles['auth-actions'],
  passkey: authModuleStyles['auth-passkey'],
  passkeyHint: authModuleStyles['auth-passkey-hint'],
  passkeyLabel: authModuleStyles['auth-passkey-label'],
  primary: authModuleStyles['auth-primary'],
  social: authModuleStyles['auth-social'],
  socialLabel: authModuleStyles['auth-social-label'],
  socialActions: authModuleStyles['auth-social-actions'],
  socialButton: authModuleStyles['auth-social-button'],
  status: authModuleStyles['auth-status']
} as const

const STATIC_LOGIN_CARD_HEIGHT_HINTS: Record<Lang, { default: number; withNext: number }> = {
  en: { default: 420, withNext: 456 },
  ja: { default: 440, withNext: 476 },
  ko: { default: 452, withNext: 488 }
}

export const StaticLoginRoute = component$<StaticLoginRouteProps>(({
  copy,
  lang,
  hostedProviders,
  nextPath = null,
  runtimeMode
}) => {
  const cardAttrs = buildPretextCardAttrs({ mode: 'floor' })
  const cardHeightProfile =
    STATIC_LOGIN_CARD_HEIGHT_HINTS[lang] ?? STATIC_LOGIN_CARD_HEIGHT_HINTS.en
  const cardHeightHint = nextPath ? cardHeightProfile.withNext : cardHeightProfile.default
  const formsEnabled = runtimeMode !== 'disabled'
  const showHostedProviders = runtimeMode === 'hosted' && hostedProviders.length > 0
  const headerMetaAttrs = buildPretextTextAttrs({
    ...PRETEXT_META_SPEC,
    lang,
    role: 'meta',
    text: copy.loginMetaLine,
    widthKind: 'layout-shell-card'
  })
  const headerTitleAttrs = buildPretextTextAttrs({
    ...PRETEXT_TITLE_SPEC,
    lang,
    maxWidthCh: 42,
    role: 'title',
    text: copy.loginTitle,
    widthKind: 'layout-shell-card'
  })
  const headerBodyAttrs = buildPretextTextAttrs({
    ...PRETEXT_BODY_SPEC,
    lang,
    maxWidthCh: 64,
    role: 'body',
    text: copy.loginDescription,
    widthKind: 'layout-shell-card'
  })
  const runtimeLabelAttrs = buildPretextTextAttrs({
    ...PRETEXT_META_SPEC,
    lang,
    role: 'meta',
    text: resolveStaticLoginRuntimeLabel(runtimeMode, copy),
    widthKind: 'static-login-status'
  })
  const runtimeHintAttrs = buildPretextTextAttrs({
    ...PRETEXT_LOGIN_STATUS_SPEC,
    lang,
    maxWidthCh: 64,
    role: 'body',
    text: resolveStaticLoginRuntimeHint(runtimeMode, copy),
    widthKind: 'static-login-status'
  })
  const nextLabelAttrs = buildPretextTextAttrs({
    ...PRETEXT_META_SPEC,
    lang,
    role: 'meta',
    text: copy.loginNextLabel,
    widthKind: 'static-login-status'
  })
  const hostedStatusAttrs = buildPretextTextAttrs({
    ...PRETEXT_LOGIN_STATUS_SPEC,
    lang,
    maxWidthCh: 64,
    role: 'body',
    text: copy.authHostedStatus,
    widthKind: 'static-login-status'
  })
  const signupStatusAttrs = buildPretextTextAttrs({
    ...PRETEXT_LOGIN_STATUS_SPEC,
    lang,
    maxWidthCh: 64,
    role: 'body',
    text: copy.signupDescription,
    widthKind: 'static-login-status'
  })

  return (
    <StaticPageRoot
      routeDataScriptId={STATIC_ISLAND_DATA_SCRIPT_ID}
      routeData={createStaticIslandRouteData('/login', lang, 'login')}
    >
      <section class={['fragment-shell', authClass.shell].join(' ')}>
        <div class={['fragment-grid', authClass.grid].join(' ')} data-fragment-grid="main">
          <article
            class="fragment-card"
            style={{
              gridColumn: 'span 12',
              [FRAGMENT_RESERVED_HEIGHT_VAR]: `${cardHeightHint}px`
            }}
            data-pretext-card-root="true"
            data-fragment-height-hint={`${cardHeightHint}`}
            {...cardAttrs}
          >
            <div
              class={authClass.card}
              data-static-login-root
              data-static-login-next-path={nextPath ?? ''}
              data-mode="login"
              data-runtime-mode={runtimeMode}
              data-state="idle"
            >
              <div class={authClass.header}>
                <div class="meta-line" data-pretext-role="meta" {...headerMetaAttrs}>
                  {copy.loginMetaLine}
                </div>
                <div class={authClass.title}>
                  <h1 data-pretext-role="title" {...headerTitleAttrs}>
                    {copy.loginTitle}
                  </h1>
                  <p data-pretext-role="body" {...headerBodyAttrs}>
                    {copy.loginDescription}
                  </p>
                </div>
              </div>

              <div class={authClass.status} data-tone="neutral" data-static-login-runtime-banner>
                <div
                  class="meta-line"
                  data-static-login-runtime-label
                  data-pretext-role="meta"
                  {...runtimeLabelAttrs}
                >
                  {resolveStaticLoginRuntimeLabel(runtimeMode, copy)}
                </div>
                <p data-static-login-runtime-hint data-pretext-role="body" {...runtimeHintAttrs}>
                  {resolveStaticLoginRuntimeHint(runtimeMode, copy)}
                </p>
                <p hidden={!nextPath} data-static-login-next>
                  <strong
                    data-static-login-next-label
                    data-pretext-role="meta"
                    {...nextLabelAttrs}
                  >
                    {copy.loginNextLabel}
                  </strong>{' '}
                  <code data-static-login-next-code>{nextPath ?? ''}</code>
                </p>
              </div>

              <div class={authClass.tabs} role="tablist" aria-label={copy.authMethodsLabel}>
                <button
                  class={authClass.tab}
                  type="button"
                  role="tab"
                  aria-selected="true"
                  data-static-login-tab="login"
                >
                  {copy.loginTab}
                </button>
                <button
                  class={authClass.tab}
                  type="button"
                  role="tab"
                  aria-selected="false"
                  data-static-login-tab="signup"
                  data-static-login-signup-tab
                  hidden={!formsEnabled}
                >
                  {copy.signupTab}
                </button>
              </div>

              <div class={authClass.panels}>
                <form
                  class={authClass.panel}
                  data-panel="login"
                  data-static-login-form="login"
                  hidden={!formsEnabled}
                >
                  <label class={authClass.field}>
                    <span>{copy.authEmailLabel}</span>
                    <input
                      class={authClass.input}
                      type="email"
                      name="email"
                      autocomplete="email webauthn"
                      required
                      data-static-login-disable
                    />
                  </label>
                  <label class={authClass.field}>
                    <span>{copy.authPasswordLabel}</span>
                    <input
                      class={authClass.input}
                      type="password"
                      name="password"
                      autocomplete="current-password webauthn"
                      required
                      data-static-login-disable
                    />
                  </label>
                  <label class={authClass.check}>
                    <input
                      class={authClass.checkInput}
                      type="checkbox"
                      name="remember"
                      value="1"
                      data-static-login-disable
                    />
                    <span>{copy.authRememberLabel}</span>
                  </label>
                  <div class={authClass.actions}>
                    <button class={authClass.primary} type="submit" data-static-login-disable>
                      {copy.loginAction}
                    </button>
                    <button
                      class={authClass.passkey}
                      type="button"
                      hidden
                      data-static-login-passkey
                      data-static-login-disable
                    >
                      <span class={authClass.passkeyLabel}>{copy.authPasskeyLabel}</span>
                      <span class={authClass.passkeyHint}>{copy.authPasskeyHint}</span>
                    </button>
                  </div>
                  <div
                    class={authClass.status}
                    role="status"
                    aria-live="polite"
                    data-tone="neutral"
                    data-static-login-login-hint
                    data-pretext-role="body"
                    {...hostedStatusAttrs}
                  >
                    {copy.authHostedStatus}
                  </div>
                </form>

                <form
                  class={authClass.panel}
                  data-panel="signup"
                  data-static-login-form="signup"
                  hidden={!formsEnabled}
                >
                  <label class={authClass.field}>
                    <span>{copy.authNameLabel}</span>
                    <input
                      class={authClass.input}
                      type="text"
                      name="name"
                      autocomplete="name"
                      minLength={2}
                      required
                      data-static-login-disable
                    />
                  </label>
                  <label class={authClass.field}>
                    <span>{copy.authEmailLabel}</span>
                    <input
                      class={authClass.input}
                      type="email"
                      name="email"
                      autocomplete="email"
                      required
                      data-static-login-disable
                    />
                  </label>
                  <label class={authClass.field}>
                    <span>{copy.authPasswordLabel}</span>
                    <input
                      class={authClass.input}
                      type="password"
                      name="password"
                      autocomplete="new-password"
                      required
                      data-static-login-disable
                    />
                  </label>
                  <label class={authClass.check}>
                    <input
                      class={authClass.checkInput}
                      type="checkbox"
                      name="remember"
                      value="1"
                      data-static-login-disable
                    />
                    <span>{copy.authRememberLabel}</span>
                  </label>
                  <div
                    class={authClass.status}
                    role="status"
                    aria-live="polite"
                    data-tone="neutral"
                    data-pretext-role="body"
                    {...signupStatusAttrs}
                  >
                    {copy.signupDescription}
                  </div>
                  <div class={authClass.actions}>
                    <button class={authClass.primary} type="submit" data-static-login-disable>
                      {copy.signupAction}
                    </button>
                  </div>
                </form>
              </div>

              <div class={authClass.social} data-static-login-social hidden={!showHostedProviders}>
                <p class={authClass.socialLabel}>{copy.authSocialSectionLabel}</p>
                <div class={authClass.socialActions}>
                  {hostedProviders.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      class={authClass.socialButton}
                      data-static-login-method={id}
                      data-static-login-provider={id}
                      data-static-login-disable
                    >
                      {label}
                    </button>
                  ))}
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
