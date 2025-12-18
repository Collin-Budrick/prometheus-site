export type SpeculationRuleCondition = { and: Record<string, unknown>[] }

export type SpeculationListRule = {
  source: 'list'
  urls: string[]
}

export type SpeculationDocumentRule = {
  source: 'document'
  where: SpeculationRuleCondition
  eagerness?: 'conservative' | 'moderate' | 'eager'
}

export type SpeculationRules = {
  prefetch?: (SpeculationListRule | SpeculationDocumentRule)[]
  prerender?: SpeculationListRule[]
}

export const conservativeViewportRules: SpeculationRules = {
  prefetch: [
    {
      source: 'document',
      where: {
        and: [
          { href_matches: '^/[^#?]*$' },
          { not: { selector_matches: '[rel~=nofollow], [data-speculate="false"]' } }
        ]
      },
      eagerness: 'moderate'
    }
  ],
  prerender: []
}

export const mergeSpeculationRules = (
  ...ruleSets: (SpeculationRules | null | undefined)[]
): SpeculationRules | null => {
  const merged: SpeculationRules = {
    prefetch: [],
    prerender: []
  }

  ruleSets.forEach((rules) => {
    if (!rules) return
    if (rules.prefetch?.length) merged.prefetch?.push(...rules.prefetch)
    if (rules.prerender?.length) merged.prerender?.push(...rules.prerender)
  })

  if (!merged.prefetch?.length && !merged.prerender?.length) return null

  if (!merged.prefetch?.length) delete merged.prefetch
  if (!merged.prerender?.length) delete merged.prerender

  return merged
}
