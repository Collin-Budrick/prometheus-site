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

.chat-invites-item[data-interactive='true'] {
  cursor: pointer;
  transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
}

.chat-invites-item[data-interactive='true']:hover {
  border-color: rgb(var(--stroke-strong));
  transform: translateY(-1px);
  box-shadow: 0 18px 28px rgba(15, 23, 42, 0.2);
}

.chat-invites-item[data-interactive='true'][data-active='true'] {
  border-color: rgb(var(--accent) / 0.45);
  box-shadow:
    0 0 0 1px rgb(var(--accent) / 0.2),
    0 14px 24px rgba(15, 23, 42, 0.22);
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

.chat-invites-dm {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  --dm-origin-x: 0px;
  --dm-origin-y: 0px;
  --dm-origin-scale-x: 1;
  --dm-origin-scale-y: 1;
  --dm-origin-radius: 16px;
  background: rgba(6, 8, 18, 0.92);
  display: block;
  overflow: hidden;
  z-index: 80;
  opacity: 0;
  transition: opacity 220ms ease;
}

.chat-invites-dm[data-animate='true'] {
  opacity: 1;
}

.chat-invites-dm-card {
  width: 100%;
  height: 100%;
  border-radius: 0;
  border: 1px solid rgb(var(--stroke));
  background:
    radial-gradient(circle at 20% 0%, rgb(var(--accent) / 0.18), transparent 55%),
    rgb(var(--surface));
  box-shadow: 0 30px 50px rgba(2, 6, 23, 0.45);
  padding: 28px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 20px;
  transform-origin: 0 0;
  transform: translate(var(--dm-origin-x), var(--dm-origin-y))
    scale(var(--dm-origin-scale-x), var(--dm-origin-scale-y));
  border-radius: var(--dm-origin-radius);
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 260ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform, border-radius;
}

html[data-chat-dm-open='true'] .fragment-card {
  transform: none !important;
  will-change: auto;
  overflow: visible;
  backdrop-filter: none;
}

.chat-invites-dm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chat-invites-dm-header-main {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chat-invites-dm-contact {
  display: grid;
  gap: 4px;
}

.chat-invites-dm-controls {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 10px;
}

.chat-invites-dm-gear {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background:
    radial-gradient(circle at 30% 20%, rgb(var(--signal) / 0.14), transparent 60%),
    rgb(var(--surface));
  color: rgb(var(--muted));
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease, color 180ms ease;
}

.chat-invites-dm-gear:hover {
  border-color: rgb(var(--stroke-strong));
  transform: translateY(-1px);
}

.chat-invites-dm-gear:focus-visible {
  outline: 2px solid rgb(var(--signal));
  outline-offset: 3px;
}

.chat-invites-dm-gear[data-open='true'] {
  border-color: rgb(var(--signal) / 0.6);
  color: rgb(var(--signal));
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.22);
}

.chat-invites-dm-gear-icon {
  width: 18px;
  height: 18px;
}

.chat-invites-dm-settings {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  min-width: min(220px, 80vw);
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgb(var(--stroke));
  background:
    radial-gradient(circle at 80% 0%, rgb(var(--signal) / 0.14), transparent 60%),
    rgb(var(--surface));
  box-shadow: 0 20px 34px rgba(15, 23, 42, 0.25);
  display: grid;
  gap: 10px;
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  transform-origin: top right;
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
  z-index: 10;
}

.chat-invites-dm-settings[data-open='true'] {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.chat-invites-dm-settings-header {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgb(var(--muted));
}

.chat-invites-dm-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid rgb(var(--stroke) / 0.6);
}

.chat-invites-dm-setting:first-of-type {
  border-top: none;
  padding-top: 0;
}

.chat-invites-dm-setting-label {
  display: grid;
  gap: 2px;
}

.chat-invites-dm-setting-title {
  font-size: 0.78rem;
  color: rgb(var(--ink));
}

.chat-invites-dm-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: rgb(var(--ink));
}

.chat-invites-dm-meta {
  font-size: 0.92rem;
  color: rgb(var(--muted));
}

.chat-invites-dm-close {
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke-strong));
  background: rgb(var(--surface));
  color: rgb(var(--muted));
  padding: 8px 16px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: border-color 200ms ease, transform 200ms ease;
}

.chat-invites-dm-close:hover {
  border-color: rgb(var(--accent));
  transform: translateY(-1px);
}

