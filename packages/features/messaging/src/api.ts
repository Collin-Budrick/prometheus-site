import { desc } from 'drizzle-orm'
import { Elysia } from 'elysia'
import type { RedisClientType } from '@valkey/client'
import { chatMessages } from 'apps/api/src/db/schema'
import { readChatHistoryCache, writeChatHistoryCache } from './cache'

type DbClient = typeof import('apps/api/src/db/client').db

export const maxPromptLength = 2000
export const maxPromptPayloadBytes = 32 * 1024

export class PromptBodyError extends Error {
  status: number
  meta: Record<string, unknown>

  constructor(status: number, message: string, meta: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.meta = meta
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const concatUint8 = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export const readPromptBody = async (request: Request) => {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null && contentLengthHeader !== '') {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (Number.isFinite(contentLength) && contentLength > maxPromptPayloadBytes) {
      throw new PromptBodyError(413, 'Request body too large', {
        limitBytes: maxPromptPayloadBytes,
        retryAfter: 1
      })
    }
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new PromptBodyError(400, 'Missing request body')
  }

  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value !== undefined) {
      received += value.byteLength
      if (received > maxPromptPayloadBytes) {
        throw new PromptBodyError(413, 'Request body too large', {
          limitBytes: maxPromptPayloadBytes,
          retryAfter: 1
        })
      }
      chunks.push(value)
    }
  }

  const rawBody = decoder.decode(concatUint8(chunks))
  if (rawBody.trim() === '') {
    throw new PromptBodyError(400, 'Prompt cannot be empty')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new PromptBodyError(400, 'Invalid JSON payload')
  }

  const promptRaw = isRecord(payload) && typeof payload.prompt === 'string' ? payload.prompt : ''
  const prompt = promptRaw.trim()

  if (prompt === '') {
    throw new PromptBodyError(400, 'Prompt cannot be empty')
  }

  if (prompt.length > maxPromptLength) {
    throw new PromptBodyError(400, `Prompt too long (max ${maxPromptLength} characters)`, {
      limitBytes: maxPromptPayloadBytes,
      promptLimit: maxPromptLength
    })
  }

  return prompt
}

export type MessagingRouteOptions = {
  db: DbClient
  valkey: RedisClientType
  isValkeyReady: () => boolean
  getClientIp: (request: Request) => string
  checkRateLimit: (route: string, clientIp: string) => Promise<{ allowed: boolean; retryAfter: number }>
  checkEarlyLimit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; remaining: number }>
  recordLatencySample: (metric: string, durationMs: number) => void | Promise<void>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
  maxChatHistory?: number
}

export const createMessagingRoutes = (options: MessagingRouteOptions) => {
  const historyLimit = options.maxChatHistory ?? 20

  return new Elysia()
    .get('/chat/history', async ({ request }) => {
      const clientIp = options.getClientIp(request)
      const { allowed, retryAfter } = await options.checkRateLimit('/chat/history', clientIp)

      if (!allowed) {
        return options.jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`)
      }

      const cached = await readChatHistoryCache(options.valkey, options.isValkeyReady)
      if (cached !== null) return cached

      const start = performance.now()
      const rows = await options.db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(historyLimit)
      const result = rows.reverse()
      void writeChatHistoryCache(options.valkey, result, 15)
      void options.recordLatencySample('chat:history', performance.now() - start)
      return result
    })
    .post('/ai/echo', async ({ request }) => {
      const clientIp = options.getClientIp(request)
      const { allowed, retryAfter } = await options.checkRateLimit('/ai/echo', clientIp)

      if (!allowed) {
        return options.jsonError(429, `Rate limit exceeded. Try again in ${retryAfter}s`, { retryAfter })
      }

      const earlyLimit = await options.checkEarlyLimit('/ai/echo', 5, 5000)
      if (!earlyLimit.allowed) {
        return options.jsonError(429, 'Slow down')
      }

      let prompt: string
      try {
        prompt = await readPromptBody(request)
      } catch (error) {
        if (error instanceof PromptBodyError) {
          return options.jsonError(error.status, error.message, error.meta)
        }
        console.error('Unexpected prompt parse failure', error)
        return options.jsonError(400, 'Invalid request body')
      }

      const start = performance.now()
      const payload = { echo: `You said: ${prompt}` }
      void options.recordLatencySample('ai:echo', performance.now() - start)
      return payload
    })
}
