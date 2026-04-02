import type { Lang } from '../../../lang'
import { getUiCopy } from '../../../lang/client'
import { runAfterClientIntentIdle } from '../../../shared/client-boot'

type SettingsUser = {
  id?: string
  name?: string
  email?: string
}

type MountStaticSettingsControllerOptions = {
  lang: Lang
  user?: SettingsUser
}

type ChatSettings = {
  readReceipts: boolean
  typingIndicators: boolean
}

type FriendCodeUser = {
  id: string
  email?: string | null
  name?: string
}

const SETTINGS_CONTROLLER_BOUND_ATTR = 'data-static-settings-controller-bound'
const defaultChatSettings: ChatSettings = {
  readReceipts: true,
  typingIndicators: true
}

const loadFriendCodeRuntime = () => import('../../../components/contact-invites/friend-code')
const loadServiceWorkerSeedRuntime = () => import('../../../shared/service-worker-seed')
const loadChatSettingsRuntime = () => import('../../../features/messaging/chat-settings')
const loadPrivacyScreenRuntime = () => import('../../../native/privacy-screen-policy')
const loadTextZoomRuntime = () => import('../../../native/text-zoom')
const loadNativeAuthRuntime = () => import('../../../native/native-auth')
const loadNativeRuntime = () => import('../../../native/runtime')
const loadSpacetimeAuthRuntime = () => import('../../../features/auth/spacetime-auth')

const readBootstrapUser = () => {
  try {
    const raw = window.localStorage.getItem('auth:bootstrap:user')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: string; email?: string; name?: string | null } | null
    if (!parsed?.id) return null
    return {
      id: parsed.id,
      email: parsed.email?.trim() ? parsed.email : parsed.id,
      name: parsed.name?.trim() ? parsed.name : undefined
    }
  } catch {
    return null
  }
}

const resolveFriendCodeUser = (user?: SettingsUser): FriendCodeUser | null => {
  const fallback =
    user?.id
      ? {
          id: user.id,
          email: user.email?.trim() ? user.email : user.id,
          name: user.name?.trim() ? user.name : undefined
        }
      : null
  const bootstrapUser = readBootstrapUser()
  if (!fallback) {
    return bootstrapUser
  }
  if (!bootstrapUser || bootstrapUser.id !== fallback.id) return fallback
  return {
    id: bootstrapUser.id,
    email: bootstrapUser.email?.trim() ? bootstrapUser.email : fallback.email,
    name: bootstrapUser.name?.trim() ? bootstrapUser.name : fallback.name
  }
}

