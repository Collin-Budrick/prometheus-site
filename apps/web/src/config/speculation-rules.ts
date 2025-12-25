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
          {
            selector_matches:
              'a[href^="/"]:not([href^="//"]):not([href^="/@fs/"]):not([href^="/node_modules/"]):not([href*="#"])'
          },
          { not: { selector_matches: '[rel~=nofollow], [data-speculate="false"]' } }
        ]
      },
      eagerness: 'eager'
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
  `(()=>{const scripts=document.querySelectorAll('script[data-speculationrules]');if(!scripts.length)return;const supports=HTMLScriptElement.supports?.('speculationrules');const isSecure=window.isSecureContext===true;const connection=navigator.connection;const effectiveType=connection?.effectiveType;const isSlow=Boolean(connection?.saveData)||${slowSpeculationConnectionTypesScript}.includes(effectiveType||'');const prefersReducedData=window.matchMedia?.('(prefers-reduced-data: reduce)')?.matches;if(!supports||!isSecure||isSlow||prefersReducedData){scripts.forEach((script)=>script.remove());return;}scripts.forEach((script)=>{const payload=script.textContent;if(!payload){script.remove();return;}const specScript=document.createElement('script');specScript.type='speculationrules';if(script.dataset.source){specScript.dataset.source=script.dataset.source;}specScript.text=payload;(document.head||document.documentElement).appendChild(specScript);script.remove();});})();`
