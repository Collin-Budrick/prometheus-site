import { buildFragmentPlan } from '@core/fragment/planner'
import { registerFragmentDefinitions, registerFragmentPlanOverride } from '@core/fragment/registry'
import { h, t as textNode } from '@core/fragment/tree'
import type { FragmentDefinition, FragmentPlanEntry } from '@core/fragment/types'

const baseMeta = {
  ttl: 30,
  staleTtl: 120,
  runtime: 'edge' as const
}

const storeFragmentCss = `
.store-fragment {
  display: grid;
  gap: 18px;
}

.store-fragment-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.store-stream {
  display: grid;
  gap: 16px;
}

.store-stream-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
}

.store-stream-search {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  flex: 1;
  min-width: 240px;
  align-items: center;
}

.store-stream-field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background:
    linear-gradient(135deg, rgb(var(--surface) / 0.9), rgb(var(--surface-soft) / 0.95)),
    rgb(var(--surface));
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.14);
  flex: 1;
  min-width: 220px;
  transition: border-color 240ms ease, box-shadow 240ms ease, background 240ms ease;
}

.store-stream-field input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.98rem;
  color: rgb(var(--ink));
}

.store-stream-field input::placeholder {
  color: rgb(var(--muted-faint));
}
.store-stream-field:focus-within {
  border-color: rgb(var(--accent));
  box-shadow:
    0 20px 34px rgba(15, 23, 42, 0.2),
    0 0 0 1px rgb(var(--accent) / 0.45);
}

.store-stream-clear {
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  color: rgb(var(--muted));
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.3em;
  cursor: pointer;
  transition: border-color 200ms ease, color 200ms ease, background 200ms ease;
}

.store-stream-clear:hover {
  border-color: rgb(var(--stroke-strong));
  color: rgb(var(--ink));
}

.store-stream-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgb(var(--muted));
}

.store-stream-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(var(--muted-faint));
  box-shadow: 0 0 0 4px rgb(var(--surface));
}

.store-stream[data-state='live'] .store-stream-status-dot {
  background: rgb(var(--signal));
}

.store-stream[data-state='error'] .store-stream-status-dot {
  background: rgb(var(--accent));
}

.store-stream-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgb(var(--muted));
}

.store-stream-panel {
  border-radius: 18px;
  border: 1px solid rgb(var(--stroke));
  background:
    radial-gradient(circle at 20% 0%, rgb(var(--accent) / 0.12), transparent 55%),
    radial-gradient(circle at 80% 0%, rgb(var(--signal) / 0.12), transparent 50%),
    rgb(var(--surface));
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-content: start;
  max-height: 420px;
  overflow: auto;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
}

.store-stream-row {
  --stagger-index: 0;
  position: relative;
  display: grid;
  gap: 10px;
  padding: 14px 44px 14px 16px;
  border-radius: 16px;
  background:
    linear-gradient(160deg, rgb(var(--surface-soft) / 0.9), rgb(var(--surface) / 0.9)),
    rgb(var(--surface-soft));
  border: 1px solid rgb(var(--stroke));
  box-shadow: 0 16px 26px rgba(15, 23, 42, 0.16);
  opacity: 0;
  transform: translateY(10px);
  animation: store-stream-card-in 520ms var(--view-transition-ease, cubic-bezier(0.22, 1, 0.36, 1)) forwards;
  animation-delay: calc(var(--stagger-index) * 70ms);
  transition: box-shadow 220ms ease, border-color 220ms ease;
  min-width: 0;
  cursor: grab;
}

.store-stream-row.is-removing {
  animation: none;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 240ms ease, transform 240ms ease;
  pointer-events: none;
}

.store-stream-row.is-deleting {
  opacity: 0.8;
}

.store-stream-row.is-dragging {
  opacity: 0.7;
  box-shadow: 0 24px 38px rgba(15, 23, 42, 0.25);
  cursor: grabbing;
}

.store-stream-row:hover {
  border-color: rgb(var(--stroke-strong));
  box-shadow: 0 22px 34px rgba(15, 23, 42, 0.22);
}

.store-stream-delete {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  color: rgb(var(--muted));
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  transition: color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.store-stream-delete:hover {
  color: rgb(var(--ink));
  border-color: rgb(var(--stroke-strong));
  box-shadow: 0 12px 18px rgba(15, 23, 42, 0.18);
  transform: translateY(-1px);
}

.store-stream-delete:disabled {
  cursor: default;
  opacity: 0.5;
  box-shadow: none;
  transform: none;
}

@keyframes store-stream-card-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.store-stream-row-title {
  font-size: 15px;
  font-weight: 600;
  color: rgb(var(--ink));
}

.store-stream-row-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: rgb(var(--muted));
}

.store-stream-row-meta-secondary {
  justify-content: space-between;
  color: rgb(var(--muted-soft));
  flex-wrap: wrap;
}

.store-stream-row-price {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: rgb(var(--ink));
  margin-left: auto;
}

.store-stream-add {
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  color: rgb(var(--muted));
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.store-stream-add:hover {
  color: rgb(var(--ink));
  border-color: rgb(var(--stroke-strong));
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.16);
  transform: translateY(-1px);
}

.store-stream-add:active {
  transform: translateY(0);
}

.store-stream-add:disabled {
  opacity: 0.6;
  cursor: default;
  box-shadow: none;
}

.store-stream-score {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  font-size: 10px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: rgb(var(--muted));
}

.store-stream-empty {
  padding: 18px;
  text-align: center;
  color: rgb(var(--muted));
  font-size: 13px;
}

.store-create {
  display: grid;
  gap: 16px;
}

.store-create-form {
  display: grid;
  gap: 12px;
}

.store-create-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 0.7fr) minmax(0, 0.6fr) auto;
  gap: 12px;
  align-items: end;
}

.store-create-input {
  display: grid;
  gap: 6px;
}

.store-create-input span {
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: rgb(var(--muted));
}

.store-create-input input {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  color: rgb(var(--ink));
  font-size: 0.95rem;
}

.store-create-input input::placeholder {
  color: rgb(var(--muted-faint));
}

.store-create-submit {
  border: none;
  background: rgb(var(--accent));
  color: rgb(var(--accent-ink));
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.3em;
  cursor: pointer;
  min-height: 42px;
}

.store-create-submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.store-create-helper {
  margin: 0;
  font-size: 12px;
  color: rgb(var(--muted));
}

.store-create-status {
  font-size: 12px;
  color: rgb(var(--muted));
}

.store-create[data-state='success'] .store-create-status {
  color: rgb(var(--signal));
}

.store-create[data-state='error'] .store-create-status {
  color: rgb(var(--accent));
}

.store-cart {
  display: grid;
  gap: 16px;
}

.store-cart-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.store-cart-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgb(var(--ink));
}

.store-cart-helper {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgb(var(--muted));
}

.store-cart-total {
  display: grid;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgb(var(--muted));
  min-width: 120px;
}

.store-cart-total strong {
  font-size: 13px;
  letter-spacing: 0.12em;
  color: rgb(var(--ink));
}

.store-cart-dropzone {
  position: relative;
  border-radius: 18px;
  border: 1px dashed rgb(var(--stroke));
  background: rgb(var(--surface));
  padding: 16px;
  min-height: 180px;
  display: grid;
  gap: 12px;
  transition: border-color 200ms ease, background 200ms ease, box-shadow 200ms ease;
}

.store-cart-dropzone.is-active {
  border-color: rgb(var(--accent));
  background: rgb(var(--surface-soft));
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.14);
}

.store-cart-drop-hint {
  position: absolute;
  inset: 12px;
  border-radius: 16px;
  border: 1px dashed rgb(var(--accent));
  background: rgb(var(--surface) / 0.6);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: rgb(var(--accent));
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.store-cart-dropzone.is-active .store-cart-drop-hint {
  opacity: 1;
}

.store-cart-empty {
  padding: 24px 16px;
  text-align: center;
  color: rgb(var(--muted));
  font-size: 13px;
}

.store-cart-list {
  display: grid;
  gap: 12px;
}

.store-cart-item {
  --stagger-index: 0;
  position: relative;
  display: grid;
  gap: 8px;
  padding: 12px 38px 12px 14px;
  border-radius: 14px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface-soft));
  box-shadow: 0 12px 20px rgba(15, 23, 42, 0.12);
  opacity: 0;
  transform: translateY(8px);
  animation: store-cart-item-in 420ms var(--view-transition-ease, cubic-bezier(0.22, 1, 0.36, 1)) forwards;
  animation-delay: calc(var(--stagger-index) * 60ms);
}

.store-cart-item.is-removing {
  animation: none;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 240ms ease, transform 240ms ease;
  pointer-events: none;
}

.store-cart-item-title {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--ink));
}

.store-cart-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgb(var(--muted));
}

.store-cart-item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.store-cart-qty {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgb(var(--muted));
}

.store-cart-price {
  font-size: 12px;
  font-family: var(--font-mono);
  letter-spacing: 0.18em;
  color: rgb(var(--ink));
}

.store-cart-remove {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  color: rgb(var(--muted));
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.store-cart-remove:hover {
  color: rgb(var(--ink));
  border-color: rgb(var(--stroke-strong));
  box-shadow: 0 10px 16px rgba(15, 23, 42, 0.18);
  transform: translateY(-1px);
}

.store-cart-remove:active {
  transform: translateY(0);
}

@keyframes store-cart-item-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .store-stream-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .store-stream-controls {
    align-items: stretch;
  }

  .store-stream-search {
    width: 100%;
  }

  .store-stream-panel {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .store-stream-row {
    animation-delay: 0ms;
  }

  .store-stream-delete {
    top: 8px;
    right: 8px;
  }

  .store-cart-total {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .store-stream-row {
    opacity: 1;
    transform: none;
    animation: none;
  }

  .store-cart-item {
    opacity: 1;
    transform: none;
    animation: none;
  }
}

@media (max-width: 720px) {
  .store-create-grid {
    grid-template-columns: 1fr;
  }

  .store-create-submit {
    width: 100%;
  }
}
`

