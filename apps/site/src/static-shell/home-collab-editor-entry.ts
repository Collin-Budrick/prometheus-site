import { primeTrustedTypesPolicies } from '../security/client'
import { attachHomeCollaborativeEditorRoot } from './home-collab-text'

type HomeCollabEditorEntryWindow = Window & {
  __PROM_STATIC_HOME_COLLAB_EDITOR_ENTRY__?: boolean
}

type InstallHomeCollabEditorOptions = {
  win?: HomeCollabEditorEntryWindow | null
  root?: HTMLElement | null
}

export const installHomeCollabEditor = ({
  win = typeof window !== 'undefined' ? (window as HomeCollabEditorEntryWindow) : null,
  root = null
}: InstallHomeCollabEditorOptions = {}) => {
  if (!win || !root) {
    return () => undefined
  }

  primeTrustedTypesPolicies()
  win.__PROM_STATIC_HOME_COLLAB_EDITOR_ENTRY__ = true

  const cleanup = attachHomeCollaborativeEditorRoot({ root })

  return () => {
    cleanup()
    win.__PROM_STATIC_HOME_COLLAB_EDITOR_ENTRY__ = false
  }
}
