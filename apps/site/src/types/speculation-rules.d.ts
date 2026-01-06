declare module 'speculation-rules' {
  export type SpeculationPrefetchRule = {
    source?: 'list' | 'document'
    urls: string[]
    requires?: string[]
    referrer_policy?: string
  }

  export type SpeculationPrerenderRule = {
    source?: 'list' | 'document'
    where?: Record<string, unknown>
    href_matches?: string
  }

  export interface SpeculationRulesProps {
    prerenderRules?: SpeculationPrerenderRule[]
    prefetchRules?: SpeculationPrefetchRule[]
  }

  const Speculationrules: (props: SpeculationRulesProps) => unknown
  export default Speculationrules
}
