import type { Lang } from '../../lang'
import { getUiCopy } from '../../lang/client'
import { appConfig } from '../../public-app-config'
import { loadClientAuthSession } from '../auth-client'
import {
  ensureSpacetimeAuthSession,
  isSpacetimeAuthConfigured,
  startSpacetimeAuthLogin,
  type SpacetimeAuthMethod
} from '../../shared/spacetime-auth'

type MountStaticLoginControllerOptions = {
  lang: Lang
}

type StatusTone = 'neutral' | 'error'

const setStatus = (root: HTMLElement, tone: StatusTone, message: string | null) => {
  const status = root.querySelector<HTMLElement>('[data-static-login-status]')
  if (!status) return
  status.dataset.tone = tone
  status.textContent = message ?? ''
  status.hidden = !message
}

const setBusy = (root: HTMLElement, busy: boolean) => {
  root
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-static-login-disable]')
    .forEach((element) => {
      element.disabled = busy
    })
}

const resolveNextPath = () => {
  const next = new URL(window.location.href).searchParams.get('next')?.trim() ?? ''
  if (!next) return '/profile'
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return '/profile'
    return `${url.pathname}${url.search}${url.hash}` || '/profile'
  } catch {
    return '/profile'
  }
}

const resolveProfileUrl = (lang: Lang) => {
  const url = new URL(resolveNextPath(), window.location.origin)
  if (!url.searchParams.has('lang')) {
    url.searchParams.set('lang', lang)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export const mountStaticLoginController = ({ lang }: MountStaticLoginControllerOptions) => {
  const root = document.querySelector<HTMLElement>('[data-static-login-root]')
  if (!root) {
    return { cleanup() {} }
  }

  const copy = getUiCopy(lang)
  const cleanupFns: Array<() => void> = []
  const configured = isSpacetimeAuthConfigured()
  let busy = !configured

  const applyBusy = () => {
    root.dataset.state = busy ? 'submitting' : 'idle'
    setBusy(root, busy)
  }

  const redirectToProfile = () => {
    window.location.assign(resolveProfileUrl(lang))
  }

  const primeExistingSession = () => {
    void (async () => {
      const session = await loadClientAuthSession().catch(() => ({ status: 'anonymous' as const }))
      if (session.status === 'authenticated') {
        redirectToProfile()
        return
      }

      if (!configured) {
        setStatus(root, 'error', copy.authNotConfigured)
        applyBusy()
        return
      }

      try {
        const restored = await ensureSpacetimeAuthSession(appConfig.apiBase)
        if (restored) {
          redirectToProfile()
        }
      } catch {
        // Keep the launcher interactive when refresh or cookie sync fails.
      } finally {
        applyBusy()
      }
    })()
  }

  const attachMethodButtons = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-static-login-method]').forEach((button) => {
      const rawMethod = button.dataset.staticLoginMethod
      const method: SpacetimeAuthMethod | null =
        rawMethod === 'magic-link' || rawMethod === 'google' || rawMethod === 'github' ? rawMethod : null
      if (!method) return

      const handler = () => {
        if (busy) return
        busy = true
        applyBusy()
        setStatus(
          root,
          'neutral',
          method === 'magic-link'
            ? copy.authRedirectingMagicLink
            : copy.authRedirectingProvider.replace('{{method}}', method)
        )
        void startSpacetimeAuthLogin(method, { next: resolveNextPath() }).catch((error) => {
          busy = false
          applyBusy()
          setStatus(
            root,
            'error',
            error instanceof Error ? error.message : copy.authStartFailed
          )
        })
      }

      button.addEventListener('click', handler)
      cleanupFns.push(() => button.removeEventListener('click', handler))
    })
  }

  if (!configured) {
    setStatus(root, 'error', copy.authNotConfigured)
  }

  applyBusy()
  attachMethodButtons()
  primeExistingSession()

  return {
    cleanup() {
      cleanupFns.splice(0).forEach((cleanup) => cleanup())
    }
  }
}
