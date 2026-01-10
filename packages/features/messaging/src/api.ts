import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core'
import type { ValkeyClientType } from '@valkey/client'
import type { DatabaseClient } from '@platform/db'
import type { RateLimitResult } from '@platform/rate-limit'
import type { ValidateSessionHandler } from '@features/auth/server'
import { z } from 'zod'
import { readChatHistoryCache, writeChatHistoryCache } from './cache'

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
  db: DatabaseClient['db']
  chatMessagesTable: ChatMessagesTable
  valkey: ValkeyClientType
  isValkeyReady: () => boolean
  validateSession?: ValidateSessionHandler
  usersTable?: UsersTable
  contactInvitesTable?: ContactInvitesTable
  getClientIp: (request: Request) => string
  checkRateLimit: (route: string, clientIp: string) => Promise<RateLimitResult>
  checkEarlyLimit: (key: string, max: number, windowMs: number) => Promise<{ allowed: boolean; remaining: number }>
  recordLatencySample: (metric: string, durationMs: number) => void | Promise<void>
  jsonError: (status: number, error: string, meta?: Record<string, unknown>) => Response
  maxChatHistory?: number
}

export type ChatMessagesTable = AnyPgTable & {
  createdAt: AnyPgColumn
  author?: AnyPgColumn
  body?: AnyPgColumn
}

export type UsersTable = AnyPgTable & {
  id: AnyPgColumn
  name?: AnyPgColumn
  email: AnyPgColumn
}

export type ContactInvitesTable = AnyPgTable & {
  id: AnyPgColumn
  inviterId: AnyPgColumn
  inviteeId: AnyPgColumn
  status: AnyPgColumn
  createdAt?: AnyPgColumn
  updatedAt?: AnyPgColumn
}

const applyRateLimitHeaders = (set: { headers?: HeadersInit }, headers: Headers) => {
  const resolved = new Headers(set.headers ?? undefined)
  headers.forEach((value, key) => {
    resolved.set(key, value)
  })
  set.headers = resolved
}

const attachRateLimitHeaders = (response: Response, headers: Headers) => {
  headers.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}

type ContactInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
type ContactSearchStatus = 'none' | 'incoming' | 'outgoing' | 'accepted'

type SessionUser = {
  id: string
  name?: string
  email?: string
}

type ContactInviteView = {
  id: string
  status: ContactInviteStatus
  user: {
    id: string
    name?: string | null
    email: string
  }
}

const inviteByEmailSchema = z.object({
  email: z.string().email()
})

const searchEmailSchema = z.object({
  email: z.string().min(3)
})

const parseSessionPayload = async (response: Response): Promise<SessionUser | null> => {
  const payload: unknown = await response.json()
  if (!isRecord(payload)) return null
  const userValue = payload.user
  const sessionValue = payload.session
  const userRecord = isRecord(userValue) ? userValue : {}
  const sessionRecord = isRecord(sessionValue) ? sessionValue : {}

  const userId =
    typeof userRecord.id === 'string'
      ? userRecord.id
      : typeof sessionRecord.userId === 'string'
        ? sessionRecord.userId
        : null
  if (!userId) return null
  const name = typeof userRecord.name === 'string' ? userRecord.name : undefined
  const email = typeof userRecord.email === 'string' ? userRecord.email : undefined
  return { id: userId, name, email }
}

