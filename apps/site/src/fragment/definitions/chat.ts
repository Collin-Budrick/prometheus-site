import { buildFragmentPlan } from '@core/fragment/planner'
import { registerFragmentDefinitions, registerFragmentPlanOverride } from '@core/fragment/registry'
import { h } from '@core/fragment/tree'
import type { FragmentDefinition, FragmentPlanEntry } from '@core/fragment/types'

const baseMeta = {
  ttl: 30,
  staleTtl: 120,
  runtime: 'edge' as const
}

const chatInvitesCss = `
.chat-invites {
  display: grid;
  gap: 18px;
}

.chat-invites-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chat-invites-title {
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.35em;
  color: rgb(var(--muted));
}

.chat-invites-helper {
  margin-top: 10px;
  max-width: 540px;
  color: rgb(var(--muted));
  font-size: 0.98rem;
  line-height: 1.5;
}

.chat-invites-header-actions {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.chat-invites-status-note {
  font-size: 0.78rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgb(var(--muted));
  text-align: right;
  max-width: 240px;
}

.chat-invites-status-note[data-tone='success'] {
  color: rgb(var(--signal));
}

.chat-invites-status-note[data-tone='error'] {
  color: rgb(var(--accent));
}

.chat-invites-bell-wrap {
  position: relative;
  display: inline-flex;
}

.chat-invites-bell {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background:
    radial-gradient(circle at 30% 20%, rgb(var(--accent) / 0.12), transparent 60%),
    rgb(var(--surface));
  color: rgb(var(--muted));
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease, color 200ms ease;
}

.chat-invites-bell::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(239 68 68);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 200ms ease, transform 200ms ease;
}

.chat-invites-bell:hover {
  border-color: rgb(var(--stroke-strong));
  transform: translateY(-1px);
}

.chat-invites-bell:focus-visible {
  outline: 2px solid rgb(var(--accent));
  outline-offset: 3px;
}

.chat-invites-bell[data-open='true'] {
  border-color: rgb(var(--accent) / 0.6);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.2);
}

.chat-invites-bell[data-alert='true'] {
  border-color: rgba(239, 68, 68, 0.6);
  color: rgb(239 68 68);
  box-shadow: 0 0 18px rgba(239, 68, 68, 0.35);
}

.chat-invites-bell[data-alert='true']::after {
  opacity: 1;
  transform: scale(1);
}

.chat-invites-bell-icon {
  width: 20px;
  height: 20px;
}

.chat-invites-bell[data-alert='true'] .chat-invites-bell-icon {
  fill: currentColor;
  stroke: currentColor;
  stroke-width: 1.6;
  filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.45));
}

.chat-invites-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 12px);
  min-width: min(360px, 92vw);
  max-width: 420px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgb(var(--stroke));
  background:
    radial-gradient(circle at 80% 0%, rgb(var(--signal) / 0.12), transparent 60%),
    rgb(var(--surface));
  box-shadow: 0 24px 40px rgba(15, 23, 42, 0.25);
  display: grid;
  gap: 12px;
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
  z-index: 20;
}

.chat-invites-popover[data-open='true'] {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.chat-invites-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgb(var(--muted));
}

.chat-invites-popover-count {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  font-size: 10px;
  color: rgb(var(--muted));
}

.chat-invites-popover-body {
  display: grid;
  gap: 16px;
  max-height: 380px;
  overflow: auto;
  padding-right: 2px;
}

.chat-invites-search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.chat-invites-field {
  flex: 1;
  min-width: 240px;
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid rgb(var(--stroke));
  background:
    linear-gradient(135deg, rgb(var(--surface) / 0.92), rgb(var(--surface-soft) / 0.95)),
    rgb(var(--surface));
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12);
  transition: border-color 220ms ease, box-shadow 220ms ease;
}

.chat-invites-field span {
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.24em;
  color: rgb(var(--muted));
}

.chat-invites-field input {
  border: none;
  background: transparent;
  outline: none;
  color: rgb(var(--ink));
  font-size: 0.98rem;
}

.chat-invites-field:focus-within {
  border-color: rgb(var(--accent));
  box-shadow: 0 20px 34px rgba(15, 23, 42, 0.2);
}

.chat-invites-button {
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke-strong));
  padding: 10px 18px;
  background:
    linear-gradient(120deg, rgb(var(--accent) / 0.1), rgb(var(--signal) / 0.18)),
    rgb(var(--surface));
  color: rgb(var(--ink));
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.28em;
  cursor: pointer;
  transition: border-color 200ms ease, transform 200ms ease;
}

.chat-invites-button:hover {
  border-color: rgb(var(--accent));
  transform: translateY(-1px);
}

.chat-invites-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.chat-invites-results {
  border-radius: 18px;
  border: 1px solid rgb(var(--stroke));
  padding: 16px;
  background:
    radial-gradient(circle at 80% 0%, rgb(var(--signal) / 0.12), transparent 60%),
    rgb(var(--surface));
  display: grid;
  gap: 12px;
}

.chat-invites-results-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgb(var(--muted));
}

.chat-invites-error {
  color: rgb(var(--accent));
  letter-spacing: 0.12em;
}

.chat-invites-subsection {
  display: grid;
  gap: 12px;
}

.chat-invites-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgb(var(--muted));
}

.chat-invites-subcount {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  font-size: 10px;
  color: rgb(var(--muted));
}

.chat-invites-subcount[data-alert='true'] {
  border-color: rgba(239, 68, 68, 0.6);
  color: rgb(239 68 68);
  background: rgba(239, 68, 68, 0.12);
  box-shadow:
    0 0 12px rgba(239, 68, 68, 0.35),
    0 0 0 1px rgba(239, 68, 68, 0.25);
}

.chat-invites-list {
  display: grid;
  gap: 10px;
}

.chat-invites-item {
  --stagger-index: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgb(var(--stroke));
  background:
    linear-gradient(160deg, rgb(var(--surface-soft) / 0.9), rgb(var(--surface) / 0.95)),
    rgb(var(--surface));
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14);
  opacity: 0;
  transform: translateY(8px);
  animation: chat-invite-in 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: calc(var(--stagger-index) * 60ms);
}

.chat-invites-item-name {
  font-weight: 600;
  color: rgb(var(--ink));
}

.chat-invites-item-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-invites-item-meta {
  font-size: 0.85rem;
  color: rgb(var(--muted));
}

.chat-invites-presence {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(var(--signal));
  box-shadow: 0 0 12px rgb(var(--signal) / 0.35);
  opacity: 0;
  transition: opacity 200ms ease;
}

.chat-invites-presence[data-online='true'] {
  opacity: 1;
}

.chat-invites-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.chat-invites-action {
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  color: rgb(var(--ink));
  padding: 6px 14px;
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: border-color 200ms ease, transform 200ms ease, opacity 200ms ease;
}

.chat-invites-action:hover {
  border-color: rgb(var(--stroke-strong));
  transform: translateY(-1px);
}

.chat-invites-action.ghost {
  background: transparent;
  color: rgb(var(--muted));
}

.chat-invites-action.success {
  border-color: rgb(var(--signal) / 0.5);
  color: rgb(var(--signal));
}

.chat-invites-action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.chat-invites-pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgb(var(--muted));
}

.chat-invites-pill.accent {
  border-color: rgb(var(--accent) / 0.55);
  color: rgb(var(--accent));
}

.chat-invites-empty {
  font-size: 0.9rem;
  color: rgb(var(--muted));
}

@keyframes chat-invite-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-invites-item {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .chat-invites-button,
  .chat-invites-action,
  .chat-invites-bell::after,
  .chat-invites-bell,
  .chat-invites-popover,
  .chat-invites-presence,
  .chat-invites-popover-count,
  .chat-invites-subcount {
    transition: none;
  }
}

@media (max-width: 720px) {
  .chat-invites-popover {
    min-width: min(320px, 92vw);
  }

  .chat-invites-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .chat-invites-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
`

