import { component$ } from '@builder.io/qwik'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { fetchSessionFromApi } from '../../../server/auth/session'

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
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`Settings`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">
        {_`Control theme, notifications, and privacy from a lean SSR surface.`}
      </h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`Configure preferences without heavy client-side bundles.`}
      </p>
      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Theme`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Switch between light, dark, or system modes without blocking initial render.`}
          </p>
        </article>
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Notifications`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Choose minimal alerts to keep the experience distraction-free.`}
          </p>
        </article>
      </div>
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`Settings | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Configure preferences without heavy client-side bundles.`
      }
    ]
  }))
