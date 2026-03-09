import { component$, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { DockBar, DockIcon } from '@prometheus/ui'
import { getUiCopy } from '../lang/client'
import type { Lang } from '../lang'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS } from '../shared/nav-order'
import { buildPublicApiUrl } from '../shared/public-api-url'
import { DOCK_ICONS, isDockItemActive, withLangParam } from './dock'

type StaticDockIslandProps = {
  currentPath: string
  lang: Lang
}

type SessionPayload = {
  session?: {
    userId?: string
  }
  user?: {
    id?: string
  }
}

const isAuthenticatedPayload = (payload: SessionPayload | null | undefined) =>
  Boolean(payload?.user?.id || payload?.session?.userId)

export const StaticDockIsland = component$<StaticDockIslandProps>(({ currentPath, lang }) => {
  const authenticated = useSignal(false)
  const copy = getUiCopy(lang)
  const navItems = useComputed$(() => (authenticated.value ? AUTH_NAV_ITEMS : TOPBAR_NAV_ITEMS))

  useVisibleTask$(
    async (ctx) => {
      let cancelled = false
      ctx.cleanup(() => {
        cancelled = true
      })

      try {
        const response = await fetch(buildPublicApiUrl('/auth/session', window.location.origin), {
          credentials: 'include',
          headers: { accept: 'application/json' }
        })
        if (!response.ok) return
        const payload = (await response.json()) as SessionPayload
        if (!cancelled) {
          authenticated.value = isAuthenticatedPayload(payload)
        }
      } catch {
        // Leave the public dock in place when session checks fail.
      }
    },
    { strategy: 'document-idle' }
  )

  return (
    <DockBar
      ariaLabel={copy.dockAriaLabel}
      dockMode={authenticated.value ? 'auth' : 'public'}
      dockCount={navItems.value.length}
    >
      {navItems.value.map((item, index) => {
        const Icon = DOCK_ICONS[item.labelKey]
        const label = copy[item.labelKey]
        const isActive = isDockItemActive(currentPath, item.href)
        return (
          <DockIcon key={item.href} label={label}>
            <a
              class="dock-link"
              href={withLangParam(item.href, lang)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              title={label}
              style={{ '--dock-index': `${index}` }}
            >
              <Icon class="dock-icon-svg" aria-hidden="true" />
            </a>
          </DockIcon>
        )
      })}
    </DockBar>
  )
})
