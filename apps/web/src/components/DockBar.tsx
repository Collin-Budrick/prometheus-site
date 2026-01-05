import { component$ } from '@builder.io/qwik'
import { Link } from '@builder.io/qwik-city'
import { InFlask, InHomeSimple, InShop, InUser } from '@qwikest/icons/iconoir'
import { Dock, DockIcon } from './Dock'
import { useLangCopy, useSharedLangSignal } from '../shared/lang-bridge'
import { TOPBAR_NAV_ITEMS } from '../shared/nav-order'

const DOCK_ICONS = {
  navHome: InHomeSimple,
  navStore: InShop,
  navLab: InFlask,
  navLogin: InUser
} as const

export const DockBar = component$(() => {
  const copy = useLangCopy(useSharedLangSignal())

  return (
    <div class="dock-shell">
      <Dock iconMagnification={1.6} iconDistance={140}>
        {TOPBAR_NAV_ITEMS.map((item) => {
          const label = copy.value[item.labelKey]
          const Icon = DOCK_ICONS[item.labelKey]

          return (
            <DockIcon key={item.href} label={label}>
              <Link class="dock-link" href={item.href} data-fragment-link aria-label={label} title={label}>
                <Icon class="dock-icon-svg" aria-hidden="true" />
              </Link>
            </DockIcon>
          )
        })}
      </Dock>
    </div>
  )
})
