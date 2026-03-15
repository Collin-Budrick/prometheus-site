import { $, component$, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { appConfig } from '../../public-app-config'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../../shared/lang-bridge'
import { createCacheHandler, PRIVATE_REVALIDATE_CACHE } from '../cache-headers'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'
import { ensureFriendCode, rotateFriendCode } from '../../components/contact-invites/friend-code'
import { readServiceWorkerSeedFromCookie, writeServiceWorkerOptOutCookie } from '../../shared/service-worker-seed'
import {
  defaultChatSettings,
  readChatSettingsFromCookie,
  saveChatSettings,
  type ChatSettings
} from '../../shared/chat-settings'
import settingsStyles from './settings.css?inline'
import {
  getPrivacyScreenAlwaysOn,
  setPrivacyScreenAlwaysOn,
  setSensitivePrivacyView
} from '../../native/privacy-screen-policy'
import { applyTextZoom, getStoredTextZoom } from '../../native/text-zoom'
import { clearNativeAuthCredentials } from '../../native/native-auth'
import { isNativeShellRuntime } from '../../native/runtime'
import { settingsLanguageSelection, type LanguageSeedPayload } from '../../lang/selection'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { createStaticIslandRouteData } from '../../static-shell/island-static-data'
import { STATIC_ISLAND_DATA_SCRIPT_ID } from '../../static-shell/constants'
import { isStaticShellBuild } from '../../static-shell/build-mode'
import { signOutSpacetimeAuth } from '../../shared/spacetime-auth'

type ProtectedRouteData = {
  lang: Lang
  user?: {
    id?: string
    name?: string
    email?: string
  }
  chatSettings: ChatSettings
  swOptOut: boolean
  languageSeed: LanguageSeedPayload
}

type FriendCodeUser = {
  id: string
  email?: string | null
  name?: string | null
}

const resolveFriendCodeUser = (user?: ProtectedRouteData['user']): FriendCodeUser | null => {
  if (!user?.id) return null
  const fallback: FriendCodeUser = {
    id: user.id,
    email: user.email?.trim() ? user.email : user.id,
    name: user.name?.trim() ? user.name : undefined
  }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem('auth:bootstrap:user')
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { id?: string; email?: string; name?: string | null } | null
    if (!parsed?.id || parsed.id !== user.id) return fallback
    const email = parsed.email?.trim() ? parsed.email : fallback.email ?? user.id
    const name = parsed.name?.trim() ? parsed.name : fallback.name
    return { id: parsed.id, email, name }
  } catch {
    return fallback
  }
}

