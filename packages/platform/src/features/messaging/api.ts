/**
 * @deprecated Messaging HTTP routes are legacy-only in serverless mode.
 */
import { Elysia } from 'elysia'
import type { ValidateSessionHandler } from '@platform/features/auth/server'
import type { MessagingRouteOptions, SessionUser } from './api/types'
import { isRecord } from './api/utils'
import { normalizeStatus, publishContactsRefresh as publishContactsRefreshEvent, registerContactRoutes } from './api/routes/contacts'
import { registerCoreRoutes } from './api/routes/core'
import { registerP2pRoutes } from './api/routes/p2p'
import { resolvePushEnabled } from './api/push'

export { maxPromptLength, maxPromptPayloadBytes, contactsChannel, p2pChannel } from './api/constants'
export { PromptBodyError, readPromptBody } from './api/prompt'
export type {
  ChatMessagesTable,
  ContactInvitesTable,
  MessagingRouteOptions,
  PushBroadcastOptions,
  UsersTable
} from './api/types'
export { sendServerOnlinePush } from './api/push'

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

const createSessionResolver = (validateSession: ValidateSessionHandler) => async (request: Request) => {
  try {
    const response = await validateSession({ request })
    if (!response.ok) return null
    return await parseSessionPayload(response)
  } catch (error) {
    console.error('Failed to validate contact invite session', error)
    return null
  }
}

export const createMessagingRoutes = (options: MessagingRouteOptions) => {
  const app = new Elysia()

  registerCoreRoutes(app, options)

  const contactInvitesTable = options.contactInvitesTable
  const usersTable = options.usersTable
  const validateSession = options.validateSession

  if (contactInvitesTable && usersTable && validateSession) {
    const resolveSessionUser = createSessionResolver(validateSession)
    const publishContactsRefresh = (userIds: string[]) =>
      publishContactsRefreshEvent({ valkey: options.valkey, isValkeyReady: options.isValkeyReady }, userIds)

    registerContactRoutes(app, {
      options,
      contactInvitesTable,
      usersTable,
      resolveSessionUser,
      normalizeStatus,
      publishContactsRefresh
    })

    const pushConfig = options.push
    const pushEnabled = resolvePushEnabled(pushConfig)

    registerP2pRoutes(app, {
      options,
      contactInvitesTable,
      resolveSessionUser,
      pushConfig,
      pushEnabled
    })
  }

  return app
}
