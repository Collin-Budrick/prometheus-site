import type { Lang } from '../../lang'
import { clearBootstrapSession } from '../../shared/auth-bootstrap'
import { ensureFriendCode, rotateFriendCode } from '../../components/contact-invites/friend-code'
import { writeServiceWorkerOptOutCookie } from '../../shared/service-worker-seed'
import { defaultChatSettings, loadChatSettings, saveChatSettings, type ChatSettings } from '../../shared/chat-settings'
import { getPrivacyScreenAlwaysOn, setPrivacyScreenAlwaysOn } from '../../native/privacy-screen-policy'
import { applyTextZoom, getStoredTextZoom } from '../../native/text-zoom'
import { clearNativeAuthCredentials } from '../../native/native-auth'
import { isNativeShellRuntime } from '../../native/runtime'
import { buildPublicApiUrl } from '../../shared/public-api-url'

type SettingsUser = {
  id?: string
  name?: string
  email?: string
}

type MountStaticSettingsControllerOptions = {
  lang: Lang
  user?: SettingsUser
}

type FriendCodeUser = {
  id: string
  email?: string | null
  name?: string
}

const resolveFriendCodeUser = (user?: SettingsUser): FriendCodeUser | null => {
  if (!user?.id) return null
  const fallback: FriendCodeUser = {
    id: user.id,
    email: user.email?.trim() ? user.email : user.id,
    name: user.name?.trim() ? user.name : undefined
  }
  try {
    const raw = window.localStorage.getItem('auth:bootstrap:user')
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { id?: string; email?: string; name?: string | null } | null
    if (!parsed?.id || parsed.id !== user.id) return fallback
    return {
      id: parsed.id,
      email: parsed.email?.trim() ? parsed.email : fallback.email,
      name: parsed.name?.trim() ? parsed.name : fallback.name
    }
  } catch {
    return fallback
  }
}

const ensureStatusElement = (root: HTMLElement, selector: string) => {
  const existing = root.querySelector<HTMLElement>(selector)
  if (existing) return existing
  const next = document.createElement('div')
  next.className = 'auth-status'
  next.setAttribute('role', 'status')
  next.setAttribute('aria-live', 'polite')
  if (selector === '[data-static-settings-sw-status]') {
    next.dataset.staticSettingsSwStatus = ''
  } else if (selector === '[data-static-settings-friend-status]') {
    next.dataset.staticSettingsFriendStatus = ''
  } else {
    next.dataset.staticSettingsLogoutStatus = ''
  }
  root.append(next)
  return next
}

const setStatus = (
  root: HTMLElement,
  selector: string,
  tone: 'success' | 'error' | 'info',
  message: string | null
) => {
  const element = ensureStatusElement(root, selector)
  element.dataset.tone = tone
  element.textContent = message ?? ''
  element.hidden = !message
}

const updateToggleButton = (button: HTMLButtonElement | null, value: boolean) => {
  if (!button) return
  button.dataset.active = value ? 'true' : 'false'
  button.setAttribute('aria-checked', value ? 'true' : 'false')
}

