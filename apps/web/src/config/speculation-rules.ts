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
  prerender?: (SpeculationListRule | SpeculationDocumentRule)[]
}

export const conservativeViewportRules: SpeculationRules = {
  prerender: [
    {
      source: 'document',
      where: {
        and: [
          { selector_matches: 'a[href^="/"]:not([href*="#"]):not([href*="?"])' },
          { not: { selector_matches: '[rel~=nofollow], [data-speculate="false"]' } }
        ]
      },
      eagerness: 'moderate'
    }
  ]
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

export const slowSpeculationConnectionTypes = ['slow-2g', '2g', '3g'] as const
const slowSpeculationConnectionTypesScript = JSON.stringify(slowSpeculationConnectionTypes)

export const buildSpeculationRulesGuard = () =>
  `(()=>{const scripts=document.querySelectorAll('script[type="speculationrules"]');if(!scripts.length)return;const connection=navigator.connection;const effectiveType=connection?.effectiveType;const isSlow=Boolean(connection?.saveData)||${slowSpeculationConnectionTypesScript}.includes(effectiveType||'');if(isSlow||!HTMLScriptElement.supports?.('speculationrules')){scripts.forEach((script)=>script.remove());}})();`
