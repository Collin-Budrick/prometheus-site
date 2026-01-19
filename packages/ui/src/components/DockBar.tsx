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
    <Dock iconMagnification={1.6} iconDistance={140} ariaLabel={ariaLabel}>
      <Slot />
    </Dock>
  </div>
))
