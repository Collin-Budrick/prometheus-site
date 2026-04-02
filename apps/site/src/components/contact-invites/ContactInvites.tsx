import { $, component$, useSignal, useVisibleTask$, type QRL } from '@builder.io/qwik'
import {
  beginInitialTask,
  failInitialTask,
  finishInitialTask,
  getFragmentInitialTaskKey,
  markInitialTasksComplete,
  resolveFragmentInitialTaskHost
} from '../../fragment/ui/initial-settle'
import { runAfterClientIntentIdle } from '../../shared/client-boot'
import { useContactInvitesSeed } from '../../features/messaging/contact-invites-seed'
import {
  emptyInviteGroups,
  type ContactInviteGroups,
  type ContactInviteUser,
  type ContactSearchResult
} from './data'
import {
  acceptContactInviteDirect,
  declineContactInviteDirect,
  removeContactInviteDirect,
  searchContactDirectory,
  sendContactInviteDirect,
  subscribeContactInvites
} from '../../features/messaging/spacetime-contacts'

type ContactInvitesVariant = 'shell' | 'details'

type ContactInvitesProps = {
  class?: string
  title?: string
  helper?: string
  searchLabel?: string
  searchPlaceholder?: string
  searchActionLabel?: string
  inviteActionLabel?: string
  acceptActionLabel?: string
  declineActionLabel?: string
  removeActionLabel?: string
  incomingLabel?: string
  outgoingLabel?: string
  contactsLabel?: string
  emptyLabel?: string
  variant?: ContactInvitesVariant
}

type StatusNote = {
  tone: 'success' | 'error' | 'info'
  message: string
}

const buildRootClass = (className?: string) => {
  const classes = ['chat-invites']
  if (className) classes.push(className)
  return classes.join(' ')
}

const resolveDisplayName = (user: ContactInviteUser) =>
  user.name?.trim() || user.handle || user.id

const resolveMetaLine = (user: ContactInviteUser) => user.handle || user.id

const resolveAvatarText = (user: ContactInviteUser) => {
  const source = resolveDisplayName(user)
  const letters = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase())
  return (letters[0] ?? '?') + (letters[1] ?? '')
}

