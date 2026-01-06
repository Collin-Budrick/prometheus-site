declare module 'speculation-rules' {
  export type SpeculationRule = {
    source?: string
    urls?: string[]
  }

  export type SpeculationRulesProps = {
    prerenderRules?: SpeculationRule[]
    prefetchRules?: SpeculationRule[]
  }
}
