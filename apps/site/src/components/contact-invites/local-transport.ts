import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { appConfig } from '../../app-config'
import type { ContactDevice, ContactInvitesPayload, DmMessage } from './types'
import { loadContactsMaps, observeContacts, serializeContactsPayload } from './contacts-crdt'
import { loadContactMaps } from './crdt-store'
import { loadHistory, persistHistory } from './history'
import { fetchRelayDevices } from './relay-directory'

const noop = () => {}

const resolveRelayUrls = () =>
  [
    ...(appConfig.p2pRelayBases ?? []),
    ...(appConfig.p2pNostrRelays ?? []),
    ...(appConfig.p2pWakuRelays ?? [])
  ]
    .map((entry) => entry.trim())
    .filter(Boolean)

export type LocalChatTransport = {
  readContacts: (userId: string) => Promise<ContactInvitesPayload>
  subscribeContacts: (userId: string, onUpdate: (payload: ContactInvitesPayload) => void) => Promise<() => void>
  readMessages: (contactId: string, identity: DeviceIdentity) => Promise<DmMessage[]>
  subscribeMessages: (
    contactId: string,
    identity: DeviceIdentity,
    onUpdate: (messages: DmMessage[]) => void
  ) => Promise<() => void>
  persistMessages: (contactId: string, identity: DeviceIdentity, messages: DmMessage[]) => Promise<void>
  fetchDevices: (userId: string) => Promise<ContactDevice[]>
}

export const createLocalChatTransport = (): LocalChatTransport => ({
  readContacts: async (userId: string) => {
    if (!userId || typeof window === 'undefined') return { incoming: [], outgoing: [], contacts: [] }
    const maps = await loadContactsMaps(userId)
    if (!maps) return { incoming: [], outgoing: [], contacts: [] }
    return serializeContactsPayload(maps.contacts)
  },
  subscribeContacts: async (userId: string, onUpdate: (payload: ContactInvitesPayload) => void) => {
    if (!userId || typeof window === 'undefined') return noop
    const maps = await loadContactsMaps(userId)
    if (!maps) return noop
    const handle = () => {
      onUpdate(serializeContactsPayload(maps.contacts))
    }
    const stop = observeContacts(maps.contacts, handle)
    handle()
    return () => {
      stop()
    }
  },
  readMessages: async (contactId: string, identity: DeviceIdentity) => {
    if (!contactId || typeof window === 'undefined') return []
    return loadHistory(contactId, identity)
  },
  subscribeMessages: async (contactId: string, identity: DeviceIdentity, onUpdate: (messages: DmMessage[]) => void) => {
    if (!contactId || typeof window === 'undefined') return noop
    const maps = await loadContactMaps(contactId, identity)
    if (!maps) return noop
    const handler = () => {
      void (async () => {
        const messages = await loadHistory(contactId, identity)
        onUpdate(messages)
      })()
    }
    maps.messages.observe(handler)
    handler()
    return () => {
      maps.messages.unobserve(handler)
    }
  },
  persistMessages: async (contactId: string, identity: DeviceIdentity, messages: DmMessage[]) => {
    if (!contactId || typeof window === 'undefined') return
    await persistHistory(contactId, identity, messages)
  },
  fetchDevices: async (userId: string) => {
    if (!userId || typeof window === 'undefined') return []
    try {
      return await fetchRelayDevices({ userId, relayUrls: resolveRelayUrls() })
    } catch {
      return []
    }
  }
})