const storeStream: FragmentDefinition = {
  id: 'fragment://page/store/stream@v5',
  tags: ['store', 'search', 'stream'],
  head: [],
  css: storeFragmentCss,
  ...baseMeta,
  render: ({ t }) =>
    h('section', { class: 'store-fragment' }, [
      h('div', { class: 'store-fragment-badges' }, [
        h('span', { class: 'badge' }, textNode(t('Postgres truth'))),
        h('span', { class: 'badge signal' }, textNode(t('Valkey search'))),
        h('span', { class: 'badge accent' }, textNode(t('Realtime stream')))
      ]),
      h('store-stream', {
        class: 'store-stream',
        'data-limit': '12',
        'data-placeholder': t('Search the store...')
      })
    ])
}

const storeCreate: FragmentDefinition = {
  id: 'fragment://page/store/create@v1',
  tags: ['store', 'create'],
  head: [],
  css: storeFragmentCss,
  ...baseMeta,
  render: ({ t }) =>
    h('store-create', {
      'data-name-label': t('Item name'),
      'data-price-label': t('Price'),
      'data-quantity-label': t('Quantity'),
      'data-submit-label': t('Add item'),
      'data-name-placeholder': t('Neural render pack'),
      'data-price-placeholder': t('19.00'),
      'data-quantity-placeholder': t('1'),
      'data-helper': t('Validated by drizzle-zod and streamed over realtime updates.')
    })
}

const storeCart: FragmentDefinition = {
  id: 'fragment://page/store/cart@v1',
  tags: ['store', 'cart'],
  head: [],
  css: storeFragmentCss,
  ...baseMeta,
  render: ({ t }) =>
    h('store-cart', {
      'data-title': t('Cart'),
      'data-helper': t('Drag items here or select them.'),
      'data-empty': t('Cart is empty.'),
      'data-total': t('Total'),
      'data-drop': t('Drop to add'),
      'data-remove': t('Remove item')
    })
}

export const storeFragments: FragmentPlanEntry[] = [
  {
    id: storeStream.id,
    critical: true,
    layout: { column: 'span 12' }
  },
  {
    id: storeCart.id,
    critical: true,
    layout: { column: 'span 12' }
  },
  {
    id: storeCreate.id,
    critical: true,
    layout: { column: 'span 12' }
  }
]

registerFragmentDefinitions([storeStream, storeCreate, storeCart])

registerFragmentPlanOverride((plan) => {
  if (plan.path !== '/store') return plan
  return buildFragmentPlan(plan.path, storeFragments, [])
})
