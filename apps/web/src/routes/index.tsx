import { component$ } from '@builder.io/qwik'
import { inlineTranslate } from 'qwik-speak'
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city'

export const onGet: RequestHandler = ({ cacheControl }) => {
  if (import.meta.env.PROD) {
    cacheControl({
      public: true,
      maxAge: 900,
      sMaxAge: 86_400,
      staleWhileRevalidate: 600
    })
  }
}

export default component$(() => {
  const t = inlineTranslate()
  return (
    <section class="grid gap-6 md:grid-cols-2">
      <div class="p-6 surface">
        <p class="text-emerald-300 text-sm uppercase tracking-wide">
          {t('app.homeHero.eyebrow@@Performance first')}
        </p>
        <h1 class="mt-2 font-semibold text-slate-50 text-3xl">
          {t('app.homeHero.title@@Microscopic first load, big capability')}
        </h1>
        <p class="mt-4 text-slate-300">
          {t(
            'app.homeHero.description@@Qwik City SSR keeps the shell light. Navigation is enhanced with View Transitions and Speculation Rules when the browser supports them, and third-party scripts stay off the main thread.'
          )}
        </p>
        <ul class="space-y-3 mt-6 text-slate-200 text-sm">
          <li>{t('app.homeHero.bulletImmutableHome@@- Ultra-thin home route with immutable caching')}</li>
          <li>{t('app.homeHero.bulletLazyFeatures@@- Lazy feature routes for store, chat, and AI')}</li>
          <li>{t('app.homeHero.bulletPartytown@@- Optional Partytown for third-party isolation')}</li>
        </ul>
      </div>
      <div class="p-6 text-slate-200 text-sm surface">
        <h2 class="font-semibold text-slate-50 text-lg">{t('app.homeHero.latencyTitle@@Latency budget')}</h2>
        <ul class="space-y-2 mt-3">
          <li>{t('app.homeHero.latencyServer@@Server render: sub-50ms target with streaming enabled')}</li>
          <li>{t('app.homeHero.latencyCss@@Critical CSS: UnoCSS + Lightning CSS keeps payloads tiny')}</li>
          <li>{t('app.homeHero.latencySpeculation@@Speculative nav: prerender all internal links')}</li>
        </ul>
      </div>
    </section>
  )
})

export const head: DocumentHead = ({ withLocale }) =>
  withLocale(() => {
    const translate = inlineTranslate()
    return {
      title: `${translate('app.brand.name@@Prometheus')} | ${translate('app.brand.tagline@@Performance Lab')}`,
      meta: [
        {
          name: 'description',
          content: translate(
            'app.homeHero.description@@Qwik City SSR keeps the shell light. Navigation is enhanced with View Transitions and Speculation Rules when the browser supports them, and third-party scripts stay off the main thread.'
          )
        }
      ]
    }
  })
