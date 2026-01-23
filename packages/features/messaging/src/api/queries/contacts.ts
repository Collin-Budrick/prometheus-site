import { and, eq, or } from 'drizzle-orm'
import type { ValkeyClientType } from '@valkey/client'
import type { DatabaseClient } from '@platform/db'
import { contactsChannel } from '../constants'
import type { ContactInviteStatus, ContactInvitesTable } from '../types'

export const normalizeStatus = (value: unknown): ContactInviteStatus => {
  if (value === 'accepted' || value === 'declined' || value === 'revoked') return value
  return 'pending'
}

export const publishContactsRefresh = async (
  options: { valkey: ValkeyClientType; isValkeyReady: () => boolean },
  userIds: string[]
) => {
  if (!options.isValkeyReady()) return
  const unique = Array.from(new Set(userIds)).filter((id) => id.trim() !== '')
  if (!unique.length) return
  try {
    await options.valkey.publish(contactsChannel, JSON.stringify({ type: 'contacts:refresh', userIds: unique }))
  } catch (error) {
    console.error('Failed to publish contact updates', error)
  }
}

export const ensureContacts = async (
  db: DatabaseClient['db'],
  contactInvitesTable: ContactInvitesTable,
  userId: string,
  targetId: string
) => {
  if (!userId || !targetId || userId === targetId) return false
  try {
    const rows = await db
      .select({ id: contactInvitesTable.id })
      .from(contactInvitesTable)
      .where(
        and(
          eq(contactInvitesTable.status, 'accepted'),
          or(
            and(eq(contactInvitesTable.inviterId, userId), eq(contactInvitesTable.inviteeId, targetId)),
            and(eq(contactInvitesTable.inviterId, targetId), eq(contactInvitesTable.inviteeId, userId))
          )
        )
      )
      .limit(1)
    return rows.length > 0
  } catch (error) {
    console.error('Failed to verify contact relationship', error)
    return false
  }
}
