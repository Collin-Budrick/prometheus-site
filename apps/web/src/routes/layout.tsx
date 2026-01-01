import { component$, Slot } from '@builder.io/qwik'
import { useDocumentHead } from '@builder.io/qwik-city'

const resolveApiBase = () => {
  const env = import.meta.env as Record<string, string | undefined>
  const base = env?.VITE_API_BASE?.trim() || ''
  return base.endsWith('/') ? base.slice(0, -1) : base
}

const apiBase = resolveApiBase()
const apiUrl = (path: string) => (apiBase ? `${apiBase}${path}` : path)

const speculationRules = {
  prefetch: [
    {
      source: 'list',
      urls: [apiUrl('/fragments/plan?path=/'), apiUrl('/fragments/stream?path=/')]
    }
  ]
}

export const RouterHead = component$(() => {
  const head = useDocumentHead()
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
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      />
      <script type="speculationrules" dangerouslySetInnerHTML={JSON.stringify(speculationRules)} />
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
          home
        </a>
        <a href="/" data-fragment-link>
          fragments
        </a>
        <a href="/" data-fragment-link>
          planner
        </a>
      </nav>
    </header>
    <main>
      <Slot />
    </main>
  </div>
))
