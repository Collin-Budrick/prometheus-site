/**
 * @deprecated Messaging HTTP routes are legacy-only in serverless mode.
 */
import { Elysia } from 'elysia'
import type { MessagingRouteOptions } from './api/types'
import { normalizeStatus, publishContactsRefresh as publishContactsRefreshEvent } from './api/queries/contacts'
import { createSessionResolver } from './api/queries/session'
import { registerContactRoutes } from './api/routes/contacts'
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