const contactInvites: FragmentDefinition = {
  id: 'fragment://page/chat/contacts@v1',
  tags: ['chat', 'contacts', 'invites'],
  head: [],
  css: chatInvitesCss,
  ...baseMeta,
  render: ({ t }) =>
    h('contact-invites', {
      class: 'chat-invites',
      'data-title': t('Contact invites'),
      'data-helper': t('Search by email to connect.'),
      'data-search-label': t('Search by email'),
      'data-search-placeholder': t('name@domain.com'),
      'data-search-action': t('Search'),
      'data-invite-action': t('Invite'),
      'data-accept-action': t('Accept'),
      'data-decline-action': t('Decline'),
      'data-remove-action': t('Remove'),
      'data-incoming-label': t('Incoming'),
      'data-outgoing-label': t('Outgoing'),
      'data-contacts-label': t('Contacts'),
      'data-empty-label': t('No invites yet.')
    })
}

export const chatFragments: FragmentPlanEntry[] = [
  {
    id: contactInvites.id,
    critical: true,
    layout: { column: 'span 12' }
  }
]

registerFragmentDefinitions([contactInvites])

registerFragmentPlanOverride((plan) => {
  if (plan.path !== '/chat') return plan
  return buildFragmentPlan(plan.path, chatFragments, [])
})
