import { enabledNavItems, type NavItem } from '../config'

export type SiteNavItem = (typeof enabledNavItems)[number]

export const TOPBAR_NAV_ITEMS: ReadonlyArray<NavItem> = enabledNavItems

export const TOPBAR_ROUTE_ORDER = TOPBAR_NAV_ITEMS.map((item) => item.href)
