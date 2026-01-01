import { component$, Slot } from '@builder.io/qwik'
import { useDocumentHead, type RequestHandler } from '@builder.io/qwik-city'

import { PUBLIC_CACHE_CONTROL } from '../cache-control'
import { resolveSpeculationRules } from './layout-helpers'

const speculationRules = resolveSpeculationRules()

export const onRequest: RequestHandler = ({ headers, method }) => {
  if ((method === 'GET' || method === 'HEAD') && !headers.has('Cache-Control')) {
    headers.set(
      'Cache-Control',
      PUBLIC_CACHE_CONTROL // 0s freshness, allow 60s stale-while-revalidate to keep streams aligned.
    )
  }
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
  const fontsHref =
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
  return (
    <>
      <title>{head.title}</title>
      {head.meta.map((meta) => (
        <meta key={`${meta.name || meta.property}-${meta.content}`} {...meta} />
      ))}
      {head.links.map((link) => (
        <link key={`${link.rel}-${link.href}`} {...link} />
      ))}
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <meta name="theme-color" content="#f97316" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="preload" as="style" href={fontsHref} />
      <link rel="stylesheet" href={fontsHref} />
      {speculationRules ? (
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={JSON.stringify(speculationRules)}
        />
      ) : null}
    </>
  )
})

export default component$(() => (
  <div class="layout-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true" />
        <div class="brand-title">
          <strong>FRAGMENT PRIME</strong>
          <span>Binary Rendering OS</span>
        </div>
      </div>
      <nav class="nav-links">
        <a href="/" data-fragment-link>
          Home
        </a>
        <a href="/store" data-fragment-link>
          Store
        </a>
        <a href="/lab" data-fragment-link>
          Lab
        </a>
        <a href="/login" data-fragment-link>
          Login
        </a>
      </nav>
    </header>
    <main data-motion-root>
      <Slot />
    </main>
  </div>
))
