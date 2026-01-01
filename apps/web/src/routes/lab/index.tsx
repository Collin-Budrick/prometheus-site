import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'

export default component$(() => (
  <section class="fragment-shell">
    <div class="fragment-grid">
      <article class="fragment-card" style={{ gridColumn: 'span 12' }} data-motion>
        <div class="meta-line">Lab</div>
        <h1>Lab</h1>
        <p>Prototype new fragment systems, run experiments, and validate edge behaviors.</p>
        <button class="action-button" type="button">Launch experiment</button>
      </article>
    </div>
  </section>
))

export const head: DocumentHead = {
  title: 'Lab | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Prototype new fragment systems and validate edge behaviors.'
    }
  ]
}
