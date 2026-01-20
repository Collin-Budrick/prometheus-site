import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { appConfig } from '../../app-config'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'
import { clearBootstrapSession } from '../../shared/auth-bootstrap'
import { ensureFriendCode, rotateFriendCode } from '../../components/contact-invites/friend-code'
import {
  defaultChatSettings,
  readChatSettingsFromCookie,
  saveChatSettings,
  type ChatSettings
} from '../../shared/chat-settings'

type ProtectedRouteData = {
  lang: Lang
  user?: {
    id?: string
    name?: string
    email?: string
  }
  chatSettings: ChatSettings
  swOptOut: boolean
}

const isLocalHost = (hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'
const SW_OPT_OUT_COOKIE_KEY = 'prom-sw-opt-out'

const readCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name === key) {
      if (!raw) return ''
      try {
        return decodeURIComponent(raw)
      } catch {
        return null
      }
    }
  }
  return null
}

const readSwOptOutFromCookie = (cookieHeader: string | null) => {
  const raw = readCookieValue(cookieHeader, SW_OPT_OUT_COOKIE_KEY)
  return raw === '1' || raw === 'true'
}

const writeSwOptOutCookie = (optOut: boolean) => {
  if (typeof document === 'undefined') return
  document.cookie = `${SW_OPT_OUT_COOKIE_KEY}=${optOut ? '1' : '0'}; path=/; max-age=2592000; samesite=lax`
}

const resolveAuthBase = (origin: string, apiBase?: string) => {
  if (!apiBase) return ''
  if (apiBase.startsWith('/')) return apiBase
  try {
    const apiUrl = new URL(apiBase)
    const originUrl = new URL(origin)
    const apiHost = apiUrl.hostname
    const originHost = originUrl.hostname
    if (isLocalHost(apiHost) && !isLocalHost(originHost) && apiHost !== originHost) {
      return '/api'
    }
  } catch {
    return ''
  }
  return apiBase
}

const buildApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = resolveAuthBase(origin, apiBase)
  if (!base) return `${origin}${path}`

  if (base.startsWith('/')) {
    if (path.startsWith(base)) return `${origin}${path}`
    return `${origin}${base}${path}`
  }

  if (path.startsWith('/api')) {
    const normalizedBase = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${normalizedBase}${path}`
  }

  return `${base}${path}`
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
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  const cookieHeader = request.headers.get('cookie')
  const chatSettings = readChatSettingsFromCookie(cookieHeader) ?? { ...defaultChatSettings }
  const swOptOut = readSwOptOutFromCookie(cookieHeader)
  return { lang, user: session.user, chatSettings, swOptOut }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useSettingsData)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
  const description = copy.protectedDescription.replace('{{label}}', copy.navSettings)

  return {
    title: `${copy.navSettings} | ${siteBrand.name}`,
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
  const data = useSettingsData()
  const copy = useLangCopy()
  const logoutBusy = useSignal(false)
  const logoutMessage = useSignal<string | null>(null)
  const chatSettings = useSignal<ChatSettings>(data.value.chatSettings ?? { ...defaultChatSettings })
  const swOptOut = useSignal(Boolean(data.value.swOptOut))
  const swStatus = useSignal<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  const friendCode = useSignal('')
  const friendCodeStatus = useSignal<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navSettings)
  const user = data.value.user
  const userId = user?.id

  useVisibleTask$(() => {
    if (typeof window === 'undefined') return
    saveChatSettings(userId, chatSettings.value)
  })

  useVisibleTask$(() => {
    if (typeof window === 'undefined') return
    const friendUser = resolveFriendCodeUser(user)
    if (!friendUser) return
    friendCode.value = ensureFriendCode(friendUser)
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
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
      const origin = window.location.origin
      const response = await fetch(buildApiUrl('/auth/sign-out', origin, appConfig.apiBase), {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        logoutMessage.value = 'Unable to sign out.'
        return
      }

      clearBootstrapSession()
      window.location.assign('/')
    } catch (error) {
      logoutMessage.value = error instanceof Error ? error.message : 'Unable to sign out.'
    } finally {
      logoutBusy.value = false
    }
  })

  const toggleOfflineCache = $(() => {
    if (typeof window === 'undefined') return
    const next = !swOptOut.value
    swOptOut.value = next
    try {
      window.localStorage.setItem('fragment:sw-opt-out', next ? '1' : '0')
    } catch {
      swStatus.value = { tone: 'error', message: copy.value.settingsOfflineStorageError }
      return
    }
    writeSwOptOutCookie(next)
    window.dispatchEvent(new CustomEvent('prom:sw-toggle-cache', { detail: { optOut: next } }))
    swStatus.value = {
      tone: 'info',
      message: next ? copy.value.settingsOfflineDisabled : copy.value.settingsOfflineEnabled
    }
  })

  const handleOfflineRefresh = $(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('prom:sw-refresh-cache'))
    swStatus.value = { tone: 'info', message: copy.value.settingsOfflineRefreshPending }
  })

  const handleOfflineCleanup = $(() => {
    if (typeof window === 'undefined') return
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

  return (
    <StaticRouteTemplate
      metaLine={copy.value.protectedMetaLine}
      title={copy.value.navSettings}
      description={description}
      actionLabel={copy.value.authLogoutLabel}
      actionDisabled={logoutBusy.value}
      onAction$={handleLogout}
      closeLabel={copy.value.fragmentClose}
    >
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
              onClick$={handleCopyFriendCode}
            >
              {copy.value.settingsInviteCopyAction}
            </button>
            <button type="button" class="settings-action-button" onClick$={handleRotateFriendCode}>
              {copy.value.settingsInviteRotateAction}
            </button>
          </div>
        </div>
        <textarea
          class="settings-invite-code"
          readOnly
          value={friendCode.value}
          aria-label={copy.value.settingsInviteCodeLabel}
        />
        {friendCodeStatus.value ? (
          <div class="auth-status" role="status" aria-live="polite" data-tone={friendCodeStatus.value.tone}>
            {friendCodeStatus.value.message}
          </div>
        ) : null}
      </section>
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
          <button type="button" class="settings-action-button" onClick$={handleOfflineRefresh}>
            {copy.value.settingsOfflineRefreshAction}
          </button>
        </div>
        <div class="settings-action-row">
          <div class="settings-action-label">
            <span class="settings-toggle-title">{copy.value.settingsOfflineCleanupLabel}</span>
            <span class="settings-toggle-hint">{copy.value.settingsOfflineCleanupHint}</span>
          </div>
          <button type="button" class="settings-action-button" onClick$={handleOfflineCleanup}>
            {copy.value.settingsOfflineCleanupAction}
          </button>
        </div>
        {swStatus.value ? (
          <div class="auth-status" role="status" aria-live="polite" data-tone={swStatus.value.tone}>
            {swStatus.value.message}
          </div>
        ) : null}
      </section>
      {logoutMessage.value ? (
        <div class="auth-status" role="status" aria-live="polite" data-tone="error">
          {logoutMessage.value}
        </div>
      ) : null}
    </StaticRouteTemplate>
  )
})
