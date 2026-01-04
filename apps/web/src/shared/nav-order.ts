import type { UiCopy } from './ui-copy'

export const TOPBAR_NAV_ITEMS = [
  { href: '/', labelKey: 'navHome' },
  { href: '/store', labelKey: 'navStore' },
  { href: '/lab', labelKey: 'navLab' },
  { href: '/login', labelKey: 'navLogin' }
] as const satisfies ReadonlyArray<{ href: string; labelKey: keyof UiCopy }>

export const TOPBAR_ROUTE_ORDER = TOPBAR_NAV_ITEMS.map(
  (item) => item.href
) as ReadonlyArray<(typeof TOPBAR_NAV_ITEMS)[number]['href']>
