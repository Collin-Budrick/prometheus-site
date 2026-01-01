import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'

export default component$(() => (
  <section class="fragment-shell">
    <div class="fragment-grid">
      <article class="fragment-card" style={{ gridColumn: 'span 12' }} data-motion>
        <div class="meta-line">Store</div>
        <h1>Store</h1>
        <p>Browse curated modules, fragments, and templates designed for fast binary delivery.</p>
        <button class="action-button" type="button">Browse catalog</button>
      </article>
    </div>
  </section>
))

export const head: DocumentHead = {
  title: 'Store | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Browse curated modules, fragments, and templates.'
    }
  ]
}
