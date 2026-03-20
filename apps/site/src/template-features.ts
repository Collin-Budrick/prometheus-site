import { hasTemplateFeature, type TemplateFeatureId } from '@prometheus/template-config'
import { appConfig } from './public-app-config'

export const siteTemplateConfig = appConfig.template

export const siteTemplateFeatures = siteTemplateConfig.features

export const isSiteFeatureEnabled = (featureId: TemplateFeatureId) =>
  hasTemplateFeature(siteTemplateConfig, featureId)
