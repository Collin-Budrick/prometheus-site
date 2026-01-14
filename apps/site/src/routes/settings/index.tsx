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
import {
  buildChatSettingsKey,
  defaultChatSettings,
  parseChatSettings,
  saveChatSettings,
  type ChatSettings
} from '../../shared/chat-settings'

type ProtectedRouteData = {
  lang: Lang
  userId?: string
}

const isLocalHost = (hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'

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

export const useSettingsData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { lang, userId: session.user.id }
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
  const chatSettings = useSignal<ChatSettings>({ ...defaultChatSettings })
  const swOptOut = useSignal(false)
  const swStatus = useSignal<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navSettings)
  const userId = data.value.userId

  useVisibleTask$(() => {
    if (typeof window === 'undefined') return
    const key = buildChatSettingsKey(userId)
    const stored = parseChatSettings(window.localStorage.getItem(key))
    if (!stored) {
      saveChatSettings(userId, defaultChatSettings)
      chatSettings.value = { ...defaultChatSettings }
      return
    }
    chatSettings.value = { ...defaultChatSettings, ...stored }
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    try {
      swOptOut.value = window.localStorage.getItem('fragment:sw-opt-out') === '1'
    } catch {
      swOptOut.value = false
    }

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
    updateChatSettings({ ...chatSettings.value, readReceipts: !chatSettings.value.readReceipts })
  })

  const toggleTypingIndicators = $(() => {
    updateChatSettings({ ...chatSettings.value, typingIndicators: !chatSettings.value.typingIndicators })
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
