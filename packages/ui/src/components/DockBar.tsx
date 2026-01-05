import { component$, type Component } from '@builder.io/qwik'
import { Link } from '@builder.io/qwik-city'
import { Dock, DockIcon } from './Dock'

export type DockBarItem = {
  href: string
  label: string
  icon: Component<any>
}

export type DockBarProps = {
  items: ReadonlyArray<DockBarItem>
  ariaLabel: string
}

export const DockBar = component$(({ items, ariaLabel }: DockBarProps) => (
  <div class="dock-shell">
    <Dock iconMagnification={1.6} iconDistance={140} ariaLabel={ariaLabel}>
      {items.map(({ href, label, icon: Icon }) => (
        <DockIcon key={href} label={label}>
          <Link class="dock-link" href={href} data-fragment-link aria-label={label} title={label}>
            <Icon class="dock-icon-svg" aria-hidden="true" />
          </Link>
        </DockIcon>
      ))}
    </Dock>
  </div>
))
