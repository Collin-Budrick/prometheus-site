import { component$, type PropFunction, type Signal } from '@builder.io/qwik'
import { InSettings } from '@qwikest/icons/iconoir'
import type { ChatSettings } from '../../shared/chat-settings'
import { formatDisplayName, formatMessageTime } from './utils'
import type { ActiveContact, DmConnectionState, DmMessage, DmOrigin } from './types'

type ContactInvitesDmProps = {
  copy: Record<string, string>
  activeContact: ActiveContact
  dmClosing: boolean
  dmAnimated: boolean
  dmOrigin: DmOrigin | null
  dmStatus: DmConnectionState
  remoteTyping: boolean
  chatSettings: ChatSettings
  chatSettingsOpen: boolean
  chatSettingsButtonRef: Signal<HTMLButtonElement | undefined>
  chatSettingsPopoverRef: Signal<HTMLDivElement | undefined>
  onClose$: PropFunction<() => void>
  onToggleSettings$: PropFunction<() => void>
  onToggleReadReceipts$: PropFunction<() => void>
  onToggleTypingIndicators$: PropFunction<() => void>
  onArchiveMessages$: PropFunction<() => void>
  dmMessages: DmMessage[]
  dmError: string | null
  dmInput: string
  onDmInput$: PropFunction<(event: Event) => void>
  onDmKeyDown$: PropFunction<(event: KeyboardEvent) => void>
  onDmSubmit$: PropFunction<() => void>
}

