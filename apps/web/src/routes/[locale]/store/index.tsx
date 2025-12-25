import { component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { fetchSessionFromApi } from '../../../server/auth/session'
import { StoreIsland } from './store-island'

export { onGet, useCreateStoreItem, useDeleteStoreItem, useStoreItemsLoader, useUpdateStoreItem } from './store-data'

export const onRequest: RequestHandler = async (event) => {
  const session = await fetchSessionFromApi(event)
  if (!session?.session) {
    const callback = `${event.url.pathname}${event.url.search}`
    throw event.redirect(
      302,
      `/${event.params.locale}/login?callback=${encodeURIComponent(callback)}`
    )
  }
}

export default component$(() => {
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
        {_`Items stream directly from Postgres via Drizzle, with cursor pagination to keep responses lean. Interactivity wakes up only when you click.`}
      </p>

      <StoreIsland />
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
