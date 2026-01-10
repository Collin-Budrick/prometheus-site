import { $, component$, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { appConfig } from '../app-config'
import { getLanguagePack } from '../lang'
import { useSharedLangSignal } from '../shared/lang-bridge'

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

type ContactInviteView = {
  id: string
  status: string
  user: {
    id: string
    name?: string | null
    email: string
  }
}

type ContactInvitesPayload = {
  incoming?: ContactInviteView[]
  outgoing?: ContactInviteView[]
  contacts?: ContactInviteView[]
}

type ContactSearchResult = {
  id: string
  name?: string | null
  email: string
  status?: 'none' | 'incoming' | 'outgoing' | 'accepted'
  inviteId?: string
}

type ContactSearchPayload = {
  results?: ContactSearchResult[]
}

const buildApiUrl = (path: string, origin: string) => {
  const base = appConfig.apiBase
  if (!base) return `${origin}${path}`
  if (base.startsWith('/')) return `${origin}${base}${path}`
  return `${base}${path}`
}

const normalizeLabel = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

const formatDisplayName = (entry: { name?: string | null; email: string }) => {
  const trimmed = entry.name?.trim() ?? ''
  return trimmed === '' ? entry.email : trimmed
}

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
    const statusMessage = useSignal<string | null>(null)
    const statusTone = useSignal<'neutral' | 'success' | 'error'>('neutral')
    const busyKeys = useSignal<string[]>([])

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

    const refreshInvites = $(async (resetStatus = true) => {
      if (typeof window === 'undefined') return
      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      invitesState.value = 'loading'
      if (resetStatus) {
        statusMessage.value = null
        statusTone.value = 'neutral'
      }
      searchError.value = null

      try {
        const response = await fetch(buildApiUrl('/chat/contacts/invites', window.location.origin), {
          credentials: 'include'
        })

        if (!response.ok) {
          invitesState.value = 'error'
          statusTone.value = 'error'
          statusMessage.value = resolveLocal('Unable to load invites.')
          return
        }

        const payload = (await response.json()) as ContactInvitesPayload
        incoming.value = Array.isArray(payload.incoming) ? payload.incoming : []
        outgoing.value = Array.isArray(payload.outgoing) ? payload.outgoing : []
        contacts.value = Array.isArray(payload.contacts) ? payload.contacts : []
        invitesState.value = 'idle'
      } catch (error) {
        invitesState.value = 'error'
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Unable to load invites.')
      }
    })

    const handleSearchInput = $((event: Event) => {
      const value = (event.target as HTMLInputElement).value
      searchQuery.value = value
      if (value.trim() === '') {
        searchResults.value = []
        searchState.value = 'idle'
        searchError.value = null
      }
    })

    const handleSearchSubmit = $(async () => {
      if (typeof window === 'undefined') return
      const trimmed = searchQuery.value.trim()
      if (!trimmed) {
        searchResults.value = []
        searchState.value = 'idle'
        searchError.value = null
        return
      }

      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      searchState.value = 'loading'
      searchError.value = null

      try {
        const response = await fetch(
          buildApiUrl(`/chat/contacts/search?email=${encodeURIComponent(trimmed)}`, window.location.origin),
          { credentials: 'include' }
        )

        if (!response.ok) {
          let errorMessage = resolveLocal('Unable to search.')
          try {
            const payload = (await response.json()) as { error?: string }
            if (payload?.error) errorMessage = payload.error
          } catch {
            // ignore parsing failures
          }
          searchState.value = 'error'
          searchError.value = errorMessage
          return
        }

        const payload = (await response.json()) as ContactSearchPayload
        searchResults.value = Array.isArray(payload.results) ? payload.results : []
        searchState.value = 'idle'
      } catch (error) {
        searchState.value = 'error'
        searchError.value = error instanceof Error ? error.message : resolveLocal('Unable to search.')
      }
    })

    const handleInvite = $(async (email: string, userId?: string) => {
      if (typeof window === 'undefined') return
      const key = `invite:${email}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      try {
        const response = await fetch(buildApiUrl('/chat/contacts/invites', window.location.origin), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email })
        })

        if (!response.ok) {
          let errorMessage = resolveLocal('Invite unavailable.')
          try {
            const payload = (await response.json()) as { error?: string }
            if (payload?.error) errorMessage = payload.error
          } catch {
            // ignore parsing failures
          }
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        const payload = (await response.json()) as { id?: string; status?: string }
        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite sent.')
        if (userId) {
          searchResults.value = searchResults.value.map((entry) =>
            entry.id === userId
              ? { ...entry, status: 'outgoing', inviteId: payload.id ?? entry.inviteId }
              : entry
          )
        }
        await refreshInvites(false)
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    const handleAccept = $(async (inviteId: string, userId: string) => {
      if (typeof window === 'undefined') return
      const key = `accept:${inviteId}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      try {
        const response = await fetch(
          buildApiUrl(`/chat/contacts/invites/${encodeURIComponent(inviteId)}/accept`, window.location.origin),
          { method: 'POST', credentials: 'include' }
        )

        if (!response.ok) {
          let errorMessage = resolveLocal('Invite unavailable.')
          try {
            const payload = (await response.json()) as { error?: string }
            if (payload?.error) errorMessage = payload.error
          } catch {
            // ignore parsing failures
          }
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite accepted.')
        searchResults.value = searchResults.value.map((entry) =>
          entry.id === userId ? { ...entry, status: 'accepted', inviteId } : entry
        )
        await refreshInvites(false)
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    const handleDecline = $(async (inviteId: string, userId: string) => {
      if (typeof window === 'undefined') return
      const key = `decline:${inviteId}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      try {
        const response = await fetch(
          buildApiUrl(`/chat/contacts/invites/${encodeURIComponent(inviteId)}/decline`, window.location.origin),
          { method: 'POST', credentials: 'include' }
        )

        if (!response.ok) {
          let errorMessage = resolveLocal('Invite unavailable.')
          try {
            const payload = (await response.json()) as { error?: string }
            if (payload?.error) errorMessage = payload.error
          } catch {
            // ignore parsing failures
          }
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite declined.')
        searchResults.value = searchResults.value.map((entry) =>
          entry.id === userId ? { ...entry, status: 'none', inviteId: undefined } : entry
        )
        await refreshInvites(false)
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    const handleRemove = $(async (inviteId: string, userId: string, email: string) => {
      if (typeof window === 'undefined') return
      const key = `remove:${inviteId}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      try {
        const response = await fetch(
          buildApiUrl(`/chat/contacts/invites/${encodeURIComponent(inviteId)}`, window.location.origin),
          { method: 'DELETE', credentials: 'include' }
        )

        if (!response.ok) {
          let errorMessage = resolveLocal('Invite unavailable.')
          try {
            const payload = (await response.json()) as { error?: string }
            if (payload?.error) errorMessage = payload.error
          } catch {
            // ignore parsing failures
          }
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite removed.')
        searchResults.value = searchResults.value.map((entry) =>
          entry.id === userId ? { ...entry, status: 'none', inviteId: undefined } : entry
        )
        if (!userId) {
          searchResults.value = searchResults.value.map((entry) =>
            entry.email === email ? { ...entry, status: 'none', inviteId: undefined } : entry
          )
        }
        await refreshInvites(false)
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        void refreshInvites()
        ctx.cleanup(() => {
          invitesState.value = 'idle'
        })
      },
      { strategy: 'document-ready' }
    )

    return (
      <section class={rootClass} data-state={invitesState.value}>
        <header class="chat-invites-header">
          <div>
            <p class="chat-invites-title">{resolvedTitle}</p>
            <p class="chat-invites-helper">{resolvedHelper}</p>
          </div>
          <div class="chat-invites-status" data-tone={statusTone.value} aria-live="polite">
            {statusMessage.value ?? resolve('Ready')}
          </div>
        </header>

        <form class="chat-invites-search" preventdefault:submit onSubmit$={handleSearchSubmit}>
          <label class="chat-invites-field">
            <span>{resolvedSearchLabel}</span>
            <input
              type="text"
              inputMode="email"
              placeholder={resolvedSearchPlaceholder}
              value={searchQuery.value}
              onInput$={handleSearchInput}
              aria-label={resolvedSearchLabel}
            />
          </label>
          <button class="chat-invites-button" type="submit" disabled={searchState.value === 'loading'}>
            {searchState.value === 'loading' ? resolve('Searching...') : resolvedSearchAction}
          </button>
        </form>

        <div class="chat-invites-results" data-state={searchState.value}>
          <div class="chat-invites-results-header">
            <span>{resolve('Search results')}</span>
            {searchError.value ? <span class="chat-invites-error">{searchError.value}</span> : null}
          </div>
          {searchState.value === 'loading' && searchResults.value.length === 0 ? (
            <p class="chat-invites-empty">{resolve('Searching...')}</p>
          ) : null}
          {searchState.value !== 'loading' && searchResults.value.length === 0 && searchQuery.value.trim() ? (
            <p class="chat-invites-empty">{resolve('No matches yet.')}</p>
          ) : null}
          <div class="chat-invites-list">
            {searchResults.value.map((result, index) => {
              const displayName = formatDisplayName(result)
              const isPending = result.status === 'outgoing'
              const isIncoming = result.status === 'incoming'
              const isAccepted = result.status === 'accepted'

              return (
                <article
                  key={`${result.id}-${result.email}`}
                  class="chat-invites-item"
                  style={`--stagger-index:${index};`}
                >
                  <div>
                    <p class="chat-invites-item-name">{displayName}</p>
                    <p class="chat-invites-item-meta">{result.email}</p>
                  </div>
                  <div class="chat-invites-actions">
                    {isAccepted ? <span class="chat-invites-pill">{resolve('Connected')}</span> : null}
                    {isPending ? <span class="chat-invites-pill">{resolve('Pending')}</span> : null}
                    {isIncoming ? <span class="chat-invites-pill accent">{resolve('Incoming')}</span> : null}
                    {result.status === 'none' || result.status === undefined ? (
                      <button
                        type="button"
                        class="chat-invites-action"
                        disabled={busyKeys.value.includes(`invite:${result.email}`)}
                        onClick$={() => handleInvite(result.email, result.id)}
                      >
                        {resolvedInviteAction}
                      </button>
                    ) : null}
                    {isIncoming && result.inviteId ? (
                      <button
                        type="button"
                        class="chat-invites-action success"
                        disabled={busyKeys.value.includes(`accept:${result.inviteId}`)}
                        onClick$={() => handleAccept(result.inviteId!, result.id)}
                      >
                        {resolvedAcceptAction}
                      </button>
                    ) : null}
                    {isIncoming && result.inviteId ? (
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`decline:${result.inviteId}`)}
                        onClick$={() => handleDecline(result.inviteId!, result.id)}
                      >
                        {resolvedDeclineAction}
                      </button>
                    ) : null}
                    {(isPending || isAccepted) && result.inviteId ? (
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`remove:${result.inviteId}`)}
                        onClick$={() => handleRemove(result.inviteId!, result.id, result.email)}
                      >
                        {resolvedRemoveAction}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <div class="chat-invites-grid">
          <section class="chat-invites-panel">
            <header class="chat-invites-panel-header">
              <span>{resolvedIncomingLabel}</span>
              <span class="chat-invites-count">{incoming.value.length}</span>
            </header>
            {incoming.value.length === 0 ? (
              <p class="chat-invites-empty">{resolvedEmptyLabel}</p>
            ) : (
              <div class="chat-invites-list">
                {incoming.value.map((invite, index) => (
                  <article
                    key={invite.id}
                    class="chat-invites-item"
                    style={`--stagger-index:${index};`}
                  >
                    <div>
                      <p class="chat-invites-item-name">{formatDisplayName(invite.user)}</p>
                      <p class="chat-invites-item-meta">{invite.user.email}</p>
                    </div>
                    <div class="chat-invites-actions">
                      <button
                        type="button"
                        class="chat-invites-action success"
                        disabled={busyKeys.value.includes(`accept:${invite.id}`)}
                        onClick$={() => handleAccept(invite.id, invite.user.id)}
                      >
                        {resolvedAcceptAction}
                      </button>
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`decline:${invite.id}`)}
                        onClick$={() => handleDecline(invite.id, invite.user.id)}
                      >
                        {resolvedDeclineAction}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section class="chat-invites-panel">
            <header class="chat-invites-panel-header">
              <span>{resolvedOutgoingLabel}</span>
              <span class="chat-invites-count">{outgoing.value.length}</span>
            </header>
            {outgoing.value.length === 0 ? (
              <p class="chat-invites-empty">{resolvedEmptyLabel}</p>
            ) : (
              <div class="chat-invites-list">
                {outgoing.value.map((invite, index) => (
                  <article
                    key={invite.id}
                    class="chat-invites-item"
                    style={`--stagger-index:${index};`}
                  >
                    <div>
                      <p class="chat-invites-item-name">{formatDisplayName(invite.user)}</p>
                      <p class="chat-invites-item-meta">{invite.user.email}</p>
                    </div>
                    <div class="chat-invites-actions">
                      <span class="chat-invites-pill">{resolve('Pending')}</span>
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`remove:${invite.id}`)}
                        onClick$={() => handleRemove(invite.id, invite.user.id, invite.user.email)}
                      >
                        {resolvedRemoveAction}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section class="chat-invites-panel">
            <header class="chat-invites-panel-header">
              <span>{resolvedContactsLabel}</span>
              <span class="chat-invites-count">{contacts.value.length}</span>
            </header>
            {contacts.value.length === 0 ? (
              <p class="chat-invites-empty">{resolve('No contacts yet.')}</p>
            ) : (
              <div class="chat-invites-list">
                {contacts.value.map((invite, index) => (
                  <article
                    key={invite.id}
                    class="chat-invites-item"
                    style={`--stagger-index:${index};`}
                  >
                    <div>
                      <p class="chat-invites-item-name">{formatDisplayName(invite.user)}</p>
                      <p class="chat-invites-item-meta">{invite.user.email}</p>
                    </div>
                    <div class="chat-invites-actions">
                      <span class="chat-invites-pill">{resolve('Connected')}</span>
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`remove:${invite.id}`)}
                        onClick$={() => handleRemove(invite.id, invite.user.id, invite.user.email)}
                      >
                        {resolvedRemoveAction}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    )
  }
)
