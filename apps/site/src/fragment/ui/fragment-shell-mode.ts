import type { FragmentShellMode } from './fragment-shell-types'

export const resolveFragmentShellMode = (path: string): FragmentShellMode =>
  path === '/' ? 'static-home' : 'interactive'

export const isStaticHomeShellMode = (shellMode: FragmentShellMode) => shellMode === 'static-home'

export const shouldHoldStaticHomeStartup = ({
  shellMode,
  startupReady,
  langChanged
}: {
  shellMode: FragmentShellMode
  startupReady: boolean
  langChanged: boolean
}) => isStaticHomeShellMode(shellMode) && !startupReady && !langChanged

