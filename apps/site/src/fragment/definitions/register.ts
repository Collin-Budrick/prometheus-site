import {
  clearFragmentDefinitions,
  clearFragmentPlanOverrides,
  setFragmentPlanBuilder
} from '@core/fragment/registry'
import { hasTemplateFeature, type ResolvedTemplateFeatures } from '@prometheus/template-config'
import { registerChatFragmentDefinitions } from './chat'
import { registerHomeServerFragmentDefinitions } from './home.server'
import { registerStoreFragmentDefinitions } from './store'

type TemplateSelection = Pick<ResolvedTemplateFeatures, 'features' | 'homeMode'>

export const registerSiteFragmentBundles = (options: { template?: TemplateSelection } = {}) => {
  const template = options.template

  clearFragmentDefinitions()
  clearFragmentPlanOverrides()
  setFragmentPlanBuilder(null)

  registerHomeServerFragmentDefinitions({ template })

  if (!template || hasTemplateFeature(template, 'store')) {
    registerStoreFragmentDefinitions()
  }

  if (!template || hasTemplateFeature(template, 'messaging')) {
    registerChatFragmentDefinitions()
  }
}
