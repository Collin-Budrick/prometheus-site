import { component$, useStylesScoped$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { StoreIsland } from './store-island'
import styles from './index.css?inline'

export { onGet, useCreateStoreItem, useDeleteStoreItem, useStoreItemsLoader } from './store-data'

export default component$(() => {
  useStylesScoped$(styles)

  return (
    <section class="p-6 surface">
      <div class="flex justify-between items-center gap-2">
        <div>
          <p class="text-emerald-300 text-sm uppercase tracking-wide">{_`Store`}</p>
          <h1 class="font-semibold text-slate-50 text-2xl">{_`Fast browsing with tiny payloads`}</h1>
        </div>
        <span class="bg-slate-800 px-3 py-1 rounded-full text-slate-200 text-xs">{_`cached`}</span>
      </div>
      <p class="mt-3 max-w-2xl text-slate-300 text-sm">
        {_`Items stream directly from Postgres via Drizzle, with cursor pagination to keep responses lean. Data only wakes up once the route is visible to keep initial payloads microscopic.`}
      </p>

      <StoreIsland on:qvisible />
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Store | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Drizzle-powered store pulling from Postgres with cursor pagination and lazy loading.`
      }
    ]
  }))
