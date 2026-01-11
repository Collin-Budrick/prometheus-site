export type ChatSettings = {
  readReceipts: boolean
  typingIndicators: boolean
}

export const defaultChatSettings: ChatSettings = {
  readReceipts: true,
  typingIndicators: true
}

const settingsStoragePrefix = 'chat:settings:'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const buildChatSettingsKey = (userId?: string) => `${settingsStoragePrefix}${userId ?? 'default'}`

export const parseChatSettings = (raw: string | null): ChatSettings | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
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

export const loadChatSettings = (userId?: string): ChatSettings => {
  if (typeof window === 'undefined') return { ...defaultChatSettings }
  const raw = window.localStorage.getItem(buildChatSettingsKey(userId))
  const parsed = parseChatSettings(raw)
  return parsed ? { ...defaultChatSettings, ...parsed } : { ...defaultChatSettings }
}

export const saveChatSettings = (userId: string | undefined, settings: ChatSettings) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(buildChatSettingsKey(userId), JSON.stringify(settings))
  } catch {
    // ignore storage failures
  }
}