export const useSettingsData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const lang = resolveRequestLang(request)
  if (isStaticShellBuild()) {
    const cookieHeader = request.headers.get('cookie')
    const chatSettings = readChatSettingsFromCookie(cookieHeader) ?? { ...defaultChatSettings }
    const swSeed = readServiceWorkerSeedFromCookie(cookieHeader)
    return {
      lang,
      user: undefined,
      chatSettings,
      swOptOut: Boolean(swSeed.optOut),
      languageSeed: createServerLanguageSeed(lang, settingsLanguageSelection)
    }
  }
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  const cookieHeader = request.headers.get('cookie')
  const chatSettings = readChatSettingsFromCookie(cookieHeader) ?? { ...defaultChatSettings }
  const swSeed = readServiceWorkerSeedFromCookie(cookieHeader)
  const swOptOut = Boolean(swSeed.optOut)
  return {
    lang,
    user: session.user,
    chatSettings,
    swOptOut,
    languageSeed: createServerLanguageSeed(lang, settingsLanguageSelection)
  }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_REVALIDATE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useSettingsData)
  const lang = data?.lang ?? defaultLang
  const copy = data?.languageSeed.ui
  const navSettings = copy?.navSettings ?? 'Settings'
  const description = (copy?.protectedDescription ?? '').replace('{{label}}', navSettings)

  return {
    title: `${navSettings} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  useStyles$(settingsStyles)
  const data = useSettingsData()
  useLanguageSeed(data.value.lang, data.value.languageSeed)
  const copy = useLangCopy(useSharedLangSignal(data.value.lang))
  const logoutBusy = useSignal(false)
  const logoutMessage = useSignal<string | null>(null)
  const chatSettings = useSignal<ChatSettings>(data.value.chatSettings ?? { ...defaultChatSettings })
  const swOptOut = useSignal(Boolean(data.value.swOptOut))
  const swStatus = useSignal<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  const nativeRuntime = useSignal(false)
  const friendCode = useSignal('')
  const friendCodeStatus = useSignal<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  const privacyAlwaysOn = useSignal(false)
  const textZoom = useSignal(100)
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navSettings)
  const user = data.value.user
  const userId = user?.id

  useVisibleTask$(() => {
    if (typeof window === 'undefined') return
    saveChatSettings(userId, chatSettings.value)
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    privacyAlwaysOn.value = getPrivacyScreenAlwaysOn()
    textZoom.value = getStoredTextZoom()
    void setSensitivePrivacyView(window.location.pathname.startsWith('/settings'))
    ctx.cleanup(() => {
      void setSensitivePrivacyView(false)
    })
  })

  useVisibleTask$(() => {
    if (typeof window === 'undefined') return
    nativeRuntime.value = isNativeShellRuntime()
    const friendUser = resolveFriendCodeUser(user)
    if (!friendUser) return
    friendCode.value = ensureFriendCode(friendUser)
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    if (isNativeShellRuntime()) return
    const handleCacheRefreshed = () => {
      swStatus.value = { tone: 'success', message: copy.value.settingsOfflineRefreshSuccess }
    }
    const handleCacheCleared = () => {
      swStatus.value = { tone: 'success', message: copy.value.settingsOfflineCleanupSuccess }
    }
    const handleSyncRequested = () => {
      swStatus.value = { tone: 'info', message: copy.value.settingsOfflineSyncQueued }
    }

    window.addEventListener('prom:sw-cache-refreshed', handleCacheRefreshed)
    window.addEventListener('prom:sw-cache-cleared', handleCacheCleared)
    window.addEventListener('prom:sw-sync-requested', handleSyncRequested)

    ctx.cleanup(() => {
      window.removeEventListener('prom:sw-cache-refreshed', handleCacheRefreshed)
      window.removeEventListener('prom:sw-cache-cleared', handleCacheCleared)
      window.removeEventListener('prom:sw-sync-requested', handleSyncRequested)
    })
  })

  const updateChatSettings = $((next: ChatSettings) => {
    chatSettings.value = next
    saveChatSettings(userId, next)
  })

  const toggleReadReceipts = $(() => {
    void updateChatSettings({ ...chatSettings.value, readReceipts: !chatSettings.value.readReceipts })
  })

  const toggleTypingIndicators = $(() => {
    void updateChatSettings({ ...chatSettings.value, typingIndicators: !chatSettings.value.typingIndicators })
  })

  const handleLogout = $(async () => {
    if (logoutBusy.value || typeof window === 'undefined') return
    logoutBusy.value = true
    logoutMessage.value = null
    try {
      const logoutUrl = await signOutSpacetimeAuth(appConfig.apiBase)
      await clearNativeAuthCredentials()
      window.location.assign(logoutUrl)
    } catch (error) {
      logoutMessage.value = error instanceof Error ? error.message : copy.value.settingsLogoutFailed
    } finally {
      logoutBusy.value = false
    }
  })

  const toggleOfflineCache = $(() => {
    if (typeof window === 'undefined') return
    if (nativeRuntime.value) return
    const next = !swOptOut.value
    swOptOut.value = next
    try {
      window.localStorage.setItem('fragment:sw-opt-out', next ? '1' : '0')
    } catch {
      swStatus.value = { tone: 'error', message: copy.value.settingsOfflineStorageError }
      return
    }
    writeServiceWorkerOptOutCookie(next)
    window.dispatchEvent(new CustomEvent('prom:sw-toggle-cache', { detail: { optOut: next } }))
    swStatus.value = {
      tone: 'info',
      message: next ? copy.value.settingsOfflineDisabled : copy.value.settingsOfflineEnabled
    }
  })

  const handleOfflineRefresh = $(() => {
    if (typeof window === 'undefined') return
    if (nativeRuntime.value) return
    window.dispatchEvent(new CustomEvent('prom:sw-refresh-cache'))
    swStatus.value = { tone: 'info', message: copy.value.settingsOfflineRefreshPending }
  })

  const handleOfflineCleanup = $(() => {
    if (typeof window === 'undefined') return
    if (nativeRuntime.value) return
    window.dispatchEvent(new CustomEvent('prom:sw-clear-cache'))
    swStatus.value = { tone: 'info', message: copy.value.settingsOfflineCleanupPending }
  })

  const handleCopyFriendCode = $(async () => {
    const value = friendCode.value.trim()
    if (!value) {
      friendCodeStatus.value = { tone: 'error', message: copy.value.settingsInviteUnavailable }
      return
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      friendCodeStatus.value = { tone: 'error', message: copy.value.settingsInviteUnavailable }
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      friendCodeStatus.value = { tone: 'success', message: copy.value.settingsInviteCopied }
    } catch {
      friendCodeStatus.value = { tone: 'error', message: copy.value.settingsInviteUnavailable }
    }
  })

  const handleRotateFriendCode = $(() => {
    const friendUser = resolveFriendCodeUser(user)
    if (!friendUser) {
      friendCodeStatus.value = { tone: 'error', message: copy.value.settingsInviteUnavailable }
      return
    }
    friendCode.value = rotateFriendCode(friendUser)
    friendCodeStatus.value = { tone: 'success', message: copy.value.settingsInviteRotated }
  })

  const togglePrivacyAlwaysOn = $(async () => {
    const next = !privacyAlwaysOn.value
    privacyAlwaysOn.value = next
    await setPrivacyScreenAlwaysOn(next)
  })

  const handleTextZoomInput = $(async (event: Event) => {
    const target = event.target as HTMLInputElement | null
    if (!target) return
    const value = Number(target.value)
    if (!Number.isFinite(value)) return
    textZoom.value = value
    await applyTextZoom(value)
  })

  return (
    <StaticPageRoot
      routeDataScriptId={STATIC_ISLAND_DATA_SCRIPT_ID}
      routeData={createStaticIslandRouteData('/settings', data.value.lang, 'settings')}
    >
      <StaticRouteTemplate
        metaLine={copy.value.protectedMetaLine}
        title={copy.value.navSettings}
        description={description}
        actionLabel={copy.value.authLogoutLabel}
        actionDisabled={logoutBusy.value}
        onAction$={handleLogout}
        closeLabel={copy.value.fragmentClose}
      >
        <div data-static-settings-root>
      <section class="settings-panel">
        <div class="settings-panel-header">
          <span class="settings-panel-title">{copy.value.settingsChatTitle}</span>
          <p class="settings-panel-description">{copy.value.settingsChatDescription}</p>
        </div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-title">{copy.value.settingsChatReadReceipts}</span>
            <span class="settings-toggle-hint">{copy.value.settingsChatReadReceiptsHint}</span>
          </div>
          <button
            type="button"
            class="chat-settings-toggle"
            data-active={chatSettings.value.readReceipts ? 'true' : 'false'}
            data-static-settings-toggle="read-receipts"
            role="switch"
            aria-checked={chatSettings.value.readReceipts}
            onClick$={toggleReadReceipts}
          >
            <span class="chat-settings-toggle-track">
              <span class="chat-settings-toggle-knob" />
            </span>
          </button>
        </div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-title">{copy.value.settingsChatTypingIndicators}</span>
            <span class="settings-toggle-hint">{copy.value.settingsChatTypingIndicatorsHint}</span>
          </div>
          <button
            type="button"
            class="chat-settings-toggle"
            data-active={chatSettings.value.typingIndicators ? 'true' : 'false'}
            data-static-settings-toggle="typing-indicators"
            role="switch"
            aria-checked={chatSettings.value.typingIndicators}
            onClick$={toggleTypingIndicators}
          >
            <span class="chat-settings-toggle-track">
              <span class="chat-settings-toggle-knob" />
            </span>
          </button>
        </div>
      </section>
      <section class="settings-panel">
        <div class="settings-panel-header">
          <span class="settings-panel-title">{copy.value.settingsInviteTitle}</span>
          <p class="settings-panel-description">{copy.value.settingsInviteDescription}</p>
        </div>
        <div class="settings-invite-row">
          <div class="settings-invite-label">
            <span class="settings-toggle-title">{copy.value.settingsInviteCodeLabel}</span>
          </div>
          <div class="settings-invite-actions">
            <button
              type="button"
              class="settings-action-button"
              disabled={!friendCode.value}
              data-static-settings-action="copy-friend-code"
              onClick$={handleCopyFriendCode}
            >
              {copy.value.settingsInviteCopyAction}
            </button>
            <button
              type="button"
              class="settings-action-button"
              data-static-settings-action="rotate-friend-code"
              onClick$={handleRotateFriendCode}
            >
              {copy.value.settingsInviteRotateAction}
            </button>
          </div>
        </div>
        <textarea
          class="settings-invite-code"
          readOnly
          value={friendCode.value}
          data-static-settings-friend-code
          aria-label={copy.value.settingsInviteCodeLabel}
        />
        {friendCodeStatus.value ? (
          <div
            class="auth-status"
            role="status"
            aria-live="polite"
            data-tone={friendCodeStatus.value.tone}
            data-static-settings-friend-status
          >
            {friendCodeStatus.value.message}
          </div>
        ) : null}
      </section>
      {!nativeRuntime.value ? (
        <section class="settings-panel">
          <div class="settings-panel-header">
            <span class="settings-panel-title">{copy.value.settingsOfflineTitle}</span>
            <p class="settings-panel-description">{copy.value.settingsOfflineDescription}</p>
          </div>
          <div class="settings-toggle-row">
            <div class="settings-toggle-label">
              <span class="settings-toggle-title">{copy.value.settingsOfflineToggleLabel}</span>
              <span class="settings-toggle-hint">{copy.value.settingsOfflineToggleHint}</span>
            </div>
            <button
              type="button"
              class="chat-settings-toggle"
              data-active={!swOptOut.value ? 'true' : 'false'}
              data-static-settings-toggle="offline-cache"
              role="switch"
              aria-checked={!swOptOut.value}
              onClick$={toggleOfflineCache}
            >
              <span class="chat-settings-toggle-track">
                <span class="chat-settings-toggle-knob" />
              </span>
            </button>
          </div>
          <div class="settings-action-row">
            <div class="settings-action-label">
              <span class="settings-toggle-title">{copy.value.settingsOfflineRefreshLabel}</span>
              <span class="settings-toggle-hint">{copy.value.settingsOfflineRefreshHint}</span>
            </div>
            <button
              type="button"
              class="settings-action-button"
              data-static-settings-action="offline-refresh"
              onClick$={handleOfflineRefresh}
            >
              {copy.value.settingsOfflineRefreshAction}
            </button>
          </div>
          <div class="settings-action-row">
            <div class="settings-action-label">
              <span class="settings-toggle-title">{copy.value.settingsOfflineCleanupLabel}</span>
              <span class="settings-toggle-hint">{copy.value.settingsOfflineCleanupHint}</span>
            </div>
            <button
              type="button"
              class="settings-action-button"
              data-static-settings-action="offline-cleanup"
              onClick$={handleOfflineCleanup}
            >
              {copy.value.settingsOfflineCleanupAction}
            </button>
          </div>
          {swStatus.value ? (
            <div
              class="auth-status"
              role="status"
              aria-live="polite"
              data-tone={swStatus.value.tone}
              data-static-settings-sw-status
            >
              {swStatus.value.message}
            </div>
          ) : null}
        </section>
      ) : null}

      <section class="settings-panel">
        <div class="settings-panel-header">
          <span class="settings-panel-title">{copy.value.settingsNativeAccessibilityTitle}</span>
          <p class="settings-panel-description">{copy.value.settingsNativeAccessibilityDescription}</p>
        </div>
        <div class="settings-action-row">
          <div class="settings-action-label">
            <label class="settings-toggle-title" for="settings-text-zoom">
              {copy.value.settingsNativeTextZoomAction} ({textZoom.value}%)
            </label>
            <span class="settings-toggle-hint">{copy.value.settingsNativeTextZoomHint}</span>
          </div>
          <input
            id="settings-text-zoom"
            class="settings-range"
            type="range"
            min="85"
            max="140"
            step="5"
            value={textZoom.value}
            aria-valuemin={85}
            aria-valuemax={140}
            aria-valuenow={textZoom.value}
            aria-label={copy.value.settingsNativeTextZoomAriaLabel}
            data-static-settings-text-zoom
            onInput$={handleTextZoomInput}
          />
        </div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-title">{copy.value.settingsNativePrivacyShieldAction}</span>
            <span class="settings-toggle-hint">{copy.value.settingsNativePrivacyShieldHint}</span>
          </div>
          <button
            type="button"
            class="chat-settings-toggle"
            data-active={privacyAlwaysOn.value ? 'true' : 'false'}
            data-static-settings-toggle="privacy-always-on"
            role="switch"
            aria-checked={privacyAlwaysOn.value}
            onClick$={togglePrivacyAlwaysOn}
          >
            <span class="chat-settings-toggle-track">
              <span class="chat-settings-toggle-knob" />
            </span>
          </button>
        </div>
      </section>
      {logoutMessage.value ? (
        <div class="auth-status" role="status" aria-live="polite" data-tone="error" data-static-settings-logout-status>
          {logoutMessage.value}
        </div>
      ) : null}
        </div>
      </StaticRouteTemplate>
    </StaticPageRoot>
  )
})
