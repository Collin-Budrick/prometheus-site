import { component$, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { DockBar, DockIcon } from '@prometheus/ui'
import { getUiCopy } from '../../lang/client'
import type { Lang } from '../../lang'
import { AUTH_NAV_ITEMS, TOPBAR_NAV_ITEMS } from '../../shared/nav-order'
import { readSeededAuthSession } from './seed-client'
import { DOCK_ICONS, isDockItemActive, withLangParam } from './dock'

type StaticDockIslandProps = {
  currentPath: string
  lang: Lang
}

export const StaticDockIsland = component$<StaticDockIslandProps>(({ currentPath, lang }) => {
  const authenticated = useSignal(readSeededAuthSession().status === 'authenticated')
  const copy = getUiCopy(lang)
  const navItems = useComputed$(() => (authenticated.value ? AUTH_NAV_ITEMS : TOPBAR_NAV_ITEMS))

  useVisibleTask$(
    () => {
      authenticated.value = readSeededAuthSession().status === 'authenticated'
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