const ensureStatusElement = (root: HTMLElement, selector: string) => {
  const existing = root.querySelector<HTMLElement>(selector)
  if (existing) return existing
  const next = document.createElement('div')
  next.className = 'settings-status'
  next.setAttribute('role', 'status')
  next.setAttribute('aria-live', 'polite')
  if (selector === '[data-static-settings-sw-status]') {
    next.dataset.staticSettingsSwStatus = ''
  } else if (selector === '[data-static-settings-friend-status]') {
    next.dataset.staticSettingsFriendStatus = ''
  } else if (selector === '[data-static-settings-passkey-status]') {
    next.dataset.staticSettingsPasskeyStatus = ''
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

const readToggleButtonState = (
  button: HTMLButtonElement | null,
  fallback: boolean
) => {
  const value = button?.getAttribute('aria-checked')
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export const mountStaticSettingsController = ({ lang, user }: MountStaticSettingsControllerOptions) => {
  const root = document.querySelector<HTMLElement>('[data-static-settings-root]')
  if (!root) {
    return { cleanup() {} }
  }
  if (root.getAttribute(SETTINGS_CONTROLLER_BOUND_ATTR) === 'true') {
    return { cleanup() {} }
  }
  root.setAttribute(SETTINGS_CONTROLLER_BOUND_ATTR, 'true')

  const copy = getUiCopy(lang)
  const cleanupFns: Array<() => void> = []
  const logoutButton =
    root.querySelector<HTMLButtonElement>('[data-static-settings-action="logout"]') ??
    document.querySelector<HTMLButtonElement>('[data-static-route-action]')
  const passkeyRow = root.querySelector<HTMLElement>('[data-static-settings-passkey-row]')
  const passkeyButton = root.querySelector<HTMLButtonElement>('[data-static-settings-action="add-passkey"]')
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

  let logoutBusy = false
  let passkeyBusy = false
  let chatSettings: ChatSettings = {
    readReceipts: readToggleButtonState(readReceiptsButton, defaultChatSettings.readReceipts),
    typingIndicators: readToggleButtonState(typingIndicatorsButton, defaultChatSettings.typingIndicators)
  }
  let swOptOut = !readToggleButtonState(offlineCacheButton, true)
  let nativeRuntimePromise: Promise<boolean> | null = null
  let passkeySupportPromise: Promise<boolean> | null = null

  const resolveNativeRuntime = () => {
    if (!nativeRuntimePromise) {
      nativeRuntimePromise = loadNativeRuntime()
        .then(({ isNativeShellRuntime }) => isNativeShellRuntime())
        .catch(() => false)
    }
    return nativeRuntimePromise
  }

  const resolvePasskeySupported = () => {
    if (!passkeySupportPromise) {
      passkeySupportPromise = loadSpacetimeAuthRuntime()
        .then(
          ({ getSpacetimeAuthMode, isHostedPasskeySupported }) =>
            getSpacetimeAuthMode() === 'hosted' && isHostedPasskeySupported()
        )
        .catch(() => false)
    }
    return passkeySupportPromise
  }

  updateToggleButton(readReceiptsButton, chatSettings.readReceipts)
  updateToggleButton(typingIndicatorsButton, chatSettings.typingIndicators)
  updateToggleButton(offlineCacheButton, !swOptOut)
  if (passkeyRow) {
    passkeyRow.hidden = true
  }
  if (passkeyButton) {
    passkeyButton.disabled = true
  }

  const saveSettings = () => {
    void loadChatSettingsRuntime()
      .then(({ saveChatSettings }) => {
        saveChatSettings(user?.id, chatSettings)
      })
      .catch(() => undefined)
  }

  const ensureFriendCodeValue = async () => {
    if (!friendCodeField) return ''
    const currentValue = friendCodeField.value.trim()
    if (currentValue) return currentValue
    const friendUser = resolveFriendCodeUser(user)
    if (!friendUser) return ''
    const { ensureFriendCode } = await loadFriendCodeRuntime()
    const nextValue = ensureFriendCode(friendUser)
    friendCodeField.value = nextValue
    return nextValue
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

  const toggleOfflineCache = async () => {
    if (await resolveNativeRuntime()) return
    swOptOut = !swOptOut
    updateToggleButton(offlineCacheButton, !swOptOut)
    try {
      window.localStorage.setItem('fragment:sw-opt-out', swOptOut ? '1' : '0')
    } catch {
      setStatus(root, '[data-static-settings-sw-status]', 'error', copy.settingsOfflineStorageError)
      return
    }
    const { writeServiceWorkerOptOutCookie } = await loadServiceWorkerSeedRuntime()
    writeServiceWorkerOptOutCookie(swOptOut)
    window.dispatchEvent(new CustomEvent('prom:sw-toggle-cache', { detail: { optOut: swOptOut } }))
    setStatus(
      root,
      '[data-static-settings-sw-status]',
      'info',
      swOptOut ? copy.settingsOfflineDisabled : copy.settingsOfflineEnabled
    )
  }

  const handleOfflineRefresh = async () => {
    if (await resolveNativeRuntime()) return
    window.dispatchEvent(new CustomEvent('prom:sw-refresh-cache'))
    setStatus(root, '[data-static-settings-sw-status]', 'info', copy.settingsOfflineRefreshPending)
  }

  const handleOfflineCleanup = async () => {
    if (await resolveNativeRuntime()) return
    window.dispatchEvent(new CustomEvent('prom:sw-clear-cache'))
    setStatus(root, '[data-static-settings-sw-status]', 'info', copy.settingsOfflineCleanupPending)
  }

  const handleCopyFriendCode = async () => {
    const value = await ensureFriendCodeValue()
    if (!value || !navigator.clipboard?.writeText) {
      setStatus(root, '[data-static-settings-friend-status]', 'error', copy.settingsInviteUnavailable)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setStatus(root, '[data-static-settings-friend-status]', 'success', copy.settingsInviteCopied)
    } catch {
      setStatus(root, '[data-static-settings-friend-status]', 'error', copy.settingsInviteUnavailable)
    }
  }

  const handleRotateFriendCode = async () => {
    const value = resolveFriendCodeUser(user)
    if (!value || !friendCodeField) {
      setStatus(root, '[data-static-settings-friend-status]', 'error', copy.settingsInviteUnavailable)
      return
    }
    const { rotateFriendCode } = await loadFriendCodeRuntime()
    friendCodeField.value = rotateFriendCode(value)
    setStatus(root, '[data-static-settings-friend-status]', 'success', copy.settingsInviteRotated)
  }

  const handlePrivacyAlwaysOnClick = () => {
    void (async () => {
      const next = privacyAlwaysOnButton?.getAttribute('aria-checked') !== 'true'
      updateToggleButton(privacyAlwaysOnButton, next)
      const { setPrivacyScreenAlwaysOn } = await loadPrivacyScreenRuntime()
      await setPrivacyScreenAlwaysOn(next)
    })()
  }

  const handleTextZoomInput = () => {
    void (async () => {
      if (!textZoomInput) return
      const value = Number(textZoomInput.value)
      if (!Number.isFinite(value)) return
      textZoomInput.setAttribute('aria-valuenow', String(value))
      const { applyTextZoom } = await loadTextZoomRuntime()
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
        const [{ signOutSpacetimeAuth }, { clearNativeAuthCredentials }] = await Promise.all([
          loadSpacetimeAuthRuntime(),
          loadNativeAuthRuntime()
        ])
        const logoutUrl = await signOutSpacetimeAuth()
        await clearNativeAuthCredentials()
        window.location.assign(logoutUrl)
      } catch (error) {
        setStatus(
          root,
          '[data-static-settings-logout-status]',
          'error',
          error instanceof Error ? error.message : copy.settingsLogoutFailed
        )
      } finally {
        logoutBusy = false
        if (logoutButton) {
          logoutButton.disabled = false
        }
      }
    })()
  }

  const handleAddPasskey = () => {
    void (async () => {
      if (passkeyBusy) return
      const passkeySupported = await resolvePasskeySupported()
      if (!passkeySupported) {
        if (passkeyRow) {
          passkeyRow.hidden = true
        }
        setStatus(root, '[data-static-settings-passkey-status]', 'error', copy.settingsPasskeyUnavailable)
        return
      }
      passkeyBusy = true
      if (passkeyButton) {
        passkeyButton.disabled = true
      }
      setStatus(root, '[data-static-settings-passkey-status]', 'error', null)
      try {
        const { registerHostedPasskey } = await loadSpacetimeAuthRuntime()
        await registerHostedPasskey({
          name: user?.name || user?.email || 'Prometheus'
        })
        setStatus(root, '[data-static-settings-passkey-status]', 'success', copy.settingsPasskeySuccess)
      } catch (error) {
        setStatus(
          root,
          '[data-static-settings-passkey-status]',
          'error',
          error instanceof Error ? error.message : copy.settingsPasskeyFailed
        )
      } finally {
        passkeyBusy = false
        if (passkeyButton) {
          passkeyButton.disabled = !passkeySupported
        }
      }
    })()
  }

  const handleCacheRefreshed = () => {
    setStatus(root, '[data-static-settings-sw-status]', 'success', copy.settingsOfflineRefreshSuccess)
  }

  const handleCacheCleared = () => {
    setStatus(root, '[data-static-settings-sw-status]', 'success', copy.settingsOfflineCleanupSuccess)
  }

  const handleSyncRequested = () => {
    setStatus(root, '[data-static-settings-sw-status]', 'info', copy.settingsOfflineSyncQueued)
  }

  const handleCopyFriendCodeClick = () => {
    void handleCopyFriendCode()
  }

  const handleRotateFriendCodeClick = () => {
    void handleRotateFriendCode()
  }

  const handleOfflineCacheToggle = () => {
    void toggleOfflineCache()
  }

  const handleOfflineRefreshClick = () => {
    void handleOfflineRefresh()
  }

  const handleOfflineCleanupClick = () => {
    void handleOfflineCleanup()
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout)
    cleanupFns.push(() => logoutButton.removeEventListener('click', handleLogout))
  }
  if (passkeyButton) {
    passkeyButton.addEventListener('click', handleAddPasskey)
    cleanupFns.push(() => passkeyButton.removeEventListener('click', handleAddPasskey))
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
    offlineCacheButton.addEventListener('click', handleOfflineCacheToggle)
    cleanupFns.push(() => offlineCacheButton.removeEventListener('click', handleOfflineCacheToggle))
  }
  if (offlineRefreshButton) {
    offlineRefreshButton.addEventListener('click', handleOfflineRefreshClick)
    cleanupFns.push(() => offlineRefreshButton.removeEventListener('click', handleOfflineRefreshClick))
  }
  if (offlineCleanupButton) {
    offlineCleanupButton.addEventListener('click', handleOfflineCleanupClick)
    cleanupFns.push(() => offlineCleanupButton.removeEventListener('click', handleOfflineCleanupClick))
  }
  if (copyFriendCodeButton) {
    copyFriendCodeButton.addEventListener('click', handleCopyFriendCodeClick)
    cleanupFns.push(() => copyFriendCodeButton.removeEventListener('click', handleCopyFriendCodeClick))
  }
  if (rotateFriendCodeButton) {
    rotateFriendCodeButton.addEventListener('click', handleRotateFriendCodeClick)
    cleanupFns.push(() => rotateFriendCodeButton.removeEventListener('click', handleRotateFriendCodeClick))
  }
  if (privacyAlwaysOnButton) {
    privacyAlwaysOnButton.addEventListener('click', handlePrivacyAlwaysOnClick)
    cleanupFns.push(() => privacyAlwaysOnButton.removeEventListener('click', handlePrivacyAlwaysOnClick))
  }
  if (textZoomInput) {
    textZoomInput.addEventListener('input', handleTextZoomInput)
    cleanupFns.push(() => textZoomInput.removeEventListener('input', handleTextZoomInput))
  }

  let deferredEnhancementActive = true
  let removeServiceWorkerListeners = () => {}
  const cancelDeferredEnhancement = runAfterClientIntentIdle(() => {
    void (async () => {
      if (!deferredEnhancementActive || !document.body.contains(root)) {
        return
      }

      const supported = await resolvePasskeySupported()
      if (!deferredEnhancementActive || !document.body.contains(root)) {
        return
      }
      if (passkeyRow) {
        passkeyRow.hidden = !supported
      }
      if (passkeyButton) {
        passkeyButton.disabled = !supported
      }

      const [{ getPrivacyScreenAlwaysOn }, { getStoredTextZoom }] = await Promise.all([
        loadPrivacyScreenRuntime(),
        loadTextZoomRuntime()
      ])
      if (!deferredEnhancementActive || !document.body.contains(root)) {
        return
      }
      updateToggleButton(privacyAlwaysOnButton, getPrivacyScreenAlwaysOn())
      if (textZoomInput) {
        const zoom = getStoredTextZoom()
        textZoomInput.value = String(zoom)
        textZoomInput.setAttribute('aria-valuenow', String(zoom))
      }

      if (friendCodeField) {
        await ensureFriendCodeValue()
      }

      if (await resolveNativeRuntime()) {
        return
      }

      window.addEventListener('prom:sw-cache-refreshed', handleCacheRefreshed)
      window.addEventListener('prom:sw-cache-cleared', handleCacheCleared)
      window.addEventListener('prom:sw-sync-requested', handleSyncRequested)
      removeServiceWorkerListeners = () => {
        window.removeEventListener('prom:sw-cache-refreshed', handleCacheRefreshed)
        window.removeEventListener('prom:sw-cache-cleared', handleCacheCleared)
        window.removeEventListener('prom:sw-sync-requested', handleSyncRequested)
      }
    })().catch(() => undefined)
  })
  cleanupFns.push(() => {
    deferredEnhancementActive = false
    cancelDeferredEnhancement()
    removeServiceWorkerListeners()
  })

  return {
    cleanup() {
      cleanupFns.splice(0).forEach((cleanup) => cleanup())
      root.removeAttribute(SETTINGS_CONTROLLER_BOUND_ATTR)
    }
  }
}
