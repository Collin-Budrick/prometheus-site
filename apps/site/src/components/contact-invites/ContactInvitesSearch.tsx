import { $, component$, type PropFunction, useSignal } from '@builder.io/qwik'
import { formatDisplayName, formatInitials } from './utils'
import type { ContactSearchItem } from './types'
import type { ProfilePayload } from '../../shared/profile-storage'

type ContactInvitesSearchProps = {
  copy: Record<string, string>
  resolvedSearchLabel: string
  resolvedSearchPlaceholder: string
  resolvedSearchAction: string
  offline: boolean
  offlineMessage: string
  searchQuery: string
  searchState: 'idle' | 'loading' | 'error'
  searchError: string | null
  resultsLabel: string
  displayResults: ContactSearchItem[]
  normalizedQuery: string
  activeContactId?: string
  profilesById: Record<string, ProfilePayload | undefined>
  resolvedInviteAction: string
  resolvedAcceptAction: string
  resolvedDeclineAction: string
  resolvedRemoveAction: string
  busyKeys: string[]
  onSearchSubmit$: PropFunction<() => void | Promise<void>>
  onSearchInput$: PropFunction<(event: Event) => void>
  onInvite$: PropFunction<(email: string, userId?: string) => void | Promise<void>>
  onImportInvite$: PropFunction<(token: string) => void | Promise<void>>
  onAccept$: PropFunction<(inviteId: string, userId: string) => void | Promise<void>>
  onDecline$: PropFunction<(inviteId: string, userId: string) => void | Promise<void>>
  onRemove$: PropFunction<(inviteId: string, userId: string, email: string) => void | Promise<void>>
  onContactClick$: PropFunction<(event: Event, contact: ContactSearchItem) => void>
  onContactKeyDown$: PropFunction<(event: KeyboardEvent, contact: ContactSearchItem) => void>
  onAvatarClick$: PropFunction<(event: Event, contact: ContactSearchItem) => void>
}

