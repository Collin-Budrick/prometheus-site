import { useSignal, useVisibleTask$, type NoSerialize, type QRL, type Signal } from '@builder.io/qwik'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { loadLocalProfile, loadRemoteProfile, PROFILE_UPDATED_EVENT, type ProfilePayload } from '../../shared/profile-storage'
import type { ContactInviteView } from './types'

type ContactInvitesProfileSyncOptions = {
  contacts: Signal<ContactInviteView[]>
  onlineIds: Signal<string[]>
  contactProfiles: Signal<Record<string, ProfilePayload>>
  localProfile: Signal<ProfilePayload | null>
  identityRef: Signal<NoSerialize<DeviceIdentity> | undefined>
  registerIdentity: QRL<() => Promise<DeviceIdentity>>
}

export const useContactInvitesProfileSync = (options: ContactInvitesProfileSyncOptions) => {
  const syncReady = useSignal(false)

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    const profile = loadLocalProfile()
    if (profile) {
      options.localProfile.value = profile
    }
    const handleProfileUpdateEvent = () => {
      const profile = loadLocalProfile()
      if (profile) {
        options.localProfile.value = profile
      }
    }
    syncReady.value = true
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdateEvent)

    ctx.cleanup(() => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdateEvent)
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    ctx.track(() => syncReady.value)
    const contacts = ctx.track(() => options.contacts.value)
    if (!syncReady.value) return
    const nextProfiles = { ...options.contactProfiles.value }
    let changed = false
    contacts.forEach((contact) => {
      const userId = contact.user.id
      if (!userId) return
      if (!nextProfiles[userId]) {
        const cached = loadRemoteProfile(userId)
        if (cached) {
          nextProfiles[userId] = cached
          changed = true
        }
      }
    })
    if (changed) {
      options.contactProfiles.value = nextProfiles
    }
  })
}
