import type { ValkeyClientType } from '@valkey/client'

const chatHistoryCacheKey = 'chat:history:latest'

const safeJsonParse = (raw: string | null): unknown => {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const readChatHistoryCache = async (
  client: ValkeyClientType,
  isReady: () => boolean
): Promise<unknown[] | null> => {
  if (!isReady()) return null
  try {
    const cached = await client.get(chatHistoryCacheKey)
    const parsed = safeJsonParse(cached)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const writeChatHistoryCache = async (
  client: ValkeyClientType,
  payload: unknown,
  ttlSeconds: number
) => {
  try {
    await client.set(chatHistoryCacheKey, JSON.stringify(payload), { EX: ttlSeconds })
  } catch (error) {
    console.warn('Failed to write chat history cache', { error })
  }
}

export const invalidateChatHistoryCache = async (client: ValkeyClientType, isReady: () => boolean) => {
  if (!isReady()) return
  try {
    await client.del(chatHistoryCacheKey)
  } catch (error) {
    console.warn('Failed to invalidate chat history cache', error)
  }
}