export const ContactInvitesSearch = component$<ContactInvitesSearchProps>((props) => {
  const resolve = (value: string) => props.copy?.[value] ?? value
  const manualInviteInput = useSignal('')
  const handleContactClick = $((event: Event) => {
    const target = event.target as HTMLElement | null
    const current = event.currentTarget as HTMLElement | null
    const source =
      (target?.closest?.('[data-contact-id]') as HTMLElement | null) ??
      (current?.closest?.('[data-contact-id]') as HTMLElement | null) ??
      current
    if (!source) return
    const dataset = source.dataset
    if (!dataset?.contactId || !dataset?.contactEmail) return
    const { contactId, contactEmail, contactName, contactStatus, contactInviteId, contactIsContact, contactOnline } = dataset
    const status =
      contactStatus === 'incoming' || contactStatus === 'outgoing' || contactStatus === 'accepted' || contactStatus === 'none'
        ? contactStatus
        : undefined
    const contact: ContactSearchItem = {
      id: contactId,
      email: contactEmail,
      isContact: contactIsContact === 'true',
      online: contactOnline === 'true'
    }
    if (contactName) contact.name = contactName
    if (status) contact.status = status
    if (contactInviteId) contact.inviteId = contactInviteId
    if (!contact?.isContact) return
    void props.onContactClick$(event, contact)
  })
  const handleContactKeyDown = $((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    const current = event.currentTarget as HTMLElement | null
    const source =
      (target?.closest?.('[data-contact-id]') as HTMLElement | null) ??
      (current?.closest?.('[data-contact-id]') as HTMLElement | null) ??
      current
    if (!source) return
    const dataset = source.dataset
    if (!dataset?.contactId || !dataset?.contactEmail) return
    const { contactId, contactEmail, contactName, contactStatus, contactInviteId, contactIsContact, contactOnline } = dataset
    const status =
      contactStatus === 'incoming' || contactStatus === 'outgoing' || contactStatus === 'accepted' || contactStatus === 'none'
        ? contactStatus
        : undefined
    const contact: ContactSearchItem = {
      id: contactId,
      email: contactEmail,
      isContact: contactIsContact === 'true',
      online: contactOnline === 'true'
    }
    if (contactName) contact.name = contactName
    if (status) contact.status = status
    if (contactInviteId) contact.inviteId = contactInviteId
    if (!contact?.isContact) return
    void props.onContactKeyDown$(event, contact)
  })
  const handleAvatarClick = $((event: Event) => {
    const target = event.target as HTMLElement | null
    const current = event.currentTarget as HTMLElement | null
    const source =
      (target?.closest?.('[data-contact-id]') as HTMLElement | null) ??
      (current?.closest?.('[data-contact-id]') as HTMLElement | null) ??
      current
    if (!source) return
    const dataset = source.dataset
    if (!dataset?.contactId || !dataset?.contactEmail) return
    const { contactId, contactEmail, contactName, contactStatus, contactInviteId, contactIsContact, contactOnline } = dataset
    const status =
      contactStatus === 'incoming' || contactStatus === 'outgoing' || contactStatus === 'accepted' || contactStatus === 'none'
        ? contactStatus
        : undefined
    const contact: ContactSearchItem = {
      id: contactId,
      email: contactEmail,
      isContact: contactIsContact === 'true',
      online: contactOnline === 'true'
    }
    if (contactName) contact.name = contactName
    if (status) contact.status = status
    if (contactInviteId) contact.inviteId = contactInviteId
    if (!contact?.isContact) return
    event.stopPropagation()
    void props.onAvatarClick$(event, contact)
  })
  const resolveActionTarget = (event: Event, selector: string) => {
    const target = event.target as HTMLElement | null
    const current = event.currentTarget as HTMLElement | null
    return (target?.closest?.(selector) as HTMLElement | null) ?? current
  }
  const handleInviteClick = $((event: Event) => {
    const target = resolveActionTarget(event, 'button[data-contact-email]')
    const email = target?.dataset?.contactEmail
    const userId = target?.dataset?.contactId
    if (!email) return
    void props.onInvite$(email, userId)
  })
  const handleManualInput = $((event: Event) => {
    manualInviteInput.value = (event.target as HTMLTextAreaElement).value
  })
  const handleManualImport = $(() => {
    const value = manualInviteInput.value.trim()
    if (!value) return
    void props.onImportInvite$(value)
    manualInviteInput.value = ''
  })
  const handleAcceptClick = $((event: Event) => {
    const target = resolveActionTarget(event, 'button[data-invite-id]')
    const inviteId = target?.dataset?.inviteId
    const userId = target?.dataset?.contactId
    if (!inviteId || !userId) return
    void props.onAccept$(inviteId, userId)
  })
  const handleDeclineClick = $((event: Event) => {
    const target = resolveActionTarget(event, 'button[data-invite-id]')
    const inviteId = target?.dataset?.inviteId
    const userId = target?.dataset?.contactId
    if (!inviteId || !userId) return
    void props.onDecline$(inviteId, userId)
  })
  const handleRemoveClick = $((event: Event) => {
    const target = resolveActionTarget(event, 'button[data-invite-id]')
    const inviteId = target?.dataset?.inviteId
    const userId = target?.dataset?.contactId
    const email = target?.dataset?.contactEmail
    if (!inviteId || !userId || !email) return
    void props.onRemove$(inviteId, userId, email)
  })

  return (
    <>
      <form class="chat-invites-search" preventdefault:submit onSubmit$={props.onSearchSubmit$}>
        <label class="chat-invites-field">
          <span>{props.resolvedSearchLabel}</span>
          <input
            type="text"
            inputMode="text"
            placeholder={props.resolvedSearchPlaceholder}
            value={props.searchQuery}
            onInput$={props.onSearchInput$}
            aria-label={props.resolvedSearchLabel}
          />
        </label>
        <button
          class="chat-invites-button"
          type="submit"
          disabled={props.searchState === 'loading' || props.offline}
        >
          {props.searchState === 'loading' ? resolve('Searching...') : props.resolvedSearchAction}
        </button>
      </form>

      <div class="chat-invites-results" data-state={props.searchState}>
        <div class="chat-invites-results-header">
          <span>{props.resultsLabel}</span>
          {props.searchError ? (
            <span class="chat-invites-error">{props.searchError}</span>
          ) : props.offline ? (
            <span class="chat-invites-error">{props.offlineMessage}</span>
          ) : null}
        </div>
        {props.searchState === 'loading' && props.displayResults.length === 0 ? (
          <p class="chat-invites-empty">{resolve('Searching...')}</p>
        ) : null}
        {props.searchState !== 'loading' && props.displayResults.length === 0 && props.normalizedQuery ? (
          <p class="chat-invites-empty">{resolve('No matches yet.')}</p>
        ) : null}
        {props.searchState !== 'loading' && props.displayResults.length === 0 && !props.normalizedQuery ? (
          <p class="chat-invites-empty">{resolve('No contacts yet.')}</p>
        ) : null}
        <div class="chat-invites-list">
          {props.displayResults.map((result, index) => {
            const displayName = formatDisplayName(result)
            const isContact = result.isContact || result.status === 'accepted'
            const isPending = result.status === 'outgoing'
            const isIncoming = result.status === 'incoming'
            const isAccepted = result.status === 'accepted' || isContact
            const isOnline = isContact ? !!result.online : false
            const isActiveContact = props.activeContactId === result.id
            const profile = props.profilesById[result.id]
            const avatar = profile?.avatar ?? null
            const initials = formatInitials(result)

            return (
              <article
                key={`${result.id}-${result.email}`}
                class="chat-invites-item"
                data-interactive={isContact ? 'true' : 'false'}
                data-active={isActiveContact ? 'true' : 'false'}
                data-contact-card={isContact ? 'true' : undefined}
                data-contact-id={result.id}
                data-contact-email={result.email}
                data-contact-name={result.name ?? undefined}
                data-contact-status={result.status ?? undefined}
                data-contact-invite-id={result.inviteId ?? undefined}
                data-contact-is-contact={isContact ? 'true' : 'false'}
                data-contact-online={isOnline ? 'true' : 'false'}
                style={`--stagger-index:${index};`}
                role={isContact ? 'button' : undefined}
                tabIndex={isContact ? 0 : undefined}
                aria-label={isContact ? resolve('Open direct message') : undefined}
                onClick$={isContact ? handleContactClick : undefined}
                onKeyDown$={isContact ? handleContactKeyDown : undefined}
              >
                <div>
                  <div class="chat-invites-item-heading">
                    {isContact ? (
                      <button
                        type="button"
                        class="chat-invites-avatar"
                        data-clickable="true"
                        aria-label={resolve('View profile')}
                        onClick$={handleAvatarClick}
                      >
                        {avatar ? <img src={avatar} alt={displayName} loading="lazy" /> : <span>{initials}</span>}
                        <span
                          class="chat-invites-presence"
                          data-online={isOnline ? 'true' : 'false'}
                          aria-hidden="true"
                        />
                      </button>
                    ) : null}
                    <p class="chat-invites-item-name">{displayName}</p>
                  </div>
                  <p class="chat-invites-item-meta">{result.email}</p>
                </div>
                <div class="chat-invites-actions">
                  {isAccepted ? <span class="chat-invites-pill">{resolve('Connected')}</span> : null}
                  {isPending ? <span class="chat-invites-pill">{resolve('Pending')}</span> : null}
                  {isIncoming ? <span class="chat-invites-pill accent">{resolve('Incoming')}</span> : null}
                  {isContact && result.inviteId ? (
                    <button
                      type="button"
                      class="chat-invites-action ghost"
                      disabled={props.busyKeys.includes(`remove:${result.inviteId}`)}
                      data-invite-id={result.inviteId}
                      data-contact-id={result.id}
                      data-contact-email={result.email}
                      onClick$={handleRemoveClick}
                    >
                      {props.resolvedRemoveAction}
                    </button>
                  ) : null}
                  {(result.status === 'none' || result.status === undefined) && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action"
                      disabled={props.busyKeys.includes(`invite:${result.email}`)}
                      data-contact-id={result.id}
                      data-contact-email={result.email}
                      onClick$={handleInviteClick}
                    >
                      {props.resolvedInviteAction}
                    </button>
                  ) : null}
                  {isIncoming && result.inviteId && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action success"
                      disabled={props.busyKeys.includes(`accept:${result.inviteId}`)}
                      data-invite-id={result.inviteId}
                      data-contact-id={result.id}
                      onClick$={handleAcceptClick}
                    >
                      {props.resolvedAcceptAction}
                    </button>
                  ) : null}
                  {isIncoming && result.inviteId && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action ghost"
                      disabled={props.busyKeys.includes(`decline:${result.inviteId}`)}
                      data-invite-id={result.inviteId}
                      data-contact-id={result.id}
                      onClick$={handleDeclineClick}
                    >
                      {props.resolvedDeclineAction}
                    </button>
                  ) : null}
                  {(isPending || isAccepted) && result.inviteId && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action ghost"
                      disabled={props.busyKeys.includes(`remove:${result.inviteId}`)}
                      data-invite-id={result.inviteId}
                      data-contact-id={result.id}
                      data-contact-email={result.email}
                      onClick$={handleRemoveClick}
                    >
                      {props.resolvedRemoveAction}
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
        <div class="chat-invites-manual">
          <div class="chat-invites-manual-header">
            <span>{resolve('Paste invite code')}</span>
            <div class="chat-invites-manual-actions">
              <button
                type="button"
                class="chat-invites-action"
                disabled={!manualInviteInput.value.trim()}
                onClick$={handleManualImport}
              >
                {resolve('Import')}
              </button>
            </div>
          </div>
          <textarea
            class="chat-invites-manual-code"
            value={manualInviteInput.value}
            onInput$={handleManualInput}
            placeholder={resolve('Paste invite code here')}
            aria-label={resolve('Invite code')}
          />
        </div>
      </div>
    </>
  )
})
