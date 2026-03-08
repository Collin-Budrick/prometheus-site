export const HOME_STATIC_ROUTE_PATH = '/'
export const HOME_STATIC_ROUTE_KIND = 'home'

export const STATIC_ROUTE_ATTR = 'data-static-route'
export const STATIC_SHELL_REGION_ATTR = 'data-static-shell-region'
export const STATIC_DOCK_ROOT_ATTR = 'data-static-dock-root'
export const STATIC_FRAGMENT_CARD_ATTR = 'data-static-fragment-card'
export const STATIC_FRAGMENT_BODY_ATTR = 'data-static-fragment-body'
export const STATIC_FRAGMENT_VERSION_ATTR = 'data-fragment-version'
export const STATIC_FRAGMENT_LOCKED_ATTR = 'data-static-fragment-locked'

export const STATIC_SHELL_HEADER_REGION = 'header'
export const STATIC_SHELL_MAIN_REGION = 'main'
export const STATIC_SHELL_DOCK_REGION = 'dock'

export const STATIC_SHELL_SEED_SCRIPT_ID = 'prom-static-shell-seed'
export const STATIC_HOME_DATA_SCRIPT_ID = 'prom-static-home-data'

export const isHomeStaticPath = (path: string) => (path || '/') === HOME_STATIC_ROUTE_PATH

