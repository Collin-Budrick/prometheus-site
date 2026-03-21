export type ChatSettings = {
  readReceipts: boolean
  typingIndicators: boolean
}

export const defaultChatSettings: ChatSettings = {
  readReceipts: true,
  typingIndicators: true
}

const chatSettingsVersion = 1
const settingsStoragePrefix = 'chat:settings:'
const settingsCookieKey = 'prom-chat-settings'

type ChatSettingsEnvelope = {
  version: typeof chatSettingsVersion
  settings: ChatSettings
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const buildChatSettingsKey = (userId?: string) => `${settingsStoragePrefix}${userId ?? 'default'}`

const normalizeChatSettings = (settings: ChatSettings): ChatSettings => ({
  readReceipts: Boolean(settings.readReceipts),
  typingIndicators: Boolean(settings.typingIndicators)
})

const resolveChatSettingsPayload = (value: unknown) => {
  if (isRecord(value) && value.version === chatSettingsVersion && isRecord(value.settings)) {
    return value.settings
  }
  return value
}

const serializeChatSettings = (settings: ChatSettings) =>
  JSON.stringify({ version: chatSettingsVersion, settings: normalizeChatSettings(settings) } satisfies ChatSettingsEnvelope)

export const parseChatSettings = (raw: string | null): ChatSettings | null => {
  if (!raw) return null
  try {
    const parsed = resolveChatSettingsPayload(JSON.parse(raw))
    if (!isRecord(parsed)) return null
    const readReceipts =
      typeof parsed.readReceipts === 'boolean' ? parsed.readReceipts : defaultChatSettings.readReceipts
    const typingIndicators =
      typeof parsed.typingIndicators === 'boolean'
        ? parsed.typingIndicators
        : defaultChatSettings.typingIndicators
    return { readReceipts, typingIndicators }
  } catch {
    return null
  }
}

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

export const readChatSettingsFromCookie = (cookieHeader: string | null): ChatSettings | null =>
  parseChatSettings(readCookieValue(cookieHeader, settingsCookieKey))

export const writeChatSettingsToCookie = (settings: ChatSettings) => {
  if (typeof document === 'undefined') return
  try {
    const serialized = encodeURIComponent(serializeChatSettings(settings))
    document.cookie = `${settingsCookieKey}=${serialized}; path=/; max-age=2592000; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

export const loadChatSettings = (userId?: string): ChatSettings => {
  if (typeof window === 'undefined') return { ...defaultChatSettings }
  const raw = window.localStorage.getItem(buildChatSettingsKey(userId))
  const parsed = parseChatSettings(raw)
  if (parsed) return { ...defaultChatSettings, ...parsed }
  const cookieParsed = readChatSettingsFromCookie(typeof document === 'undefined' ? null : document.cookie)
  return cookieParsed ? { ...defaultChatSettings, ...cookieParsed } : { ...defaultChatSettings }
}

export const saveChatSettings = (userId: string | undefined, settings: ChatSettings) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(buildChatSettingsKey(userId), serializeChatSettings(settings))
  } catch {
    // ignore storage failures
  }
  writeChatSettingsToCookie(settings)
}