const renderInviteList = ({
  invites,
  label,
  emptyLabel,
  tone = 'default',
  actionLabel,
  onAction$,
  acceptActionLabel,
  declineActionLabel,
  removeActionLabel,
  onInviteAction$
}: {
  invites: ContactInviteGroups['incoming'] | ContactInviteGroups['outgoing'] | ContactInviteGroups['contacts']
  label: string
  emptyLabel: string
  tone?: 'default' | 'alert'
  actionLabel?: string
  onAction$?: QRL<(identity: string) => void>
  acceptActionLabel?: string
  declineActionLabel?: string
  removeActionLabel?: string
  onInviteAction$?: QRL<(inviteId: string, action: 'accept' | 'decline' | 'remove') => void>
}) => (
  <div class="chat-invites-subsection">
    <div class="chat-invites-subheader">
      <span>{label}</span>
      <span class="chat-invites-subcount" data-alert={tone === 'alert' && invites.length > 0 ? 'true' : 'false'}>
        {invites.length}
      </span>
    </div>
    <div class="chat-invites-list">
      {invites.length === 0 ? (
        <div class="chat-invites-empty">{emptyLabel}</div>
      ) : (
        invites.map((invite, index) => (
          <div class="chat-invites-item" style={{ '--stagger-index': index }}>
            <div class="chat-invites-item-heading">
              <div class="chat-invites-avatar">{resolveAvatarText(invite.user)}</div>
              <div>
                <div class="chat-invites-item-name">{resolveDisplayName(invite.user)}</div>
                <div class="chat-invites-item-meta">{resolveMetaLine(invite.user)}</div>
              </div>
            </div>
            <div class="chat-invites-actions">
              {actionLabel && onAction$ ? (
                <button
                  type="button"
                  class="chat-invites-action success"
                  onClick$={() => onAction$(invite.user.id)}
                >
                  {actionLabel}
                </button>
              ) : null}
              {acceptActionLabel && declineActionLabel && onInviteAction$ ? (
                <>
                  <button
                    type="button"
                    class="chat-invites-action success"
                    onClick$={() => onInviteAction$(invite.id, 'accept')}
                  >
                    {acceptActionLabel}
                  </button>
                  <button
                    type="button"
                    class="chat-invites-action ghost"
                    onClick$={() => onInviteAction$(invite.id, 'decline')}
                  >
                    {declineActionLabel}
                  </button>
                </>
              ) : null}
              {removeActionLabel && onInviteAction$ ? (
                <button
                  type="button"
                  class="chat-invites-action ghost"
                  onClick$={() => onInviteAction$(invite.id, 'remove')}
                >
                  {removeActionLabel}
                </button>
              ) : null}
              {!actionLabel && !acceptActionLabel && !declineActionLabel && !removeActionLabel ? (
                <span class={`chat-invites-pill${tone === 'alert' ? '' : ' accent'}`}>
                  {tone === 'alert' ? 'Pending' : 'Contact'}
                </span>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)

export const ContactInvites = component$<ContactInvitesProps>((props) => {
  const seed = useContactInvitesSeed()
  const hasSeed = seed !== null
  const variant: ContactInvitesVariant = props.variant === 'details' ? 'details' : 'shell'
  const minimumSearchLength = 2
  const statusNote = useSignal<StatusNote | null>(null)
  const invitesState = useSignal<'idle' | 'loading' | 'error'>(variant === 'details' && !hasSeed ? 'loading' : 'idle')
  const invites = useSignal<ContactInviteGroups>(seed?.invites ?? emptyInviteGroups)
  const invitesError = useSignal<string | null>(null)
  const searchQuery = useSignal('')
  const searchResults = useSignal<ContactSearchResult[]>([])
  const searchState = useSignal<'idle' | 'loading' | 'error'>('idle')
  const searchError = useSignal<string | null>(null)
  const rootRef = useSignal<HTMLElement>()
  const searchInputRef = useSignal<HTMLInputElement>()
  const initialTaskKey = useSignal<string | null>(null)
  const initialTaskSettled = useSignal(variant === 'shell' || hasSeed)

  const refreshSearch = $(async (query: string) => {
    const trimmed = query.trim()
    if (trimmed.length < minimumSearchLength) {
      searchResults.value = []
      searchState.value = trimmed.length === 0 ? 'idle' : 'error'
      searchError.value = trimmed.length === 0 ? null : `Search needs at least ${minimumSearchLength} characters.`
      return
    }
    searchState.value = 'loading'
    searchError.value = null
    try {
      searchResults.value = searchContactDirectory(trimmed)
      searchState.value = 'idle'
    } catch (error) {
      searchState.value = 'error'
      searchError.value = error instanceof Error ? error.message : 'Search unavailable'
    }
  })

  const handleSearch = $(async () => {
    await refreshSearch(searchQuery.value)
  })

  const handleSearchKeyDown = $((event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void handleSearch()
  })

  const handleInvite = $(async (identity: string) => {
    statusNote.value = null
    try {
      await sendContactInviteDirect(identity)
      statusNote.value = { tone: 'success', message: 'Invite sent.' }
      await refreshSearch(searchQuery.value)
    } catch (error) {
      statusNote.value = {
        tone: 'error',
        message: error instanceof Error ? error.message : 'Invite failed.'
      }
    }
  })

  const handleInviteAction = $(async (inviteId: string, action: 'accept' | 'decline' | 'remove') => {
    statusNote.value = null
    try {
      if (action === 'accept') {
        await acceptContactInviteDirect(inviteId)
      } else if (action === 'decline') {
        await declineContactInviteDirect(inviteId)
      } else {
        await removeContactInviteDirect(inviteId)
      }
      statusNote.value = {
        tone: 'success',
        message: action === 'accept' ? 'Invite accepted.' : action === 'decline' ? 'Invite declined.' : 'Invite removed.'
      }
      await refreshSearch(searchQuery.value)
    } catch (error) {
      statusNote.value = {
        tone: 'error',
        message: error instanceof Error ? error.message : 'Action failed.'
      }
    }
  })

  useVisibleTask$(
    (ctx) => {
      if (variant !== 'details') return
      const root = rootRef.value
      ctx.track(() => rootRef.value)
      if (!root) return
      const host = resolveFragmentInitialTaskHost(root)
      if (!host) return
      if (initialTaskSettled.value) {
        markInitialTasksComplete(host)
        return
      }
      const key = getFragmentInitialTaskKey('contact-invites:initial', root)
      initialTaskKey.value = key
      beginInitialTask(host, key)
      ctx.cleanup(() => {
        if (!initialTaskSettled.value) {
          failInitialTask(host, key)
        }
      })
    },
    { strategy: 'document-ready' }
  )

  const settleInitialTask = $(() => {
    if (initialTaskSettled.value) return
    initialTaskSettled.value = true
    const root = rootRef.value
    const key = initialTaskKey.value
    const host = root ? resolveFragmentInitialTaskHost(root) : null
    if (!host || !key) return
    finishInitialTask(host, key)
    markInitialTasksComplete(host)
  })

  useVisibleTask$((ctx) => {
    if (variant !== 'details' || typeof window === 'undefined') return
    invitesState.value = hasSeed ? 'idle' : 'loading'
    let cleanup = () => {}
    const cancelDeferredSubscription = runAfterClientIntentIdle(() => {
      cleanup = subscribeContactInvites((snapshot) => {
        invites.value = snapshot.invites
        invitesError.value = snapshot.error
        invitesState.value = snapshot.status === 'error' ? 'error' : snapshot.status === 'connecting' ? 'loading' : 'idle'
        if (!initialTaskSettled.value && snapshot.status !== 'connecting') {
          void settleInitialTask()
        }
      })
    })
    ctx.cleanup(() => {
      cancelDeferredSubscription()
      cleanup()
    })
  })

  const incomingCount = invites.value.incoming.length
  const outgoingCount = invites.value.outgoing.length
  const contactsCount = invites.value.contacts.length
  const pendingCount = incomingCount + outgoingCount
  const title = props.title ?? (variant === 'details' ? 'Invite activity' : 'Contact invites')
  const helper =
    props.helper ??
    (variant === 'details'
      ? 'Pending invites and saved contacts appear after the search shell is ready.'
      : 'Search by user ID to connect.')

  if (variant === 'details') {
    return (
      <div ref={rootRef} class={buildRootClass(props.class)}>
        <div class="chat-invites-header">
          <div>
            <div class="chat-invites-title">{title}</div>
            <p class="chat-invites-helper">{helper}</p>
          </div>
          <div class="chat-invites-header-actions">
            <span class="chat-invites-status-note" data-tone={incomingCount > 0 ? 'success' : 'neutral'}>
              {pendingCount} pending
            </span>
            {statusNote.value ? (
              <span class="chat-invites-status-note" data-tone={statusNote.value.tone}>
                {statusNote.value.message}
              </span>
            ) : null}
          </div>
        </div>
        <section class="chat-invites-results">
          <div class="chat-invites-results-header">
            <span>{title}</span>
            {invitesState.value === 'error' && invitesError.value ? (
              <span class="chat-invites-error">{invitesError.value}</span>
            ) : null}
          </div>
          {invitesState.value === 'loading' ? (
            <div class="chat-invites-empty">Loading invites...</div>
          ) : (
            <>
              {renderInviteList({
                invites: invites.value.incoming,
                label: props.incomingLabel ?? 'Incoming',
                emptyLabel: props.emptyLabel ?? 'No invites yet.',
                tone: 'alert',
                acceptActionLabel: props.acceptActionLabel ?? 'Accept',
                declineActionLabel: props.declineActionLabel ?? 'Decline',
                onInviteAction$: handleInviteAction
              })}
              {renderInviteList({
                invites: invites.value.outgoing,
                label: props.outgoingLabel ?? 'Outgoing',
                emptyLabel: props.emptyLabel ?? 'No invites yet.',
                removeActionLabel: props.removeActionLabel ?? 'Remove',
                onInviteAction$: handleInviteAction
              })}
              {renderInviteList({
                invites: invites.value.contacts,
                label: props.contactsLabel ?? 'Contacts',
                emptyLabel: props.emptyLabel ?? 'No invites yet.'
              })}
            </>
          )}
        </section>
      </div>
    )
  }

  return (
    <div ref={rootRef} class={buildRootClass(props.class)}>
      <div class="chat-invites-header">
        <div>
          <div class="chat-invites-title">{title}</div>
          <p class="chat-invites-helper">{helper}</p>
        </div>
        <div class="chat-invites-header-actions">
          <span class="chat-invites-status-note" data-tone={pendingCount > 0 ? 'success' : 'neutral'}>
            {pendingCount} pending
          </span>
          {statusNote.value ? (
            <span class="chat-invites-status-note" data-tone={statusNote.value.tone}>
              {statusNote.value.message}
            </span>
          ) : null}
        </div>
      </div>
      <div class="chat-invites-search">
        <label class="chat-invites-field">
          <span>{props.searchLabel ?? 'Search'}</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery.value}
            placeholder={props.searchPlaceholder ?? 'name or identity'}
            onInput$={(event) => {
              searchQuery.value = (event.target as HTMLInputElement).value
            }}
            onKeyDown$={handleSearchKeyDown}
            aria-label={props.searchLabel ?? 'Search'}
          />
        </label>
        <button
          type="button"
          class="chat-invites-button"
          onClick$={handleSearch}
          disabled={searchState.value === 'loading'}
        >
          {props.searchActionLabel ?? 'Search'}
        </button>
      </div>
      <section class="chat-invites-results">
        <div class="chat-invites-results-header">
          <span>Search results</span>
          {searchState.value === 'error' && searchError.value ? (
            <span class="chat-invites-error">{searchError.value}</span>
          ) : null}
        </div>
        <div class="chat-invites-list">
          {searchResults.value.length === 0 ? (
            <div class="chat-invites-empty">{props.emptyLabel ?? 'No invites yet.'}</div>
          ) : (
            searchResults.value.map((result, index) => (
              <div class="chat-invites-item" style={{ '--stagger-index': index }}>
                <div class="chat-invites-item-heading">
                  <div class="chat-invites-avatar" data-size="sm">
                    {resolveAvatarText(result)}
                  </div>
                  <div>
                    <div class="chat-invites-item-name">{result.name?.trim() || result.handle || result.id}</div>
                    <div class="chat-invites-item-meta">{result.handle || result.id}</div>
                  </div>
                </div>
                <div class="chat-invites-actions">
                  {result.status === 'none' ? (
                    <button
                      type="button"
                      class="chat-invites-action success"
                      onClick$={() => handleInvite(result.id)}
                    >
                      {props.inviteActionLabel ?? 'Invite'}
                    </button>
                  ) : null}
                  {result.status === 'incoming' && result.inviteId ? (
                    <>
                      <button
                        type="button"
                        class="chat-invites-action success"
                        onClick$={() => handleInviteAction(result.inviteId ?? '', 'accept')}
                      >
                        {props.acceptActionLabel ?? 'Accept'}
                      </button>
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        onClick$={() => handleInviteAction(result.inviteId ?? '', 'decline')}
                      >
                        {props.declineActionLabel ?? 'Decline'}
                      </button>
                    </>
                  ) : null}
                  {result.status === 'outgoing' && result.inviteId ? (
                    <button
                      type="button"
                      class="chat-invites-action ghost"
                      onClick$={() => handleInviteAction(result.inviteId ?? '', 'remove')}
                    >
                      {props.removeActionLabel ?? 'Remove'}
                    </button>
                  ) : null}
                  {result.status === 'accepted' ? <span class="chat-invites-pill accent">Contact</span> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
})
