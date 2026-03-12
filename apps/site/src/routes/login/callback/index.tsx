import { component$, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { Link, type DocumentHead, type RequestHandler } from '@builder.io/qwik-city'
import { FragmentCard } from '@prometheus/ui'
import authStyles from '@features/auth/auth.css?inline'
import { appConfig } from '../../../public-app-config'
import { siteBrand } from '../../../config'
import { createCacheHandler } from '../../cache-headers'
import { completeSpacetimeAuthCallback } from '../../../shared/spacetime-auth'

const CALLBACK_CACHE_CONTROL = 'private, no-store, max-age=0, must-revalidate'

export const onGet: RequestHandler = createCacheHandler(CALLBACK_CACHE_CONTROL)

export const head: DocumentHead = {
  title: `Finishing sign-in | ${siteBrand.name}`,
  meta: [
    {
      name: 'description',
      content: 'Completing the hosted SpacetimeAuth sign-in flow.'
    }
  ]
}

export default component$(() => {
  useStyles$(authStyles)
  const message = useSignal('Finishing the hosted sign-in flow...')
  const error = useSignal<string | null>(null)
  const expandedId = useSignal<string | null>(null)
  const layoutTick = useSignal(0)

  useVisibleTask$(async () => {
    if (typeof window === 'undefined') return
    try {
      const result = await completeSpacetimeAuthCallback(window.location.href, appConfig.apiBase)
      window.location.replace(result.next)
    } catch (reason) {
      error.value =
        reason instanceof Error ? reason.message : 'Unable to finish the SpacetimeAuth callback.'
      message.value = 'The hosted sign-in flow could not be completed.'
    }
  })

  return (
    <section class="fragment-shell auth-shell">
      <div class="fragment-grid auth-grid" data-fragment-grid="main">
        <FragmentCard
          id="auth:callback"
          column="span 12"
          motionDelay={0}
          expandedId={expandedId}
          layoutTick={layoutTick}
          closeLabel="Close"
        >
          <div class="auth-card" data-mode="login" data-state={error.value ? 'error' : 'submitting'}>
            <div class="auth-header">
              <div class="meta-line">SpacetimeAuth callback</div>
              <div class="auth-title">
                <h1>{error.value ? 'Sign-in failed' : 'Completing sign-in'}</h1>
                <p>{message.value}</p>
              </div>
            </div>

            {error.value ? (
              <>
                <div class="auth-status" role="alert" aria-live="assertive" data-tone="error">
                  {error.value}
                </div>
                <div class="auth-actions">
                  <Link class="auth-primary" href="/login">
                    Return to login
                  </Link>
                </div>
              </>
            ) : (
              <div class="auth-status" role="status" aria-live="polite" data-tone="neutral">
                Verifying the returned ID token, syncing the site session, and restoring your bootstrap state.
              </div>
            )}
          </div>
        </FragmentCard>
      </div>
    </section>
  )
})
