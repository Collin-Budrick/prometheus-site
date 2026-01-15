import { $, component$, type PropFunction, type Signal } from '@builder.io/qwik'
import { InBellNotification } from '@qwikest/icons/iconoir'
import { formatDisplayName } from './utils'
import type { ContactInviteView } from './types'

type ContactInvitesHeaderProps = {
  copy: Record<string, string>
  title: string
  helper: string
  statusMessage: string | null
  statusTone: 'neutral' | 'success' | 'error'
  bellAlert: boolean
  bellOpen: boolean
  bellButtonRef: Signal<HTMLButtonElement | undefined>
  bellPopoverRef: Signal<HTMLDivElement | undefined>
  onToggleBell$: PropFunction<() => void>
  incoming: ContactInviteView[]
  outgoing: ContactInviteView[]
  incomingCount: number
  outgoingCount: number
  incomingAlert: boolean
  outgoingAlert: boolean
  resolvedIncomingLabel: string
  resolvedOutgoingLabel: string
  resolvedEmptyLabel: string
  resolvedAcceptAction: string
  resolvedDeclineAction: string
  resolvedRemoveAction: string
  busyKeys: string[]
  onAccept$: PropFunction<(inviteId: string, userId: string) => void | Promise<void>>
  onDecline$: PropFunction<(inviteId: string, userId: string) => void | Promise<void>>
  onRemove$: PropFunction<(inviteId: string, userId: string, email: string) => void | Promise<void>>
}

export const ContactInvitesHeader = component$<ContactInvitesHeaderProps>((props) => {
  const resolve = (value: string) => props.copy?.[value] ?? value
  const totalInvites = props.incomingCount + props.outgoingCount
  const resolveActionTarget = (event: Event, selector: string) => {
    const target = event.target as HTMLElement | null
    const current = event.currentTarget as HTMLElement | null
    return (target?.closest?.(selector) as HTMLElement | null) ?? current
  }
  const handleAcceptClick = $((event: Event) => {
    const target = resolveActionTarget(event, 'button[data-invite-id]')
    const inviteId = target?.dataset.inviteId
    const userId = target?.dataset.userId
    if (!inviteId || !userId) return
    void props.onAccept$(inviteId, userId)
  })
  const handleDeclineClick = $((event: Event) => {
    const target = resolveActionTarget(event, 'button[data-invite-id]')
    const inviteId = target?.dataset.inviteId
    const userId = target?.dataset.userId
    if (!inviteId || !userId) return
    void props.onDecline$(inviteId, userId)
  })
  const handleRemoveClick = $((event: Event) => {
    const target = resolveActionTarget(event, 'button[data-invite-id]')
    const inviteId = target?.dataset.inviteId
    const userId = target?.dataset.userId
    const email = target?.dataset.email
    if (!inviteId || !userId || !email) return
    void props.onRemove$(inviteId, userId, email)
  })

  return (
    <header class="chat-invites-header">
      <div>
        <p class="chat-invites-title">{props.title}</p>
        <p class="chat-invites-helper">{props.helper}</p>
      </div>
      <div class="chat-invites-header-actions">
        {props.statusMessage ? (
          <p class="chat-invites-status-note" data-tone={props.statusTone} aria-live="polite">
            {props.statusMessage}
          </p>
        ) : null}
        <div class="chat-invites-bell-wrap">
          <button
            type="button"
            class="chat-invites-bell"
            data-alert={props.bellAlert ? 'true' : 'false'}
            data-open={props.bellOpen ? 'true' : 'false'}
            aria-haspopup="dialog"
            aria-expanded={props.bellOpen}
            aria-controls="chat-invites-popover"
            aria-label={resolve('Invites')}
            onClick$={props.onToggleBell$}
            ref={props.bellButtonRef}
          >
            <InBellNotification class="chat-invites-bell-icon" />
          </button>
          <div
            id="chat-invites-popover"
            class="chat-invites-popover"
            data-open={props.bellOpen ? 'true' : 'false'}
            role="dialog"
            aria-label={resolve('Invites')}
            aria-hidden={!props.bellOpen}
            ref={props.bellPopoverRef}
          >
            <div class="chat-invites-popover-header">
              <span>{resolve('Invites')}</span>
              <span class="chat-invites-popover-count">{totalInvites}</span>
            </div>
            <div class="chat-invites-popover-body">
              <section class="chat-invites-subsection">
                <header class="chat-invites-subheader">
                  <span>{props.resolvedIncomingLabel}</span>
                  <span class="chat-invites-subcount" data-alert={props.incomingAlert ? 'true' : 'false'}>
                    {props.incomingCount}
                  </span>
                </header>
                {props.incoming.length === 0 ? (
                  <p class="chat-invites-empty">{props.resolvedEmptyLabel}</p>
                ) : (
                  <div class="chat-invites-list">
                    {props.incoming.map((invite, index) => (
                      <article key={invite.id} class="chat-invites-item" style={`--stagger-index:${index};`}>
                        <div>
                          <p class="chat-invites-item-name">{formatDisplayName(invite.user)}</p>
                          <p class="chat-invites-item-meta">{invite.user.email}</p>
                        </div>
                        <div class="chat-invites-actions">
                          <button
                            type="button"
                            class="chat-invites-action success"
                            disabled={props.busyKeys.includes(`accept:${invite.id}`)}
                            data-invite-id={invite.id}
                            data-user-id={invite.user.id}
                            onClick$={handleAcceptClick}
                          >
                            {props.resolvedAcceptAction}
                          </button>
                          <button
                            type="button"
                            class="chat-invites-action ghost"
                            disabled={props.busyKeys.includes(`decline:${invite.id}`)}
                            data-invite-id={invite.id}
                            data-user-id={invite.user.id}
                            onClick$={handleDeclineClick}
                          >
                            {props.resolvedDeclineAction}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section class="chat-invites-subsection">
                <header class="chat-invites-subheader">
                  <span>{props.resolvedOutgoingLabel}</span>
                  <span class="chat-invites-subcount" data-alert={props.outgoingAlert ? 'true' : 'false'}>
                    {props.outgoingCount}
                  </span>
                </header>
                {props.outgoing.length === 0 ? (
                  <p class="chat-invites-empty">{props.resolvedEmptyLabel}</p>
                ) : (
                  <div class="chat-invites-list">
                    {props.outgoing.map((invite, index) => (
                      <article key={invite.id} class="chat-invites-item" style={`--stagger-index:${index};`}>
                        <div>
                          <p class="chat-invites-item-name">{formatDisplayName(invite.user)}</p>
                          <p class="chat-invites-item-meta">{invite.user.email}</p>
                        </div>
                        <div class="chat-invites-actions">
                          <span class="chat-invites-pill">{resolve('Pending')}</span>
                          <button
                            type="button"
                            class="chat-invites-action ghost"
                            disabled={props.busyKeys.includes(`remove:${invite.id}`)}
                            data-invite-id={invite.id}
                            data-user-id={invite.user.id}
                            data-email={invite.user.email}
                            onClick$={handleRemoveClick}
                          >
                            {props.resolvedRemoveAction}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
})
