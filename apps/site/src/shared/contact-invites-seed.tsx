import { createContextId, useContext } from '@builder.io/qwik'
import type { ContactInviteGroups } from '../components/contact-invites/data'

export type ContactInvitesSeed = {
  invites: ContactInviteGroups
}

export const ContactInvitesSeedContext = createContextId<ContactInvitesSeed | null>('contact-invites-seed')

export const useContactInvitesSeed = () => useContext(ContactInvitesSeedContext) ?? null
