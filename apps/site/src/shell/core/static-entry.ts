import { STATIC_HOME_DATA_SCRIPT_ID } from './constants'

export const bootstrapStaticEntry = async () => {
  if (document.getElementById(STATIC_HOME_DATA_SCRIPT_ID)) {
    const { bootstrapStaticHome } = await import('../home/home-bootstrap')
    await bootstrapStaticHome()
    return
  }

  const { bootstrapStaticShell } = await import('./static-bootstrap')
  await bootstrapStaticShell()
}