.chat-invites-dm-body {
  border-radius: 18px;
  border: 1px solid rgb(var(--stroke));
  background:
    linear-gradient(160deg, rgb(var(--surface-soft) / 0.9), rgb(var(--surface) / 0.98)),
    rgb(var(--surface));
  padding: 20px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  overflow: hidden;
}

.chat-invites-dm-status {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.7rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--muted));
}

.chat-invites-dm-status > span:first-child {
  margin-right: auto;
}

.chat-invites-dm-status[data-tone='error'] {
  color: rgb(var(--accent));
}

.chat-invites-dm-status[data-tone='muted'] {
  color: rgb(var(--muted));
  opacity: 0.85;
}

.chat-invites-dm-error {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: rgb(var(--accent));
}

.chat-invites-dm-typing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  color: rgb(var(--signal-strong));
}

.chat-invites-dm-typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chat-invites-dm-typing-dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--signal));
  opacity: 0.5;
  animation: chat-typing-dot 1s ease-in-out infinite;
}

.chat-invites-dm-typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.chat-invites-dm-typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

.chat-invites-dm-messages {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;
}

.chat-invites-dm-message {
  max-width: min(70ch, 84%);
  align-self: flex-start;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgb(var(--stroke));
  background: linear-gradient(160deg, rgb(var(--surface-soft)), rgb(var(--surface)));
  box-shadow: 0 10px 28px rgb(10 14 28 / 0.28);
}

.chat-invites-dm-message[data-author='self'] {
  align-self: flex-end;
  border-color: rgb(var(--signal) / 0.4);
  background: linear-gradient(135deg, rgb(var(--surface)), rgb(var(--signal) / 0.12));
}

.chat-invites-dm-text {
  margin: 0;
  font-size: 0.95rem;
  color: rgb(var(--ink));
}

.chat-invites-dm-meta {
  margin-top: 6px;
  display: flex;
  gap: 10px;
  font-size: 0.68rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgb(var(--muted));
}

.chat-invites-dm-state {
  color: rgb(var(--signal-strong));
}

.chat-invites-dm-message[data-status='failed'] .chat-invites-dm-state {
  color: rgb(var(--accent));
}

.chat-invites-dm-message[data-status='pending'] .chat-invites-dm-state {
  color: rgb(var(--muted));
}

.chat-invites-dm-message[data-status='read'] .chat-invites-dm-state {
  color: rgb(var(--signal-strong));
}

.chat-invites-dm-compose {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-invites-dm-input {
  flex: 1;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface-soft));
  color: rgb(var(--ink));
  padding: 12px 16px;
  font-size: 0.92rem;
  outline: none;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

.chat-invites-dm-input:focus {
  border-color: rgb(var(--signal) / 0.7);
  box-shadow: 0 0 0 3px rgb(var(--signal) / 0.15);
}

.chat-invites-dm-send {
  border-radius: 999px;
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgb(var(--signal)), rgb(var(--accent)));
  color: rgb(var(--accent-ink));
  padding: 12px 20px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 200ms ease, box-shadow 200ms ease, opacity 200ms ease;
}

.chat-invites-dm-send:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgb(var(--accent) / 0.25);
}

.chat-invites-dm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.chat-invites-dm-placeholder {
  font-size: 0.9rem;
  color: rgb(var(--muted));
}

.chat-invites-dm[data-animate='true'] .chat-invites-dm-card {
  transform: translate(0, 0) scale(1, 1);
  border-radius: 0;
}

.chat-invites-dm[data-closing='true'] {
  opacity: 0;
}

.chat-invites-dm[data-closing='true'] .chat-invites-dm-card {
  transform: translate(var(--dm-origin-x), var(--dm-origin-y))
    scale(var(--dm-origin-scale-x), var(--dm-origin-scale-y));
  border-radius: var(--dm-origin-radius);
}

@keyframes chat-typing-dot {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
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
  .chat-invites-subcount,
  .chat-invites-item[data-interactive='true'],
  .chat-invites-dm,
  .chat-invites-dm-card,
  .chat-invites-dm-close,
  .chat-invites-dm-gear,
  .chat-invites-dm-settings,
  .chat-invites-dm-input,
  .chat-invites-dm-send {
    transition: none;
  }

  .chat-invites-dm-typing-dot {
    animation: none;
  }

  .chat-invites-dm,
  .chat-invites-dm-card {
    animation: none;
  }
}

@media (max-width: 720px) {
  .chat-invites-popover {
    min-width: min(320px, 92vw);
  }

  .chat-invites-dm-card {
    padding: 18px;
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
