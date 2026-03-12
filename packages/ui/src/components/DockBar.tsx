import { component$, Slot } from '@builder.io/qwik'
import { Dock } from './Dock'

export type DockBarProps = {
  ariaLabel: string
  class?: string
  dockMode?: string
  dockCount?: number
}

export const DockBar = component$(({ ariaLabel, class: className, dockMode, dockCount }: DockBarProps) => (
  <div
    class={`dock-shell${className ? ` ${className}` : ''}`}
    data-dock-mode={dockMode}
    style={dockCount ? { '--dock-count': String(dockCount) } : undefined}
  >
    <nav class="dock-nav" aria-label={ariaLabel}>
      <Dock iconMagnification={1.45} iconDistance={150}>
        <Slot />
      </Dock>
    </nav>
  </div>
))
