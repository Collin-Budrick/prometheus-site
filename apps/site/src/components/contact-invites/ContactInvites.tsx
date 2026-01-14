import { $, component$, useComputed$, useSignal, useVisibleTask$, type QRL } from '@builder.io/qwik'
import type { NoSerialize } from '@builder.io/qwik'
import { getLanguagePack } from '../../lang'
import { useSharedLangSignal } from '../../shared/lang-bridge'
import { buildChatSettingsKey, defaultChatSettings, type ChatSettings } from '../../shared/chat-settings'
import { getServerBackoffMs } from '../../shared/server-backoff'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import type { ProfilePayload } from '../../shared/profile-storage'
import {
  loadLocalProfile,
  loadRemoteProfiles,
  PROFILE_UPDATED_EVENT
} from '../../shared/profile-storage'
import { ContactProfileCard } from './ContactProfileCard'
import { ContactInvitesDm } from './ContactInvitesDm'
import { ContactInvitesHeader } from './ContactInvitesHeader'
import { ContactInvitesSearch } from './ContactInvitesSearch'
import { matchesQuery, normalizeLabel, normalizeQuery } from './utils'
import { useContactInvitesActions } from './use-contact-invites-actions'
import { useContactInvitesShell } from './use-contact-invites-shell'
import { useContactInvitesProfileSync } from './use-contact-invites-profile-sync'
import { useDmComposer } from './use-dm-composer'
import { useDmConnection } from './use-dm-connection'
import type {
  ActiveContact,
  BaselineInviteCounts,
  ContactDevice,
  ContactInviteView,
  ContactInvitesProps,
  ContactSearchItem,
  ContactSearchResult,
  DmConnectionState,
  DmDataChannel,
  DmMessage,
  DmOrigin,
  P2pSession,
  RealtimeState
} from './types'

