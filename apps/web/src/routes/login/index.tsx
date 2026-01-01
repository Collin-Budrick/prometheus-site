import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'

export default component$(() => (
  <section class="fragment-shell">
    <div class="fragment-grid">
      <article class="fragment-card" style={{ gridColumn: 'span 12' }} data-motion>
        <div class="meta-line">Login</div>
        <h1>Login</h1>
        <p>Access your fragment workspace, release controls, and deployment history.</p>
        <button class="action-button" type="button">Request access</button>
      </article>
    </div>
  </section>
))

export const head: DocumentHead = {
  title: 'Login | Fragment Prime',
  meta: [
    {
      name: 'description',
      content: 'Access your fragment workspace and deployment history.'
    }
  ]
}