export const mountStaticSettingsController = ({ lang, user }: MountStaticSettingsControllerOptions) => {
  const root = document.querySelector<HTMLElement>('[data-static-settings-root]')
  if (!root) {
    return { cleanup() {} }
  }

  const cleanupFns: Array<() => void> = []
  const logoutButton = document.querySelector<HTMLButtonElement>('[data-static-route-action]')
  const readReceiptsButton = root.querySelector<HTMLButtonElement>('[data-static-settings-toggle="read-receipts"]')
  const typingIndicatorsButton = root.querySelector<HTMLButtonElement>('[data-static-settings-toggle="typing-indicators"]')
  const offlineCacheButton = root.querySelector<HTMLButtonElement>('[data-static-settings-toggle="offline-cache"]')
  const privacyAlwaysOnButton = root.querySelector<HTMLButtonElement>('[data-static-settings-toggle="privacy-always-on"]')
  const offlineRefreshButton = root.querySelector<HTMLButtonElement>('[data-static-settings-action="offline-refresh"]')
  const offlineCleanupButton = root.querySelector<HTMLButtonElement>('[data-static-settings-action="offline-cleanup"]')
  const copyFriendCodeButton = root.querySelector<HTMLButtonElement>('[data-static-settings-action="copy-friend-code"]')
  const rotateFriendCodeButton = root.querySelector<HTMLButtonElement>('[data-static-settings-action="rotate-friend-code"]')
  const friendCodeField = root.querySelector<HTMLTextAreaElement>('[data-static-settings-friend-code]')
  const textZoomInput = root.querySelector<HTMLInputElement>('[data-static-settings-text-zoom]')
  const nativeRuntime = isNativeShellRuntime()

  let logoutBusy = false
  let chatSettings: ChatSettings = user?.id ? loadChatSettings(user.id) : { ...defaultChatSettings }
  let swOptOut = false

  try {
    swOptOut = window.localStorage.getItem('fragment:sw-opt-out') === '1'
  } catch {
    swOptOut = false
  }

  updateToggleButton(readReceiptsButton, chatSettings.readReceipts)
  updateToggleButton(typingIndicatorsButton, chatSettings.typingIndicators)
  updateToggleButton(offlineCacheButton, !swOptOut)
  updateToggleButton(privacyAlwaysOnButton, getPrivacyScreenAlwaysOn())

  if (textZoomInput) {
    const zoom = getStoredTextZoom()
    textZoomInput.value = String(zoom)
    textZoomInput.setAttribute('aria-valuenow', String(zoom))
  }

  const friendUser = resolveFriendCodeUser(user)
  if (friendCodeField) {
    friendCodeField.value = friendUser ? ensureFriendCode(friendUser) : ''
  }

  const saveSettings = () => {
    saveChatSettings(user?.id, chatSettings)
  }

  const toggleReadReceipts = () => {
    chatSettings = { ...chatSettings, readReceipts: !chatSettings.readReceipts }
    updateToggleButton(readReceiptsButton, chatSettings.readReceipts)
    saveSettings()
  }

  const toggleTypingIndicators = () => {
    chatSettings = { ...chatSettings, typingIndicators: !chatSettings.typingIndicators }
    updateToggleButton(typingIndicatorsButton, chatSettings.typingIndicators)
    saveSettings()
  }

  const toggleOfflineCache = () => {
    if (nativeRuntime) return
    swOptOut = !swOptOut
    updateToggleButton(offlineCacheButton, !swOptOut)
    try {
      window.localStorage.setItem('fragment:sw-opt-out', swOptOut ? '1' : '0')
    } catch {
      setStatus(root, '[data-static-settings-sw-status]', 'error', 'Unable to store offline preference.')
      return
    }
    writeServiceWorkerOptOutCookie(swOptOut)
    window.dispatchEvent(new CustomEvent('prom:sw-toggle-cache', { detail: { optOut: swOptOut } }))
    setStatus(
      root,
      '[data-static-settings-sw-status]',
      'info',
      swOptOut ? 'Offline cache disabled.' : 'Offline cache enabled.'
    )
  }

  const handleOfflineRefresh = () => {
    if (nativeRuntime) return
    window.dispatchEvent(new CustomEvent('prom:sw-refresh-cache'))
    setStatus(root, '[data-static-settings-sw-status]', 'info', 'Refreshing offline cache...')
  }

  const handleOfflineCleanup = () => {
    if (nativeRuntime) return
    window.dispatchEvent(new CustomEvent('prom:sw-clear-cache'))
    setStatus(root, '[data-static-settings-sw-status]', 'info', 'Clearing offline cache...')
  }

  const handleCopyFriendCode = async () => {
    const value = friendCodeField?.value?.trim() ?? ''
    if (!value || !navigator.clipboard?.writeText) {
      setStatus(root, '[data-static-settings-friend-status]', 'error', 'Unable to copy friend code.')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setStatus(root, '[data-static-settings-friend-status]', 'success', 'Friend code copied.')
    } catch {
      setStatus(root, '[data-static-settings-friend-status]', 'error', 'Unable to copy friend code.')
    }
  }

  const handleRotateFriendCode = () => {
    const value = resolveFriendCodeUser(user)
    if (!value || !friendCodeField) {
      setStatus(root, '[data-static-settings-friend-status]', 'error', 'Invite code unavailable.')
      return
    }
    friendCodeField.value = rotateFriendCode(value)
    setStatus(root, '[data-static-settings-friend-status]', 'success', 'Friend code rotated.')
  }

  const handlePrivacyAlwaysOnClick = () => {
    void (async () => {
      const next = privacyAlwaysOnButton?.getAttribute('aria-checked') !== 'true'
      updateToggleButton(privacyAlwaysOnButton, next)
      await setPrivacyScreenAlwaysOn(next)
    })()
  }

  const handleTextZoomInput = () => {
    void (async () => {
      if (!textZoomInput) return
      const value = Number(textZoomInput.value)
      if (!Number.isFinite(value)) return
      textZoomInput.setAttribute('aria-valuenow', String(value))
      await applyTextZoom(value)
    })()
  }

  const handleLogout = () => {
    void (async () => {
      if (logoutBusy) return
      logoutBusy = true
      if (logoutButton) {
        logoutButton.disabled = true
      }
      setStatus(root, '[data-static-settings-logout-status]', 'error', null)
      try {
        const response = await fetch(buildPublicApiUrl('/auth/sign-out', window.location.origin), {
          method: 'POST',
          credentials: 'include'
        })
        if (!response.ok) {
          setStatus(root, '[data-static-settings-logout-status]', 'error', 'Unable to sign out.')
          return
        }
        clearBootstrapSession()
        await clearNativeAuthCredentials()
        window.location.assign(`/?lang=${encodeURIComponent(lang)}`)
      } catch (error) {
        setStatus(
          root,
          '[data-static-settings-logout-status]',
          'error',
          error instanceof Error ? error.message : 'Unable to sign out.'
        )
      } finally {
        logoutBusy = false
        if (logoutButton) {
          logoutButton.disabled = false
        }
      }
    })()
  }

  const handleCacheRefreshed = () => {
    setStatus(root, '[data-static-settings-sw-status]', 'success', 'Offline cache refreshed.')
  }

  const handleCacheCleared = () => {
    setStatus(root, '[data-static-settings-sw-status]', 'success', 'Offline cache cleared.')
  }

  const handleSyncRequested = () => {
    setStatus(root, '[data-static-settings-sw-status]', 'info', 'Offline sync queued.')
  }

  const handleCopyFriendCodeClick = () => {
    void handleCopyFriendCode()
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout)
    cleanupFns.push(() => logoutButton.removeEventListener('click', handleLogout))
  }
  if (readReceiptsButton) {
    readReceiptsButton.addEventListener('click', toggleReadReceipts)
    cleanupFns.push(() => readReceiptsButton.removeEventListener('click', toggleReadReceipts))
  }
  if (typingIndicatorsButton) {
    typingIndicatorsButton.addEventListener('click', toggleTypingIndicators)
    cleanupFns.push(() => typingIndicatorsButton.removeEventListener('click', toggleTypingIndicators))
  }
  if (offlineCacheButton) {
    offlineCacheButton.addEventListener('click', toggleOfflineCache)
    cleanupFns.push(() => offlineCacheButton.removeEventListener('click', toggleOfflineCache))
  }
  if (offlineRefreshButton) {
    offlineRefreshButton.addEventListener('click', handleOfflineRefresh)
    cleanupFns.push(() => offlineRefreshButton.removeEventListener('click', handleOfflineRefresh))
  }
  if (offlineCleanupButton) {
    offlineCleanupButton.addEventListener('click', handleOfflineCleanup)
    cleanupFns.push(() => offlineCleanupButton.removeEventListener('click', handleOfflineCleanup))
  }
  if (copyFriendCodeButton) {
    copyFriendCodeButton.addEventListener('click', handleCopyFriendCodeClick)
    cleanupFns.push(() => copyFriendCodeButton.removeEventListener('click', handleCopyFriendCodeClick))
  }
  if (rotateFriendCodeButton) {
    rotateFriendCodeButton.addEventListener('click', handleRotateFriendCode)
    cleanupFns.push(() => rotateFriendCodeButton.removeEventListener('click', handleRotateFriendCode))
  }
  if (privacyAlwaysOnButton) {
    privacyAlwaysOnButton.addEventListener('click', handlePrivacyAlwaysOnClick)
    cleanupFns.push(() => privacyAlwaysOnButton.removeEventListener('click', handlePrivacyAlwaysOnClick))
  }
  if (textZoomInput) {
    textZoomInput.addEventListener('input', handleTextZoomInput)
    cleanupFns.push(() => textZoomInput.removeEventListener('input', handleTextZoomInput))
  }

  window.addEventListener('prom:sw-cache-refreshed', handleCacheRefreshed)
  window.addEventListener('prom:sw-cache-cleared', handleCacheCleared)
  window.addEventListener('prom:sw-sync-requested', handleSyncRequested)
  cleanupFns.push(() => window.removeEventListener('prom:sw-cache-refreshed', handleCacheRefreshed))
  cleanupFns.push(() => window.removeEventListener('prom:sw-cache-cleared', handleCacheCleared))
  cleanupFns.push(() => window.removeEventListener('prom:sw-sync-requested', handleSyncRequested))

  return {
    cleanup() {
      cleanupFns.splice(0).forEach((cleanup) => cleanup())
    }
  }
}