export const ContactInvitesDm = component$<ContactInvitesDmProps>((props) => {
  const resolve = (value: string) => props.copy?.[value] ?? value
  const statusLabel =
    props.dmStatus === 'connected'
      ? resolve('Connected')
      : props.dmStatus === 'connecting'
        ? resolve('Connecting')
        : props.dmStatus === 'offline'
          ? resolve('Offline')
          : resolve('Unavailable')
  const statusTone = props.dmStatus === 'error' ? 'error' : props.dmStatus === 'offline' ? 'muted' : 'neutral'
  const resolveMessageStatus = (status: DmMessage['status']) => {
    if (status === 'pending') return resolve('Sending')
    if (status === 'queued') return resolve('Queued')
    if (status === 'failed') return resolve('Failed')
    if (status === 'read') return resolve('Read')
    return resolve('Sent')
  }

  return (
    <div
      class="chat-invites-dm"
      role="dialog"
      aria-modal="true"
      aria-label={resolve('Direct message')}
      data-closing={props.dmClosing ? 'true' : 'false'}
      data-animate={props.dmAnimated ? 'true' : 'false'}
      style={
        props.dmOrigin
          ? {
              '--dm-origin-x': `${props.dmOrigin.x}px`,
              '--dm-origin-y': `${props.dmOrigin.y}px`,
              '--dm-origin-scale-x': `${props.dmOrigin.scaleX}`,
              '--dm-origin-scale-y': `${props.dmOrigin.scaleY}`,
              '--dm-origin-radius': `${props.dmOrigin.radius}px`
            }
          : undefined
      }
    >
      <div class="chat-invites-dm-card">
        <header class="chat-invites-dm-header">
          <button type="button" class="chat-invites-dm-close" onClick$={props.onClose$}>
            {resolve('Back')}
          </button>
          <div class="chat-invites-dm-header-main">
            <div class="chat-invites-dm-contact">
              <div class="chat-invites-item-heading">
                <span
                  class="chat-invites-presence"
                  data-online={props.activeContact.online ? 'true' : 'false'}
                  aria-hidden="true"
                />
                <p class="chat-invites-dm-title">{formatDisplayName(props.activeContact)}</p>
              </div>
              <p class="chat-invites-dm-meta">{props.activeContact.email}</p>
            </div>
            <div class="chat-invites-dm-controls">
              <button
                type="button"
                class="chat-invites-dm-gear"
                data-open={props.chatSettingsOpen ? 'true' : 'false'}
                aria-haspopup="dialog"
                aria-expanded={props.chatSettingsOpen}
                aria-controls="chat-invites-dm-settings"
                aria-label={resolve('Chat settings')}
                onClick$={props.onToggleSettings$}
                ref={props.chatSettingsButtonRef}
              >
                <InSettings class="chat-invites-dm-gear-icon" />
              </button>
              <div
                id="chat-invites-dm-settings"
                class="chat-invites-dm-settings"
                data-open={props.chatSettingsOpen ? 'true' : 'false'}
                role="dialog"
                aria-label={resolve('Chat settings')}
                aria-hidden={!props.chatSettingsOpen}
                ref={props.chatSettingsPopoverRef}
              >
                <div class="chat-invites-dm-settings-header">{resolve('Chat settings')}</div>
                <div class="chat-invites-dm-setting">
                  <div class="chat-invites-dm-setting-label">
                    <span class="chat-invites-dm-setting-title">{resolve('Read receipts')}</span>
                  </div>
                  <button
                    type="button"
                    class="chat-settings-toggle"
                    data-active={props.chatSettings.readReceipts ? 'true' : 'false'}
                    role="switch"
                    aria-checked={props.chatSettings.readReceipts}
                    onClick$={props.onToggleReadReceipts$}
                  >
                    <span class="chat-settings-toggle-track">
                      <span class="chat-settings-toggle-knob" />
                    </span>
                  </button>
                </div>
                <div class="chat-invites-dm-setting">
                  <div class="chat-invites-dm-setting-label">
                    <span class="chat-invites-dm-setting-title">{resolve('Typing indicators')}</span>
                  </div>
                  <button
                    type="button"
                    class="chat-settings-toggle"
                    data-active={props.chatSettings.typingIndicators ? 'true' : 'false'}
                    role="switch"
                    aria-checked={props.chatSettings.typingIndicators}
                    onClick$={props.onToggleTypingIndicators$}
                  >
                    <span class="chat-settings-toggle-track">
                      <span class="chat-settings-toggle-knob" />
                    </span>
                  </button>
                </div>
                <button type="button" class="chat-invites-dm-archive" onClick$={props.onArchiveMessages$}>
                  {resolve('Archive messages')}
                </button>
              </div>
            </div>
          </div>
        </header>
        <div class="chat-invites-dm-body">
          <div class="chat-invites-dm-status" data-tone={statusTone}>
            <span>{statusLabel}</span>
            {props.remoteTyping && props.chatSettings.typingIndicators ? (
              <span class="chat-invites-dm-typing">
                {resolve('Typing…')}
                <span class="chat-invites-dm-typing-dots" aria-hidden="true">
                  <span class="chat-invites-dm-typing-dot" />
                  <span class="chat-invites-dm-typing-dot" />
                  <span class="chat-invites-dm-typing-dot" />
                </span>
              </span>
            ) : null}
            {props.dmError ? <span class="chat-invites-dm-error">{props.dmError}</span> : null}
          </div>
          <div class="chat-invites-dm-messages" role="log" aria-live="polite">
            {props.dmMessages.length === 0 ? (
              <p class="chat-invites-dm-placeholder">{resolve('No messages yet.')}</p>
            ) : (
              props.dmMessages.map((message) => (
                <article
                  key={message.id}
                  class="chat-invites-dm-message"
                  data-author={message.author}
                  data-status={message.status ?? 'sent'}
                >
                  <p class="chat-invites-dm-text">{message.text}</p>
                  <div class="chat-invites-dm-meta">
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                    {message.author === 'self' && message.status ? (
                      <span class="chat-invites-dm-state">{resolveMessageStatus(message.status)}</span>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
          <form class="chat-invites-dm-compose" preventdefault:submit onSubmit$={props.onDmSubmit$}>
            <input
              type="text"
              class="chat-invites-dm-input"
              placeholder={resolve('Message')}
              value={props.dmInput}
              onInput$={props.onDmInput$}
              onKeyDown$={props.onDmKeyDown$}
              aria-label={resolve('Message')}
            />
            <button class="chat-invites-dm-send" type="submit" disabled={!props.dmInput.trim()}>
              {resolve('Send')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
})
