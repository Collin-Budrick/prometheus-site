import { enabledNavItems, type NavItem } from '../config'
import type { UiCopy } from './ui-copy'

export type SiteNavItem = (typeof enabledNavItems)[number]

export const TOPBAR_NAV_ITEMS = enabledNavItems as ReadonlyArray<
  NavItem & { labelKey: keyof UiCopy }
>

export const TOPBAR_ROUTE_ORDER = TOPBAR_NAV_ITEMS.map((item) => item.href)

