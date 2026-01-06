export type SiteFeature = 'store' | 'lab' | 'login'
export type NavLabelKey = 'navHome' | 'navStore' | 'navLab' | 'navLogin'
export type NavItem = { href: string; labelKey: NavLabelKey; feature?: SiteFeature }

export const siteBrand = {
  name: 'Prometheus',
  product: 'Binary Fragment Platform',
  tagline: 'Binary-first rendering, fragment-native delivery.',
  metaDescription:
    'Binary-first rendering pipeline with fragment-addressable delivery, edge-ready caching, and zero-hydration UX.',
  themeColor: '#f97316'
}

export const siteFeatures: Record<SiteFeature, boolean> = {
  store: true,
  lab: true,
  login: true
}

export const navItems: ReadonlyArray<NavItem> = [
  { href: '/', labelKey: 'navHome' },
  { href: '/store', labelKey: 'navStore', feature: 'store' },
  { href: '/lab', labelKey: 'navLab', feature: 'lab' },
  { href: '/login', labelKey: 'navLogin', feature: 'login' }
]

const buildEnabledNav = () =>
  navItems.filter((item) => {
    if (!item.feature) return true
    return siteFeatures[item.feature] !== false
  })

export const enabledNavItems = buildEnabledNav()
export const enabledRouteOrder = enabledNavItems.map((item) => item.href)
