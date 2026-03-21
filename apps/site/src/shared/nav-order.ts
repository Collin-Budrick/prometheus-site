import { enabledAuthNavItems, enabledNavItems, type NavItem } from '../site-config'

export type SiteNavItem = (typeof enabledNavItems)[number]

export const TOPBAR_NAV_ITEMS: ReadonlyArray<NavItem> = enabledNavItems
export const AUTH_NAV_ITEMS: ReadonlyArray<NavItem> = enabledAuthNavItems

export const TOPBAR_ROUTE_ORDER = Array.from(
  new Set([...TOPBAR_NAV_ITEMS, ...AUTH_NAV_ITEMS].map((item) => item.href))
)
