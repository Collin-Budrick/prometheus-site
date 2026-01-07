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
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  align-content: start;
  grid-auto-flow: dense;
  max-height: 420px;
  overflow: auto;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
}

.store-stream-row {
  --stagger: 0px;
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 16px;
  background:
    linear-gradient(160deg, rgb(var(--surface-soft) / 0.9), rgb(var(--surface) / 0.9)),
    rgb(var(--surface-soft));
  border: 1px solid rgb(var(--stroke));
  box-shadow: 0 16px 26px rgba(15, 23, 42, 0.16);
  transform: translateY(var(--stagger));
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
  min-width: 0;
}

.store-stream-row:nth-child(odd) {
  --stagger: 8px;
}

.store-stream-row:nth-child(3n) {
  --stagger: 14px;
}

.store-stream-row:hover {
  transform: translateY(calc(var(--stagger) - 4px));
  border-color: rgb(var(--stroke-strong));
  box-shadow: 0 22px 34px rgba(15, 23, 42, 0.22);
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
}

.store-stream-row-price {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: rgb(var(--ink));
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

  .store-stream-panel {
    padding: 16px;
  }

  .store-stream-row {
    --stagger: 0px;
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
  id: 'fragment://page/store/stream@v2',
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
