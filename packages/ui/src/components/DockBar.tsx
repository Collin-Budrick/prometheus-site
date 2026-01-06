import { component$, Slot } from '@builder.io/qwik'
import { Dock } from './Dock'

export type DockBarProps = {
  ariaLabel: string
}

export const DockBar = component$(({ ariaLabel }: DockBarProps) => (
  <div class="dock-shell">
    <Dock iconMagnification={1.6} iconDistance={140} ariaLabel={ariaLabel}>
      <Slot />
    </Dock>
  </div>
))
