import {
  collectTemplateNavItems,
  templateBranding,
  type TemplateFeatureId,
  type TemplateNavItem,
  type TemplateNavLabelKey
} from '@prometheus/template-config'
import { isSiteFeatureEnabled, siteTemplateConfig, siteTemplateFeatures } from './template-features'

export type SiteFeature = TemplateFeatureId
export type NavLabelKey = TemplateNavLabelKey
export type NavItem = TemplateNavItem

export const siteBrand = {
  name: templateBranding.site.name,
  product: templateBranding.site.product,
  tagline: templateBranding.site.tagline,
  metaDescription: templateBranding.site.metaDescription,
  themeColor: templateBranding.site.themeColor
}

export const siteFeatures = siteTemplateFeatures

export const navItems: ReadonlyArray<NavItem> = collectTemplateNavItems(siteTemplateConfig)
export const authNavItems: ReadonlyArray<NavItem> = collectTemplateNavItems(siteTemplateConfig, {
  authenticated: true
})

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
