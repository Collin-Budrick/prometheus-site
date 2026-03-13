import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import {
  beginInitialTask,
  failInitialTask,
  finishInitialTask,
  getFragmentInitialTaskKey,
  markInitialTasksComplete,
  resolveFragmentInitialTaskHost
} from '../../fragment/ui/initial-settle'
import { useContactInvitesSeed } from '../../shared/contact-invites-seed'
import {
  emptyInviteGroups,
  type ContactInviteGroups,
  type ContactInviteUser,
  type ContactSearchResult
} from './data'
import {
  bindOverlayDismiss,
  focusOverlayEntry,
  restoreOverlayFocusBeforeHide,
  setOverlaySurfaceState
} from '../../shared/overlay-a11y'
import {
  acceptContactInviteDirect,
  declineContactInviteDirect,
  removeContactInviteDirect,
  searchContactDirectory,
  sendContactInviteDirect,
  subscribeContactInvites
} from '../../shared/spacetime-contacts'

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

export const ContactInvites = component$<ContactInvitesProps>((props) => {
  const seed = useContactInvitesSeed()
  const hasSeed = seed !== null
  const minimumSearchLength = 2
  const popoverOpen = useSignal(false)
  const statusNote = useSignal<StatusNote | null>(null)
  const invitesState = useSignal<'idle' | 'loading' | 'error'>('idle')
  const invites = useSignal<ContactInviteGroups>(seed?.invites ?? emptyInviteGroups)
  const invitesError = useSignal<string | null>(null)
  const searchQuery = useSignal('')
  const searchResults = useSignal<ContactSearchResult[]>([])
  const searchState = useSignal<'idle' | 'loading' | 'error'>('idle')
  const searchError = useSignal<string | null>(null)
  const rootRef = useSignal<HTMLElement>()
  const popoverRootRef = useSignal<HTMLElement>()
  const popoverTriggerRef = useSignal<HTMLButtonElement>()
  const popoverRef = useSignal<HTMLDivElement>()
  const searchInputRef = useSignal<HTMLInputElement>()
  const wasPopoverOpen = useSignal(false)
  const initialTaskKey = useSignal<string | null>(null)
  const initialTaskSettled = useSignal(hasSeed)

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

  const togglePopover = $(() => {
    popoverOpen.value = !popoverOpen.value
  })

  useVisibleTask$(
    (ctx) => {
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
    if (typeof window === 'undefined') return
    invitesState.value = hasSeed ? 'idle' : 'loading'
    const cleanup = subscribeContactInvites((snapshot) => {
      invites.value = snapshot.invites
      invitesError.value = snapshot.error
      invitesState.value = snapshot.status === 'error' ? 'error' : snapshot.status === 'connecting' ? 'loading' : 'idle'
      if (!initialTaskSettled.value && snapshot.status !== 'connecting') {
        void settleInitialTask()
      }
    })
    ctx.cleanup(cleanup)
  })

  useVisibleTask$((ctx) => {
    const open = ctx.track(() => popoverOpen.value)
    const popover = popoverRef.value

    if (open && !wasPopoverOpen.value) {
      setOverlaySurfaceState(popover, true)
      focusOverlayEntry(popover, searchInputRef.value)
    } else if (!open && wasPopoverOpen.value) {
      restoreOverlayFocusBeforeHide(popover, popoverTriggerRef.value)
      setOverlaySurfaceState(popover, false)
    } else {
      setOverlaySurfaceState(popover, open)
    }

    wasPopoverOpen.value = open
    if (!open) return

    const cleanup = bindOverlayDismiss({
      root: popoverRootRef.value,
      onDismiss: () => {
        popoverOpen.value = false
      }
    })

    ctx.cleanup(cleanup)
  })

  const incomingCount = invites.value.incoming.length
  const outgoingCount = invites.value.outgoing.length
  const contactsCount = invites.value.contacts.length
  const pendingCount = incomingCount + outgoingCount
  const popoverLabel =
    pendingCount > 0
      ? `${props.title ?? 'Contact invites'}, ${pendingCount} pending`
      : `Open ${props.title ?? 'contact invites'}`

  return (
    <div ref={rootRef} class={buildRootClass(props.class)}>
      <div class="chat-invites-header">
        <div>
          <div class="chat-invites-title">{props.title ?? 'Contact invites'}</div>
          {props.helper ? <p class="chat-invites-helper">{props.helper}</p> : null}
        </div>
        <div class="chat-invites-header-actions">
          {statusNote.value ? (
            <span class="chat-invites-status-note" data-tone={statusNote.value.tone}>
              {statusNote.value.message}
            </span>
          ) : null}
          <div ref={popoverRootRef} class="chat-invites-bell-wrap">
            <button
              ref={popoverTriggerRef}
              type="button"
              class="chat-invites-bell"
              data-open={popoverOpen.value ? 'true' : 'false'}
              data-alert={incomingCount > 0 ? 'true' : 'false'}
              onClick$={togglePopover}
              aria-haspopup="dialog"
              aria-expanded={popoverOpen.value ? 'true' : 'false'}
              aria-controls="chat-invites-popover"
              aria-label={popoverLabel}
            >
              <svg class="chat-invites-bell-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 5c-3 0-5.5 2.5-5.5 5.5v3.8l-1.6 2.7h14.2l-1.6-2.7v-3.8C17.5 7.5 15 5 12 5Z"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M9.5 18c.4 1.1 1.4 1.8 2.5 1.8s2.1-.7 2.5-1.8"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <div
              ref={popoverRef}
              class="chat-invites-popover"
              id="chat-invites-popover"
              role="dialog"
              aria-modal="false"
              aria-labelledby="chat-invites-popover-title"
              data-open={popoverOpen.value ? 'true' : 'false'}
              hidden={!popoverOpen.value}
              aria-hidden={popoverOpen.value ? 'false' : 'true'}
            >
              <div class="chat-invites-popover-header">
                <h3 class="chat-invites-popover-title" id="chat-invites-popover-title">
                  {props.title ?? 'Contact invites'}
                </h3>
                <span class="chat-invites-popover-count">{pendingCount}</span>
              </div>
              <div class="chat-invites-popover-body">
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
                            {result.status === 'accepted' ? (
                              <span class="chat-invites-pill accent">Contact</span>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
                <section class="chat-invites-results">
                  <div class="chat-invites-results-header">
                    <span>Invites</span>
                    {invitesState.value === 'error' && invitesError.value ? (
                      <span class="chat-invites-error">{invitesError.value}</span>
                    ) : null}
                  </div>
                  {invitesState.value === 'loading' ? (
                    <div class="chat-invites-empty">Loading invites...</div>
                  ) : (
                    <>
                      <div class="chat-invites-subsection">
                        <div class="chat-invites-subheader">
                          <span>{props.incomingLabel ?? 'Incoming'}</span>
                          <span class="chat-invites-subcount" data-alert={incomingCount > 0 ? 'true' : 'false'}>
                            {incomingCount}
                          </span>
                        </div>
                        <div class="chat-invites-list">
                          {invites.value.incoming.length === 0 ? (
                            <div class="chat-invites-empty">{props.emptyLabel ?? 'No invites yet.'}</div>
                          ) : (
                            invites.value.incoming.map((invite, index) => (
                              <div class="chat-invites-item" style={{ '--stagger-index': index }}>
                                <div class="chat-invites-item-heading">
                                  <div class="chat-invites-avatar">{resolveAvatarText(invite.user)}</div>
                                  <div>
                                    <div class="chat-invites-item-name">{resolveDisplayName(invite.user)}</div>
                                    <div class="chat-invites-item-meta">{resolveMetaLine(invite.user)}</div>
                                  </div>
                                </div>
                                <div class="chat-invites-actions">
                                  <button
                                    type="button"
                                    class="chat-invites-action success"
                                    onClick$={() => handleInviteAction(invite.id, 'accept')}
                                  >
                                    {props.acceptActionLabel ?? 'Accept'}
                                  </button>
                                  <button
                                    type="button"
                                    class="chat-invites-action ghost"
                                    onClick$={() => handleInviteAction(invite.id, 'decline')}
                                  >
                                    {props.declineActionLabel ?? 'Decline'}
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div class="chat-invites-subsection">
                        <div class="chat-invites-subheader">
                          <span>{props.outgoingLabel ?? 'Outgoing'}</span>
                          <span class="chat-invites-subcount">{outgoingCount}</span>
                        </div>
                        <div class="chat-invites-list">
                          {invites.value.outgoing.length === 0 ? (
                            <div class="chat-invites-empty">{props.emptyLabel ?? 'No invites yet.'}</div>
                          ) : (
                            invites.value.outgoing.map((invite, index) => (
                              <div class="chat-invites-item" style={{ '--stagger-index': index }}>
                                <div class="chat-invites-item-heading">
                                  <div class="chat-invites-avatar">{resolveAvatarText(invite.user)}</div>
                                  <div>
                                    <div class="chat-invites-item-name">{resolveDisplayName(invite.user)}</div>
                                    <div class="chat-invites-item-meta">{resolveMetaLine(invite.user)}</div>
                                  </div>
                                </div>
                                <div class="chat-invites-actions">
                                  <span class="chat-invites-pill">Pending</span>
                                  <button
                                    type="button"
                                    class="chat-invites-action ghost"
                                    onClick$={() => handleInviteAction(invite.id, 'remove')}
                                  >
                                    {props.removeActionLabel ?? 'Remove'}
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div class="chat-invites-subsection">
                        <div class="chat-invites-subheader">
                          <span>{props.contactsLabel ?? 'Contacts'}</span>
                          <span class="chat-invites-subcount">{contactsCount}</span>
                        </div>
                        <div class="chat-invites-list">
                          {invites.value.contacts.length === 0 ? (
                            <div class="chat-invites-empty">{props.emptyLabel ?? 'No invites yet.'}</div>
                          ) : (
                            invites.value.contacts.map((invite, index) => (
                              <div class="chat-invites-item" style={{ '--stagger-index': index }}>
                                <div class="chat-invites-item-heading">
                                  <div class="chat-invites-avatar">{resolveAvatarText(invite.user)}</div>
                                  <div>
                                    <div class="chat-invites-item-name">{resolveDisplayName(invite.user)}</div>
                                    <div class="chat-invites-item-meta">{resolveMetaLine(invite.user)}</div>
                                  </div>
                                </div>
                                <div class="chat-invites-actions">
                                  <span class="chat-invites-pill accent">Contact</span>
                                  <button
                                    type="button"
                                    class="chat-invites-action ghost"
                                    onClick$={() => handleInviteAction(invite.id, 'remove')}
                                  >
                                    {props.removeActionLabel ?? 'Remove'}
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