export const createMessagingRoutes = (options: MessagingRouteOptions) => {
  const historyLimit = options.maxChatHistory ?? 20
  const app = new Elysia()
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

  const contactInvitesTable = options.contactInvitesTable
  const usersTable = options.usersTable
  const validateSession = options.validateSession

  if (contactInvitesTable && usersTable && validateSession) {
    const resolveSessionUser = async (request: Request) => {
      try {
        const response = await validateSession({ request })
        if (!response.ok) return null
        return await parseSessionPayload(response)
      } catch (error) {
        console.error('Failed to validate contact invite session', error)
        return null
      }
    }

    const normalizeStatus = (value: unknown): ContactInviteStatus => {
      if (value === 'accepted' || value === 'declined' || value === 'revoked') return value
      return 'pending'
    }

    app.get('/chat/contacts/invites', async ({ request, set }) => {
      const clientIp = options.getClientIp(request)
      const rateLimit = await options.checkRateLimit('/chat/contacts/invites', clientIp)
      applyRateLimitHeaders(set, rateLimit.headers)

      if (!rateLimit.allowed) {
        return attachRateLimitHeaders(
          options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
          rateLimit.headers
        )
      }

      const session = await resolveSessionUser(request)
      if (!session) {
        return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
      }

      let invites
      try {
        invites = await options.db
          .select()
          .from(contactInvitesTable)
          .where(
            and(
              or(eq(contactInvitesTable.inviterId, session.id), eq(contactInvitesTable.inviteeId, session.id)),
              inArray(contactInvitesTable.status, ['pending', 'accepted'])
            )
          )
      } catch (error) {
        console.error('Failed to load contact invites', error)
        return attachRateLimitHeaders(options.jsonError(500, 'Unable to load invites'), rateLimit.headers)
      }

      const otherIds = Array.from(
        new Set(
          invites.map((invite) =>
            invite.inviterId === session.id ? invite.inviteeId : invite.inviterId
          )
        )
      ).filter((id): id is string => typeof id === 'string' && id !== '')

      if (!otherIds.length) {
        return { incoming: [], outgoing: [], contacts: [] }
      }

      let users = []
      try {
        users = await options.db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, otherIds))
      } catch (error) {
        console.error('Failed to load invite users', error)
        return attachRateLimitHeaders(options.jsonError(500, 'Unable to load invites'), rateLimit.headers)
      }

      const userById = new Map<string, { id: string; name?: string | null; email: string }>()
      users.forEach((user) => {
        if (typeof user.id === 'string' && typeof user.email === 'string') {
          userById.set(user.id, {
            id: user.id,
            name: typeof user.name === 'string' ? user.name : null,
            email: user.email
          })
        }
      })

      const buildView = (invite: Record<string, unknown>): ContactInviteView | null => {
        const inviteId = invite.id
        const inviterId = invite.inviterId
        const inviteeId = invite.inviteeId
        if (typeof inviteId !== 'string' || typeof inviterId !== 'string' || typeof inviteeId !== 'string') return null
        const otherId = inviterId === session.id ? inviteeId : inviterId
        const user = userById.get(otherId)
        if (!user) return null
        return {
          id: inviteId,
          status: normalizeStatus(invite.status),
          user
        }
      }

      const incoming: ContactInviteView[] = []
      const outgoing: ContactInviteView[] = []
      const contacts: ContactInviteView[] = []

      invites.forEach((invite) => {
        const view = buildView(invite)
        if (!view) return
        if (view.status === 'accepted') {
          contacts.push(view)
          return
        }
        if (invite.inviteeId === session.id) {
          incoming.push(view)
          return
        }
        if (invite.inviterId === session.id) {
          outgoing.push(view)
        }
      })

      return { incoming, outgoing, contacts }
    })

    app.get(
      '/chat/contacts/search',
      async ({ query, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/search', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/search:${clientIp}`, 8, 5000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        const parsed = searchEmailSchema.safeParse({ email: query.email })
        if (!parsed.success) {
          return attachRateLimitHeaders(
            options.jsonError(400, 'Search query must be at least 3 characters'),
            rateLimit.headers
          )
        }

        const term = parsed.data.email.trim().toLowerCase()
        if (term === '') {
          return { results: [] }
        }

        let matches: Array<{ id: string; name?: string | null; email: string }> = []
        try {
          const rows = await options.db
            .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
            .from(usersTable)
            .where(ilike(usersTable.email, `%${term}%`))
            .limit(8)
          matches = rows
            .filter((row) => typeof row.id === 'string' && typeof row.email === 'string')
            .map((row) => ({
              id: row.id,
              name: typeof row.name === 'string' ? row.name : null,
              email: row.email
            }))
            .filter((row) => row.id !== session.id)
        } catch (error) {
          console.error('Failed to search contacts', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Search unavailable'), rateLimit.headers)
        }

        if (!matches.length) {
          return { results: [] }
        }

        const candidateIds = matches.map((row) => row.id)
        let invites: Array<Record<string, unknown>> = []
        try {
          invites = await options.db
            .select()
            .from(contactInvitesTable)
            .where(
              or(
                and(
                  eq(contactInvitesTable.inviterId, session.id),
                  inArray(contactInvitesTable.inviteeId, candidateIds)
                ),
                and(
                  eq(contactInvitesTable.inviteeId, session.id),
                  inArray(contactInvitesTable.inviterId, candidateIds)
                )
              )
            )
        } catch (error) {
          console.error('Failed to load contact status', error)
        }

        const inviteByUser = new Map<string, { id: string; status: ContactInviteStatus; inviterId: string; inviteeId: string }>()
        invites.forEach((invite) => {
          const inviteId = invite.id
          const inviterId = invite.inviterId
          const inviteeId = invite.inviteeId
          if (typeof inviteId !== 'string' || typeof inviterId !== 'string' || typeof inviteeId !== 'string') return
          const otherId = inviterId === session.id ? inviteeId : inviterId
          inviteByUser.set(otherId, {
            id: inviteId,
            status: normalizeStatus(invite.status),
            inviterId,
            inviteeId
          })
        })

        const results = matches.map((row) => {
          const invite = inviteByUser.get(row.id)
          let status: ContactSearchStatus = 'none'
          let inviteId: string | undefined
          if (invite) {
            inviteId = invite.id
            if (invite.status === 'accepted') {
              status = 'accepted'
            } else if (invite.status === 'pending') {
              status = invite.inviterId === session.id ? 'outgoing' : 'incoming'
            } else {
              status = 'none'
            }
          }
          return {
            id: row.id,
            name: row.name ?? null,
            email: row.email,
            status,
            inviteId
          }
        })

        return { results }
      },
      {
        query: t.Object({
          email: t.String()
        })
      }
    )

    app.post(
      '/chat/contacts/invites',
      async ({ body, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:write', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:write:${clientIp}`, 5, 10000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        const parsed = inviteByEmailSchema.safeParse(body)
        if (!parsed.success) {
          return attachRateLimitHeaders(options.jsonError(400, 'Invalid email address'), rateLimit.headers)
        }

        const email = parsed.data.email.trim().toLowerCase()
        if (!email) {
          return attachRateLimitHeaders(options.jsonError(400, 'Invalid email address'), rateLimit.headers)
        }

        let targetUser: { id: string; email: string; name?: string | null } | null = null
        try {
          const rows = await options.db
            .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
            .from(usersTable)
            .where(ilike(usersTable.email, email))
            .limit(1)
          const row = rows[0]
          if (row && typeof row.id === 'string' && typeof row.email === 'string') {
            targetUser = {
              id: row.id,
              name: typeof row.name === 'string' ? row.name : null,
              email: row.email
            }
          }
        } catch (error) {
          console.error('Failed to lookup contact invite target', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!targetUser) {
          return attachRateLimitHeaders(options.jsonError(404, 'No user found for that email'), rateLimit.headers)
        }

        if (targetUser.id === session.id) {
          return attachRateLimitHeaders(options.jsonError(400, 'You cannot invite yourself'), rateLimit.headers)
        }

        let existing: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(
              or(
                and(
                  eq(contactInvitesTable.inviterId, session.id),
                  eq(contactInvitesTable.inviteeId, targetUser.id)
                ),
                and(
                  eq(contactInvitesTable.inviterId, targetUser.id),
                  eq(contactInvitesTable.inviteeId, session.id)
                )
              )
            )
            .limit(1)
          existing = rows[0] ?? null
        } catch (error) {
          console.error('Failed to check existing invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (existing) {
          const existingStatus = normalizeStatus(existing.status)
          const existingId = typeof existing.id === 'string' ? existing.id : undefined
          const existingInviter = existing.inviterId
          if (existingStatus === 'accepted') {
            return attachRateLimitHeaders(options.jsonError(409, 'Contact already accepted'), rateLimit.headers)
          }
          if (existingStatus === 'pending') {
            if (existingInviter === session.id) {
              return attachRateLimitHeaders(options.jsonError(409, 'Invite already sent'), rateLimit.headers)
            }
            return attachRateLimitHeaders(
              options.jsonError(409, 'Invite waiting for your response', { inviteId: existingId }),
              rateLimit.headers
            )
          }
          try {
            const updated = await options.db
              .update(contactInvitesTable)
              .set({
                inviterId: session.id,
                inviteeId: targetUser.id,
                status: 'pending',
                updatedAt: new Date()
              })
              .where(eq(contactInvitesTable.id, existingId ?? ''))
              .returning()
            const row = updated[0]
            if (row && typeof row.id === 'string') {
              return { id: row.id, status: normalizeStatus(row.status) }
            }
          } catch (error) {
            console.error('Failed to reset invite', error)
            return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
          }
        }

        try {
          const created = await options.db
            .insert(contactInvitesTable)
            .values({
              inviterId: session.id,
              inviteeId: targetUser.id,
              status: 'pending',
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning()
          const row = created[0]
          if (row && typeof row.id === 'string') {
            return { id: row.id, status: normalizeStatus(row.status) }
          }
        } catch (error) {
          console.error('Failed to create invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' })
        })
      }
    )

    app.post(
      '/chat/contacts/invites/:id/accept',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:action', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:action:${clientIp}`, 8, 8000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        let invite: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(eq(contactInvitesTable.id, params.id))
            .limit(1)
          invite = rows[0] ?? null
        } catch (error) {
          console.error('Failed to load invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!invite || typeof invite.id !== 'string') {
          return attachRateLimitHeaders(options.jsonError(404, 'Invite not found'), rateLimit.headers)
        }

        if (invite.inviteeId !== session.id) {
          return attachRateLimitHeaders(options.jsonError(403, 'Invite can only be accepted by the recipient'), rateLimit.headers)
        }

        if (normalizeStatus(invite.status) !== 'pending') {
          return attachRateLimitHeaders(options.jsonError(409, 'Invite is no longer pending'), rateLimit.headers)
        }

        try {
          const updated = await options.db
            .update(contactInvitesTable)
            .set({ status: 'accepted', updatedAt: new Date() })
            .where(eq(contactInvitesTable.id, invite.id))
            .returning()
          const row = updated[0]
          if (row && typeof row.id === 'string') {
            return { id: row.id, status: normalizeStatus(row.status) }
          }
        } catch (error) {
          console.error('Failed to accept invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )

    app.post(
      '/chat/contacts/invites/:id/decline',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:action', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:action:${clientIp}`, 8, 8000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        let invite: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(eq(contactInvitesTable.id, params.id))
            .limit(1)
          invite = rows[0] ?? null
        } catch (error) {
          console.error('Failed to load invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!invite || typeof invite.id !== 'string') {
          return attachRateLimitHeaders(options.jsonError(404, 'Invite not found'), rateLimit.headers)
        }

        if (invite.inviteeId !== session.id) {
          return attachRateLimitHeaders(options.jsonError(403, 'Invite can only be declined by the recipient'), rateLimit.headers)
        }

        if (normalizeStatus(invite.status) !== 'pending') {
          return attachRateLimitHeaders(options.jsonError(409, 'Invite is no longer pending'), rateLimit.headers)
        }

        try {
          const updated = await options.db
            .update(contactInvitesTable)
            .set({ status: 'declined', updatedAt: new Date() })
            .where(eq(contactInvitesTable.id, invite.id))
            .returning()
          const row = updated[0]
          if (row && typeof row.id === 'string') {
            return { id: row.id, status: normalizeStatus(row.status) }
          }
        } catch (error) {
          console.error('Failed to decline invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )

    app.delete(
      '/chat/contacts/invites/:id',
      async ({ params, request, set }) => {
        const clientIp = options.getClientIp(request)
        const rateLimit = await options.checkRateLimit('/chat/contacts/invites:action', clientIp)
        applyRateLimitHeaders(set, rateLimit.headers)

        if (!rateLimit.allowed) {
          return attachRateLimitHeaders(
            options.jsonError(429, `Rate limit exceeded. Try again in ${rateLimit.retryAfter}s`),
            rateLimit.headers
          )
        }

        const earlyLimit = await options.checkEarlyLimit(`/chat/contacts/invites:action:${clientIp}`, 8, 8000)
        if (!earlyLimit.allowed) {
          return attachRateLimitHeaders(options.jsonError(429, 'Try again soon'), rateLimit.headers)
        }

        const session = await resolveSessionUser(request)
        if (!session) {
          return attachRateLimitHeaders(options.jsonError(401, 'Authentication required'), rateLimit.headers)
        }

        let invite: Record<string, unknown> | null = null
        try {
          const rows = await options.db
            .select()
            .from(contactInvitesTable)
            .where(eq(contactInvitesTable.id, params.id))
            .limit(1)
          invite = rows[0] ?? null
        } catch (error) {
          console.error('Failed to load invite', error)
          return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
        }

        if (!invite || typeof invite.id !== 'string') {
          return attachRateLimitHeaders(options.jsonError(404, 'Invite not found'), rateLimit.headers)
        }

        if (invite.inviterId !== session.id && invite.inviteeId !== session.id) {
          return attachRateLimitHeaders(options.jsonError(403, 'Invite not found'), rateLimit.headers)
        }

        try {
          await options.db.delete(contactInvitesTable).where(eq(contactInvitesTable.id, invite.id))
          return { id: invite.id, status: 'removed' }
        } catch (error) {
          console.error('Failed to remove invite', error)
        }

        return attachRateLimitHeaders(options.jsonError(500, 'Invite unavailable'), rateLimit.headers)
      },
      {
        params: t.Object({
          id: t.String()
        })
      }
    )
  }

  return app
}
