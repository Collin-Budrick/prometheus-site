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
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.store-stream-search {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  flex: 1;
  min-width: 240px;
  align-items: center;
}

.store-stream-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  flex: 1;
  min-width: 220px;
}

.store-stream-field input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.95rem;
  color: rgb(var(--ink));
}

.store-stream-field input::placeholder {
  color: rgb(var(--muted-faint));
}

.store-stream-field button {
  border: none;
  background: rgb(var(--accent));
  color: rgb(var(--accent-ink));
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.3em;
  cursor: pointer;
}

.store-stream-field button:disabled {
  opacity: 0.6;
  cursor: default;
}

.store-stream-clear {
  border: 1px solid rgb(var(--stroke));
  background: rgb(var(--surface));
  color: rgb(var(--muted));
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.3em;
  cursor: pointer;
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
  background: rgb(var(--surface));
  padding: 14px;
  display: grid;
  gap: 10px;
  max-height: 360px;
  overflow: auto;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.store-stream-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgb(var(--surface-soft));
  border: 1px solid rgb(var(--stroke));
}

.store-stream-row-title {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--ink));
}

.store-stream-row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgb(var(--muted));
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
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 0.7fr) auto;
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

@media (max-width: 640px) {
  .store-stream-controls {
    align-items: stretch;
  }

  .store-stream-search {
    width: 100%;
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
  id: 'fragment://page/store/stream@v1',
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
      'data-submit-label': t('Add item'),
      'data-name-placeholder': t('Neural render pack'),
      'data-price-placeholder': t('19.00'),
      'data-helper': t('Validated by drizzle-zod and streamed over realtime updates.')
    })
}

export const storeFragments: FragmentPlanEntry[] = [
  {
    id: storeStream.id,
    critical: true,
    layout: { column: 'span 12' }
  },
  {
    id: storeCreate.id,
    critical: true,
    layout: { column: 'span 12' }
  }
]

registerFragmentDefinitions([storeStream, storeCreate])

registerFragmentPlanOverride((plan) => {
  if (plan.path !== '/store') return plan
  return buildFragmentPlan(plan.path, storeFragments, [])
})
