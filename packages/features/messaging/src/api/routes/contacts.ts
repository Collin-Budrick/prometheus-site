import { and, eq, ilike, inArray, or } from 'drizzle-orm'
import type { Elysia } from 'elysia'
import { t } from 'elysia'
import { inviteByEmailSchema, searchEmailSchema } from '../validators'
import { applyRateLimitHeaders, attachRateLimitHeaders } from '../utils'
import type {
  ContactInviteStatus,
  ContactInviteView,
  ContactSearchStatus,
  ContactInvitesTable,
  MessagingRouteOptions,
  SessionUser,
  UsersTable
} from '../types'

type ContactRoutesContext = {
  options: MessagingRouteOptions
  contactInvitesTable: ContactInvitesTable
  usersTable: UsersTable
  resolveSessionUser: (request: Request) => Promise<SessionUser | null>
  normalizeStatus: (value: unknown) => ContactInviteStatus
  publishContactsRefresh: (userIds: string[]) => Promise<void> | void
}

export const registerContactRoutes = <App extends Elysia>(app: App, ctx: ContactRoutesContext) => {
  const { options, contactInvitesTable, usersTable, resolveSessionUser, normalizeStatus, publishContactsRefresh } = ctx

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
      new Set(invites.map((invite) => (invite.inviterId === session.id ? invite.inviteeId : invite.inviterId)))
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
        const normalized: Array<{ id: string; name?: string | null; email: string }> = []
        for (const row of rows) {
          if (typeof row.id !== 'string' || typeof row.email !== 'string') continue
          if (row.id === session.id) continue
          normalized.push({
            id: row.id,
            name: typeof row.name === 'string' ? row.name : null,
            email: row.email
          })
        }
        matches = normalized
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

      const inviteByUser = new Map<
        string,
        { id: string; status: ContactInviteStatus; inviterId: string; inviteeId: string }
      >()
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
            .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
          const row = updated[0]
          if (row && typeof row.id === 'string') {
            void publishContactsRefresh([session.id, targetUser.id])
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
          .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
        const row = created[0]
        if (row && typeof row.id === 'string') {
          void publishContactsRefresh([session.id, targetUser.id])
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

      const inviterId = typeof invite.inviterId === 'string' ? invite.inviterId : ''
      const inviteeId = typeof invite.inviteeId === 'string' ? invite.inviteeId : ''

      try {
        const updated = await options.db
          .update(contactInvitesTable)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(eq(contactInvitesTable.id, invite.id))
          .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
        const row = updated[0]
        if (row && typeof row.id === 'string') {
          void publishContactsRefresh([inviterId, inviteeId])
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

      const inviterId = typeof invite.inviterId === 'string' ? invite.inviterId : ''
      const inviteeId = typeof invite.inviteeId === 'string' ? invite.inviteeId : ''

      try {
        const updated = await options.db
          .update(contactInvitesTable)
          .set({ status: 'declined', updatedAt: new Date() })
          .where(eq(contactInvitesTable.id, invite.id))
          .returning({ id: contactInvitesTable.id, status: contactInvitesTable.status })
        const row = updated[0]
        if (row && typeof row.id === 'string') {
          void publishContactsRefresh([inviterId, inviteeId])
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

      const inviterId = typeof invite.inviterId === 'string' ? invite.inviterId : ''
      const inviteeId = typeof invite.inviteeId === 'string' ? invite.inviteeId : ''

      try {
        await options.db.delete(contactInvitesTable).where(eq(contactInvitesTable.id, invite.id))
        void publishContactsRefresh([inviterId, inviteeId])
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

  return app
}
