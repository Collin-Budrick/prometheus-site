import { component$, type PropFunction } from '@builder.io/qwik'
import { formatDisplayName, formatInitials } from './utils'
import type { ContactSearchItem } from './types'
import type { ProfilePayload } from '../../shared/profile-storage'

type ContactInvitesSearchProps = {
  copy: Record<string, string>
  resolvedSearchLabel: string
  resolvedSearchPlaceholder: string
  resolvedSearchAction: string
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
  onAccept$: PropFunction<(inviteId: string, userId: string) => void | Promise<void>>
  onDecline$: PropFunction<(inviteId: string, userId: string) => void | Promise<void>>
  onRemove$: PropFunction<(inviteId: string, userId: string, email: string) => void | Promise<void>>
  onContactClick$: PropFunction<(event: Event, contact: ContactSearchItem) => void>
  onContactKeyDown$: PropFunction<(event: KeyboardEvent, contact: ContactSearchItem) => void>
  onAvatarClick$: PropFunction<(event: Event, contact: ContactSearchItem) => void>
}

export const ContactInvitesSearch = component$<ContactInvitesSearchProps>((props) => {
  const resolve = (value: string) => props.copy?.[value] ?? value

  return (
    <>
      <form class="chat-invites-search" preventdefault:submit onSubmit$={props.onSearchSubmit$}>
        <label class="chat-invites-field">
          <span>{props.resolvedSearchLabel}</span>
          <input
            type="text"
            inputMode="email"
            placeholder={props.resolvedSearchPlaceholder}
            value={props.searchQuery}
            onInput$={props.onSearchInput$}
            aria-label={props.resolvedSearchLabel}
          />
        </label>
        <button class="chat-invites-button" type="submit" disabled={props.searchState === 'loading'}>
          {props.searchState === 'loading' ? resolve('Searching...') : props.resolvedSearchAction}
        </button>
      </form>

      <div class="chat-invites-results" data-state={props.searchState}>
        <div class="chat-invites-results-header">
          <span>{props.resultsLabel}</span>
          {props.searchError ? <span class="chat-invites-error">{props.searchError}</span> : null}
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
                style={`--stagger-index:${index};`}
                role={isContact ? 'button' : undefined}
                tabIndex={isContact ? 0 : undefined}
                aria-label={isContact ? resolve('Open direct message') : undefined}
                onClick$={isContact ? (event) => props.onContactClick$(event, result) : undefined}
                onKeyDown$={isContact ? (event) => props.onContactKeyDown$(event, result) : undefined}
              >
                <div>
                  <div class="chat-invites-item-heading">
                    {isContact ? (
                      <button
                        type="button"
                        class="chat-invites-avatar"
                        data-clickable="true"
                        aria-label={resolve('View profile')}
                        onClick$={(event) => {
                          event.stopPropagation()
                          void props.onAvatarClick$(event, result)
                        }}
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
                      onClick$={() => props.onRemove$(result.inviteId!, result.id, result.email)}
                    >
                      {props.resolvedRemoveAction}
                    </button>
                  ) : null}
                  {(result.status === 'none' || result.status === undefined) && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action"
                      disabled={props.busyKeys.includes(`invite:${result.email}`)}
                      onClick$={() => props.onInvite$(result.email, result.id)}
                    >
                      {props.resolvedInviteAction}
                    </button>
                  ) : null}
                  {isIncoming && result.inviteId && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action success"
                      disabled={props.busyKeys.includes(`accept:${result.inviteId}`)}
                      onClick$={() => props.onAccept$(result.inviteId!, result.id)}
                    >
                      {props.resolvedAcceptAction}
                    </button>
                  ) : null}
                  {isIncoming && result.inviteId && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action ghost"
                      disabled={props.busyKeys.includes(`decline:${result.inviteId}`)}
                      onClick$={() => props.onDecline$(result.inviteId!, result.id)}
                    >
                      {props.resolvedDeclineAction}
                    </button>
                  ) : null}
                  {(isPending || isAccepted) && result.inviteId && !isContact ? (
                    <button
                      type="button"
                      class="chat-invites-action ghost"
                      disabled={props.busyKeys.includes(`remove:${result.inviteId}`)}
                      onClick$={() => props.onRemove$(result.inviteId!, result.id, result.email)}
                    >
                      {props.resolvedRemoveAction}
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </>
  )
})
