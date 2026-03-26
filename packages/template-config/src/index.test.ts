import { describe, expect, it } from 'bun:test'
import {
  collectTemplateBundleDependencyGraph,
  collectTemplateEnvOwnership,
  collectTemplateRouteOwnership,
  resolveTemplateFeatures,
  templatePresetDescriptors,
  templatePresetIds
} from './index.ts'

describe('template preset descriptors', () => {
  it('includes the expanded starter presets', () => {
    expect(templatePresetIds).toEqual(['full', 'core', 'marketing', 'saas', 'commerce', 'community'])
    expect(templatePresetDescriptors.marketing.runtime).toBe('site-only')
    expect(templatePresetDescriptors.community.runtime).toBe('full-stack')
  })

  it('resolves site-only and realtime preset ownership correctly', () => {
    const marketing = resolveTemplateFeatures({ PROMETHEUS_TEMPLATE_PRESET: 'marketing' })
    const community = resolveTemplateFeatures({ PROMETHEUS_TEMPLATE_PRESET: 'community' })

    expect(marketing.enabledFeatureIds).toEqual(['demo-home', 'pwa'])
    expect(marketing.composeProfiles).toEqual([])
    expect(collectTemplateRouteOwnership(marketing).map((entry) => entry.route)).toEqual(['/', '/offline'])

    expect(community.enabledFeatureIds).toEqual(
      expect.arrayContaining(['auth', 'messaging', 'account', 'demo-home', 'realtime', 'pwa'])
    )
    expect(community.composeProfiles).toEqual(['realtime'])
  })
})

describe('template ownership collectors', () => {
  it('emits bundle dependency edges for auth-backed bundles', () => {
    expect(collectTemplateBundleDependencyGraph()).toEqual(
      expect.arrayContaining([
        { from: 'account', to: 'auth' },
        { from: 'messaging', to: 'auth' },
        { from: 'store', to: 'auth' }
      ])
    )
  })

  it('marks secret env ownership in the generated report surface', () => {
    expect(collectTemplateEnvOwnership()).toEqual(
      expect.arrayContaining([
        {
          envKey: 'AUTH_BOOTSTRAP_PRIVATE_KEY',
          bundleIds: ['auth'],
          requiredByDefaultIn: ['commerce', 'community', 'core', 'full', 'saas'],
          secret: true
        }
      ])
    )
  })
})
