import { component$ } from '@builder.io/qwik'
import { Link, type DocumentHead, type RequestHandler } from '@builder.io/qwik-city'
import { _ } from '../../i18n/translate'
import { fetchSessionFromApi } from '../../server/auth/session'

export const onRequest: RequestHandler = async (event) => {
  const session = await fetchSessionFromApi(event)
  if (!session?.session) {
    const callback = `${event.url.pathname}${event.url.search}`
    throw event.redirect(302, `/login?callback=${encodeURIComponent(callback)}`)
  }
}

export default component$(() => {
  return (
    <section class="surface p-6">
      <p class="text-sm uppercase tracking-wide text-emerald-300">{_`User Dashboard`}</p>
      <h1 class="text-2xl font-semibold text-slate-50">{_`Welcome back`}</h1>
      <p class="mt-3 max-w-2xl text-sm text-slate-300">
        {_`Stay on top of your account with quick links to your personal tools.`}
      </p>
      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Account`}</h2>
          <p class="mt-2 text-sm text-slate-300">{_`Manage your account details and security.`}</p>
          <Link href="../account" class="mt-3 inline-flex text-emerald-300 hover:text-emerald-200">
            {_`Account`}
          </Link>
        </article>
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Settings`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Configure preferences without heavy client-side bundles.`}
          </p>
          <Link href="../settings" class="mt-3 inline-flex text-emerald-300 hover:text-emerald-200">
            {_`Settings`}
          </Link>
        </article>
        <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-900/30">
          <h2 class="text-lg font-semibold text-slate-100">{_`Navigation shortcuts`}</h2>
          <p class="mt-2 text-sm text-slate-300">
            {_`Jump to chat, AI helpers, or labs experiments from a single place.`}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Link href="../chat" class="text-emerald-300 hover:text-emerald-200">
              {_`Chat`}
            </Link>
            <Link href="../ai" class="text-emerald-300 hover:text-emerald-200">
              {_`AI`}
            </Link>
            <Link href="../labs" class="text-emerald-300 hover:text-emerald-200">
              {_`Labs`}
            </Link>
          </div>
        </article>
      </div>
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => ({
    title: _`User Dashboard | Prometheus`,
    meta: [
      {
        name: 'description',
        content: _`Personalized overview for signed-in users.`
      }
    ]
  }))
