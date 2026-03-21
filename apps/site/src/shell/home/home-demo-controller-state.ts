import type {
  HomeDemoActivationManager,
  HomeDemoController
} from './home-demo-controller'

type HomeDemoControllerWindow = Window & {
  __PROM_STATIC_HOME_DEMO_CONTROLLER__?: HomeDemoControllerBinding | null
}

export type HomeDemoControllerBinding = {
  controller: HomeDemoController
  manager: HomeDemoActivationManager
}

export const getHomeDemoControllerBinding = (
  win: HomeDemoControllerWindow | null = typeof window !== 'undefined'
    ? (window as HomeDemoControllerWindow)
    : null
) => win?.__PROM_STATIC_HOME_DEMO_CONTROLLER__ ?? null

export const setHomeDemoControllerBinding = (
  binding: HomeDemoControllerBinding,
  win: HomeDemoControllerWindow | null = typeof window !== 'undefined'
    ? (window as HomeDemoControllerWindow)
    : null
) => {
  if (!win) return binding
  win.__PROM_STATIC_HOME_DEMO_CONTROLLER__ = binding
  return binding
}

export const clearHomeDemoControllerBinding = (
  binding?: HomeDemoControllerBinding | null,
  win: HomeDemoControllerWindow | null = typeof window !== 'undefined'
    ? (window as HomeDemoControllerWindow)
    : null
) => {
  if (!win) return
  if (binding && win.__PROM_STATIC_HOME_DEMO_CONTROLLER__ !== binding) {
    return
  }
  win.__PROM_STATIC_HOME_DEMO_CONTROLLER__ = null
}