export const ContactInvites = component$<ContactInvitesProps>(
  ({
    class: className,
    title,
    helper,
    searchLabel,
    searchPlaceholder,
    searchActionLabel,
    inviteActionLabel,
    acceptActionLabel,
    declineActionLabel,
    removeActionLabel,
    incomingLabel,
    outgoingLabel,
    contactsLabel,
    emptyLabel
  }) => {
    const langSignal = useSharedLangSignal()
    const searchQuery = useSignal('')
    const searchResults = useSignal<ContactSearchResult[]>([])
    const searchState = useSignal<'idle' | 'loading' | 'error'>('idle')
    const searchError = useSignal<string | null>(null)
    const invitesState = useSignal<'idle' | 'loading' | 'error'>('loading')
    const incoming = useSignal<ContactInviteView[]>([])
    const outgoing = useSignal<ContactInviteView[]>([])
    const contacts = useSignal<ContactInviteView[]>([])
    const onlineIds = useSignal<string[]>([])
    const statusMessage = useSignal<string | null>(null)
    const statusTone = useSignal<'neutral' | 'success' | 'error'>('neutral')
    const busyKeys = useSignal<string[]>([])
    const realtimeState = useSignal<RealtimeState>('idle')
    const wsRef = useSignal<NoSerialize<WebSocket> | undefined>(undefined)
    const baselineCounts = useSignal<BaselineInviteCounts | null>(null)
    const activeContact = useSignal<ActiveContact | null>(null)
    const dmClosing = useSignal(false)
    const dmOrigin = useSignal<DmOrigin | null>(null)
    const dmAnimated = useSignal(false)
    const dmMessages = useSignal<DmMessage[]>([])
    const dmInput = useSignal('')
    const dmStatus = useSignal<DmConnectionState>('idle')
    const dmError = useSignal<string | null>(null)
    const deviceListStaleAt = useSignal<string | null>(null)
    const channelRef = useSignal<NoSerialize<DmDataChannel> | undefined>(undefined)
    const identityRef = useSignal<NoSerialize<DeviceIdentity> | undefined>(undefined)
    const sessionRef = useSignal<NoSerialize<P2pSession> | undefined>(undefined)
    const remoteDeviceRef = useSignal<NoSerialize<ContactDevice> | undefined>(undefined)
    const identityReady = useSignal(false)
    const localProfile = useSignal<ProfilePayload | null>(null)
    const contactProfiles = useSignal<Record<string, ProfilePayload>>({})
    const profileCardContact = useSignal<ActiveContact | null>(null)
    const profileCardOpen = useSignal(false)
    const bellOpen = useSignal(false)
    const bellButtonRef = useSignal<HTMLButtonElement>()
    const bellPopoverRef = useSignal<HTMLDivElement>()
    const chatSettings = useSignal<ChatSettings>({ ...defaultChatSettings })
    const chatSettingsKey = useSignal(buildChatSettingsKey())
    const chatSettingsUserId = useSignal<string | undefined>(undefined)
    const chatSettingsOpen = useSignal(false)
    const chatSettingsButtonRef = useSignal<HTMLButtonElement>()
    const chatSettingsPopoverRef = useSignal<HTMLDivElement>()
    const typingActive = useSignal(false)
    const typingTimer = useSignal<number | null>(null)
    const remoteTyping = useSignal(false)
    const remoteTypingTimer = useSignal<number | null>(null)
    const historySuppressed = useSignal(false)
    const incomingImageCount = useSignal(0)
    const offline = useSignal(false)

    const fragmentCopy = useComputed$(() => getLanguagePack(langSignal.value).fragments ?? {})
    const resolve = (value: string) => fragmentCopy.value?.[value] ?? value
    const rootClass = className
      ? className.includes('chat-invites')
        ? className
        : `chat-invites ${className}`.trim()
      : 'chat-invites'

    const resolvedTitle = normalizeLabel(title ? resolve(title) : undefined, resolve('Contact invites'))
    const resolvedHelper = normalizeLabel(helper ? resolve(helper) : undefined, resolve('Search by email to connect.'))
    const resolvedSearchLabel = normalizeLabel(searchLabel ? resolve(searchLabel) : undefined, resolve('Search by email'))
    const resolvedSearchPlaceholder = normalizeLabel(
      searchPlaceholder ? resolve(searchPlaceholder) : undefined,
      resolve('name@domain.com')
    )
    const resolvedSearchAction = normalizeLabel(
      searchActionLabel ? resolve(searchActionLabel) : undefined,
      resolve('Search')
    )
    const resolvedInviteAction = normalizeLabel(
      inviteActionLabel ? resolve(inviteActionLabel) : undefined,
      resolve('Invite')
    )
    const resolvedAcceptAction = normalizeLabel(
      acceptActionLabel ? resolve(acceptActionLabel) : undefined,
      resolve('Accept')
    )
    const resolvedDeclineAction = normalizeLabel(
      declineActionLabel ? resolve(declineActionLabel) : undefined,
      resolve('Decline')
    )
    const resolvedRemoveAction = normalizeLabel(
      removeActionLabel ? resolve(removeActionLabel) : undefined,
      resolve('Remove')
    )
    const resolvedIncomingLabel = normalizeLabel(
      incomingLabel ? resolve(incomingLabel) : undefined,
      resolve('Incoming')
    )
    const resolvedOutgoingLabel = normalizeLabel(
      outgoingLabel ? resolve(outgoingLabel) : undefined,
      resolve('Outgoing')
    )
    const resolvedContactsLabel = normalizeLabel(
      contactsLabel ? resolve(contactsLabel) : undefined,
      resolve('Contacts')
    )
    const resolvedEmptyLabel = normalizeLabel(
      emptyLabel ? resolve(emptyLabel) : undefined,
      resolve('No invites yet.')
    )
    const resolvedOfflineSearchMessage = normalizeLabel(
      resolve('Offline - search is limited to cached contacts.'),
      resolve('Offline - search is limited to cached contacts.')
    )

    useVisibleTask$((ctx) => {
      if (typeof window === 'undefined') return
      localProfile.value = loadLocalProfile()
      contactProfiles.value = loadRemoteProfiles()
      const handleProfileUpdate = (event: Event) => {
        const detail = (event as CustomEvent).detail as { profile?: ProfilePayload } | undefined
        if (detail?.profile) {
          localProfile.value = detail.profile
        } else {
          localProfile.value = loadLocalProfile()
        }
      }
      window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate)
      ctx.cleanup(() => {
        window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate)
      })
    })

    const {
      registerIdentity,
      publishRelayIdentity,
      toggleChatSettings,
      toggleReadReceipts,
      toggleTypingIndicators,
      handleArchiveMessages,
      refreshInvites,
      handleSearchInput,
      handleSearchSubmit,
      handleInvite,
      handleAccept,
      handleDecline,
      handleRemove,
      toggleBell,
      handleContactClick,
      handleContactKeyDown,
      closeContact
    } = useContactInvitesActions({
      fragmentCopy,
      invitesState,
      statusMessage,
      statusTone,
      searchQuery,
      searchResults,
      searchState,
      searchError,
      incoming,
      outgoing,
      contacts,
      onlineIds,
      baselineCounts,
      activeContact,
      dmClosing,
      dmOrigin,
      dmAnimated,
      dmMessages,
      dmError,
      historySuppressed,
      busyKeys,
      realtimeState,
      bellOpen,
      chatSettings,
      chatSettingsUserId,
      chatSettingsOpen,
      chatSettingsButtonRef,
      chatSettingsPopoverRef,
      identityRef,
      remoteTyping,
      remoteTypingTimer,
      offline
    })
    const isAlertCount = (key: keyof BaselineInviteCounts, value: number) => {
      const baseline = baselineCounts.value
      if (!baseline) return false
      const previous = baseline[key]
      if (!Number.isFinite(previous)) return false
      return value > previous
    }

    const { sendTyping, handleDmInput, handleDmKeyDown, handleDmSubmit, handleDmImage } = useDmComposer({
      activeContact,
      dmInput,
      dmMessages,
      dmError,
      chatSettings,
      selfUserId: chatSettingsUserId,
      typingActive,
      typingTimer,
      identityRef,
      sessionRef,
      channelRef,
      remoteDeviceRef,
      fragmentCopy
    })

    useContactInvitesShell({
      activeContact,
      dmClosing,
      dmOrigin,
      incoming,
      outgoing,
      contacts,
      onlineIds,
      baselineCounts,
      invitesState,
      realtimeState,
      searchResults,
      wsRef,
      bellOpen,
      bellButtonRef,
      bellPopoverRef,
      chatSettingsOpen,
      chatSettingsButtonRef,
      chatSettingsPopoverRef,
      chatSettingsUserId,
      chatSettingsKey,
      chatSettings,
      identityReady,
      registerIdentity,
      publishRelayIdentity,
      refreshInvites,
      closeContact
    })

    useContactInvitesProfileSync({
      contacts,
      onlineIds,
      contactProfiles,
      localProfile,
      identityRef,
      registerIdentity
    })

    useDmConnection({
      activeContact,
      dmMessages,
      dmInput,
      dmStatus,
      dmError,
      deviceListStaleAt,
      channelRef,
      identityRef,
      sessionRef,
      remoteDeviceRef,
      localProfile,
      contactProfiles,
      chatSettings,
      selfUserId: chatSettingsUserId,
      remoteTyping,
      remoteTypingTimer,
      incomingImageCount,
      historySuppressed,
      fragmentCopy,
      registerIdentity,
      sendTyping
    })

    useVisibleTask$((ctx) => {
      const contact = ctx.track(() => activeContact.value)
      ctx.track(() => dmClosing.value)
      if (typeof document === 'undefined') return
      const root = document.documentElement
      if (activeContact.value || dmClosing.value) {
        root.dataset.chatDmOpen = 'true'
      } else {
        delete root.dataset.chatDmOpen
      }
      if (contact) {
        dmAnimated.value = false
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dmAnimated.value = true
          })
        })
      }
      ctx.cleanup(() => {
        delete root.dataset.chatDmOpen
      })
    })

    const closeProfileCard = $(() => {
      profileCardOpen.value = false
      profileCardContact.value = null
    })

    const handleAvatarClick = $((event: Event, contact: ContactSearchItem) => {
      if (!contact.isContact) return
      event.stopPropagation()
      profileCardContact.value = {
        id: contact.id,
        name: contact.name ?? null,
        email: contact.email,
        online: !!contact.online
      }
      profileCardOpen.value = true
    })

    const handleActiveProfileClick = $(() => {
      const contact = activeContact.value
      if (!contact) return
      profileCardContact.value = contact
      profileCardOpen.value = true
    })

    useVisibleTask$((ctx) => {
      const contact = ctx.track(() => activeContact.value)
      if (!contact || typeof window === 'undefined') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (getServerBackoffMs(window.location.host) > 0) return
      const preload = (qrl: QRL<unknown> | undefined) => qrl?.resolve?.().catch(() => undefined)
      void Promise.all([
        preload(handleDmInput as QRL<unknown>),
        preload(handleDmKeyDown as QRL<unknown>),
        preload(handleDmSubmit as QRL<unknown>),
        preload(handleDmImage as QRL<unknown>),
        preload(sendTyping as QRL<unknown>),
        preload(toggleChatSettings as QRL<unknown>),
        preload(toggleReadReceipts as QRL<unknown>),
        preload(toggleTypingIndicators as QRL<unknown>),
        preload(handleArchiveMessages as QRL<unknown>),
        preload(closeContact as QRL<unknown>),
        preload(handleActiveProfileClick as QRL<unknown>)
      ])
    })

    const onlineSet = new Set(onlineIds.value)
    const incomingCount = incoming.value.length
    const outgoingCount = outgoing.value.length
    const contactsCount = contacts.value.length
    const incomingAlert = isAlertCount('incoming', incomingCount)
    const outgoingAlert = isAlertCount('outgoing', outgoingCount)
    const baseline = baselineCounts.value
    const outgoingAcceptedAlert =
      !!baseline &&
      Number.isFinite(baseline.contacts) &&
      Number.isFinite(baseline.outgoing) &&
      contactsCount > baseline.contacts &&
      outgoingCount < baseline.outgoing
    const bellAlert = incomingAlert || outgoingAcceptedAlert
    const dmOpen = activeContact.value !== null
    const normalizedQuery = normalizeQuery(searchQuery.value)
    const contactMatches = normalizedQuery
      ? contacts.value.filter((invite) => matchesQuery(invite.user, normalizedQuery))
      : contacts.value
    const shouldSearchRemote = normalizedQuery !== '' && contactMatches.length === 0 && !offline.value
    const contactResults = contactMatches.map<ContactSearchItem>((invite) => ({
      id: invite.user.id,
      name: invite.user.name,
      email: invite.user.email,
      status: 'accepted',
      inviteId: invite.id,
      isContact: true,
      online: onlineSet.has(invite.user.id)
    }))
    const remoteResults = shouldSearchRemote
      ? searchResults.value.map<ContactSearchItem>((result) => ({
          id: result.id,
          name: result.name,
          email: result.email,
          status: result.status,
          inviteId: result.inviteId,
          isContact: false,
          online: false
        }))
      : []
    const displayResults: ContactSearchItem[] = [...contactResults, ...remoteResults]
    const resultsLabel =
      normalizedQuery === '' || contactMatches.length > 0 ? resolvedContactsLabel : resolve('Search results')
    const activeContactProfile = activeContact.value
      ? contactProfiles.value[activeContact.value.id] ?? null
      : null
    const profileCardProfile = profileCardContact.value
      ? contactProfiles.value[profileCardContact.value.id] ?? null
      : null
    const selfLabel = resolve('You')

    return (
      <section class={rootClass} data-state={invitesState.value} data-dm-open={dmOpen ? 'true' : 'false'}>
        <ContactInvitesHeader
          copy={fragmentCopy.value}
          title={resolvedTitle}
          helper={resolvedHelper}
          statusMessage={statusMessage.value}
          statusTone={statusTone.value}
          bellAlert={bellAlert}
          bellOpen={bellOpen.value}
          bellButtonRef={bellButtonRef}
          bellPopoverRef={bellPopoverRef}
          onToggleBell$={toggleBell}
          incoming={incoming.value}
          outgoing={outgoing.value}
          incomingCount={incomingCount}
          outgoingCount={outgoingCount}
          incomingAlert={incomingAlert}
          outgoingAlert={outgoingAlert}
          resolvedIncomingLabel={resolvedIncomingLabel}
          resolvedOutgoingLabel={resolvedOutgoingLabel}
          resolvedEmptyLabel={resolvedEmptyLabel}
          resolvedAcceptAction={resolvedAcceptAction}
          resolvedDeclineAction={resolvedDeclineAction}
          resolvedRemoveAction={resolvedRemoveAction}
          busyKeys={busyKeys.value}
          onAccept$={handleAccept}
          onDecline$={handleDecline}
          onRemove$={handleRemove}
        />

        <ContactInvitesSearch
          copy={fragmentCopy.value}
          resolvedSearchLabel={resolvedSearchLabel}
          resolvedSearchPlaceholder={resolvedSearchPlaceholder}
          resolvedSearchAction={resolvedSearchAction}
          offline={offline.value}
          offlineMessage={resolvedOfflineSearchMessage}
          searchQuery={searchQuery.value}
          searchState={searchState.value}
          searchError={searchError.value}
          resultsLabel={resultsLabel}
          displayResults={displayResults}
          normalizedQuery={normalizedQuery}
          activeContactId={activeContact.value?.id}
          profilesById={contactProfiles.value}
          resolvedInviteAction={resolvedInviteAction}
          resolvedAcceptAction={resolvedAcceptAction}
          resolvedDeclineAction={resolvedDeclineAction}
          resolvedRemoveAction={resolvedRemoveAction}
          busyKeys={busyKeys.value}
          onSearchSubmit$={handleSearchSubmit}
          onSearchInput$={handleSearchInput}
          onInvite$={handleInvite}
          onAccept$={handleAccept}
          onDecline$={handleDecline}
          onRemove$={handleRemove}
          onContactClick$={handleContactClick}
          onContactKeyDown$={handleContactKeyDown}
          onAvatarClick$={handleAvatarClick}
        />

        {activeContact.value ? (
          <ContactInvitesDm
            copy={fragmentCopy.value}
            activeContact={activeContact.value}
            dmClosing={dmClosing.value}
            dmAnimated={dmAnimated.value}
            dmOrigin={dmOrigin.value}
            dmStatus={dmStatus.value}
            deviceListStaleAt={deviceListStaleAt.value}
            incomingImageCount={incomingImageCount.value}
            remoteTyping={remoteTyping.value}
            contactProfile={activeContactProfile}
            selfProfile={localProfile.value}
            selfLabel={selfLabel}
            chatSettings={chatSettings.value}
            chatSettingsOpen={chatSettingsOpen.value}
            chatSettingsButtonRef={chatSettingsButtonRef}
            chatSettingsPopoverRef={chatSettingsPopoverRef}
            onClose$={closeContact}
            onProfileClick$={handleActiveProfileClick}
            onToggleSettings$={toggleChatSettings}
            onToggleReadReceipts$={toggleReadReceipts}
            onToggleTypingIndicators$={toggleTypingIndicators}
            onArchiveMessages$={handleArchiveMessages}
            dmMessages={dmMessages.value}
            dmError={dmError.value}
            dmInput={dmInput.value}
            onDmInput$={handleDmInput}
            onDmKeyDown$={handleDmKeyDown}
            onDmSubmit$={handleDmSubmit}
            onDmImage$={handleDmImage}
          />
        ) : null}
        <ContactProfileCard
          open={profileCardOpen.value}
          contact={profileCardContact.value}
          profile={profileCardProfile}
          onClose$={closeProfileCard}
        />
      </section>
    )
  }
)
