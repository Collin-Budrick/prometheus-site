import type { TemplateFeatureId } from '@prometheus/template-config'
import { isSiteFeatureEnabled, siteTemplateFeatures } from './template-features'

export type SiteFeature = TemplateFeatureId
export type NavLabelKey =
  | 'navHome'
  | 'navStore'
  | 'navLab'
  | 'navLogin'
  | 'navProfile'
  | 'navChat'
  | 'navSettings'
  | 'navDashboard'
export type NavItem = { href: string; labelKey: NavLabelKey; feature?: SiteFeature }

export const siteBrand = {
  name: 'Prometheus',
  product: 'Binary Fragment Platform',
  tagline: 'Binary-first rendering, fragment-native delivery.',
  metaDescription:
    'Binary-first rendering pipeline with fragment-addressable delivery, edge-ready caching, and zero-hydration UX.',
  themeColor: '#f97316'
}

export const siteFeatures = siteTemplateFeatures

export const navItems: ReadonlyArray<NavItem> = [
  { href: '/', labelKey: 'navHome' },
  { href: '/store', labelKey: 'navStore', feature: 'store' },
  { href: '/lab', labelKey: 'navLab', feature: 'lab' },
  { href: '/login', labelKey: 'navLogin', feature: 'auth' }
]

export const authNavItems: ReadonlyArray<NavItem> = [
  { href: '/profile', labelKey: 'navProfile', feature: 'account' },
  { href: '/chat', labelKey: 'navChat', feature: 'messaging' },
  { href: '/settings', labelKey: 'navSettings', feature: 'account' },
  { href: '/dashboard', labelKey: 'navDashboard', feature: 'account' }
]

const buildEnabledNav = () =>
  navItems.filter((item) => {
    if (!item.feature) return true
    return isSiteFeatureEnabled(item.feature)
  })

const buildEnabledAuthNav = () =>
  authNavItems.filter((item) => {
    if (!item.feature) return true
    return isSiteFeatureEnabled(item.feature)
  })

export const enabledNavItems = buildEnabledNav()
export const enabledAuthNavItems = buildEnabledAuthNav()
export const enabledRouteOrder = enabledNavItems.map((item) => item.href)
