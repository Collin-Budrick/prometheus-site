import { desc } from 'drizzle-orm'
import type { Elysia } from 'elysia'
import { readChatHistoryCache, writeChatHistoryCache } from '../../cache'
import { PromptBodyError, readPromptBody } from '../prompt'
import type { MessagingRouteOptions } from '../types'
import { applyRateLimitHeaders, attachRateLimitHeaders } from '../utils'

export const registerCoreRoutes = <App extends Elysia>(app: App, options: MessagingRouteOptions) => {
  const historyLimit = options.maxChatHistory ?? 20

  app
    .get('/chat/history', async ({ request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/history', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      const cached = await readChatHistoryCache(options.valkey, options.isValkeyReady)
      if (cached !== null) return cached

      const start = performance.now()
      const rows = await options.db
        .select()
        .from(options.chatMessagesTable)
        .orderBy(desc(options.chatMessagesTable.createdAt))
        .limit(historyLimit)
      const result = rows.reverse()
      void writeChatHistoryCache(options.valkey, result, 15)
      void options.recordLatencySample('chat:history', performance.now() - start)
      return result
    })
    .post('/ai/echo', async ({ request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/ai/echo', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`, {
            retryAfter: rateLimit.retryAfter
          }),
          rateLimit.headers
        )
      }

      const earlyLimit = await options.checkEarlyLimit('/ai/echo', 5, 5000)
      if (!earlyLimit.allowed) {
        return attachRateLimitHeaders(options.jsonError(429, 'Slow down'), rateLimit.headers)
      }

      let prompt: string
      try {
        prompt = await readPromptBody(request)
      } catch (error) {
        if (error instanceof PromptBodyError) {
          return attachRateLimitHeaders(options.jsonError(error.status, error.message, error.meta), rateLimit.headers)
        }
        console.error('Unexpected prompt parse failure', error)
        return attachRateLimitHeaders(options.jsonError(400, 'Invalid request body'), rateLimit.headers)
      }

      const start = performance.now()
      const payload = { echo: `You said: ${prompt}` }
      void options.recordLatencySample('ai:echo', performance.now() - start)
      return payload
    })

  return app
}
