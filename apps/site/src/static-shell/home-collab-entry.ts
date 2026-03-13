import { primeTrustedTypesPolicies } from '../security/client'
import { bindHomeCollaborativeText } from './home-collab-text'

type HomeCollabEntryWindow = Window & {
  __PROM_STATIC_HOME_COLLAB_ENTRY__?: boolean
}

type InstallHomeCollabEntryOptions = {
  win?: HomeCollabEntryWindow | null
  doc?: Document | null
}

export const installHomeCollabEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeCollabEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null
}: InstallHomeCollabEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_COLLAB_ENTRY__) {
    return () => undefined
  }

  primeTrustedTypesPolicies()
  win.__PROM_STATIC_HOME_COLLAB_ENTRY__ = true

  const manager = bindHomeCollaborativeText({ root: doc })
  manager.observeWithin(doc)

  return () => {
    manager.destroy()
    win.__PROM_STATIC_HOME_COLLAB_ENTRY__ = false
  }
}

if (typeof window !== 'undefined') {
  installHomeCollabEntry()
}
