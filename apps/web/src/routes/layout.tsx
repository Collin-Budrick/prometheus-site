import { component$, Slot } from '@builder.io/qwik'
import { useDocumentHead } from '@builder.io/qwik-city'

const speculationRules = {
  prefetch: [
    {
      source: 'list',
      urls: ['/fragments/plan?path=/', '/fragments/stream?path=/']
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
