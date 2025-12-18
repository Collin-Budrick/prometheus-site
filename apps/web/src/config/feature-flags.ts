const toBoolean = (value: string | boolean | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  return value === '1' || value.toLowerCase() === 'true'
}

const defaultProd = (flag: string | boolean | undefined, prodFallback: boolean) =>
  toBoolean(flag, prodFallback && import.meta.env.PROD)

export const featureFlags = {
  speculationRules: defaultProd(import.meta.env.VITE_SPECULATION_RULES, true),
  viewTransitions: defaultProd(import.meta.env.VITE_ROUTE_VIEW_TRANSITIONS, true),
  partytown: defaultProd(import.meta.env.VITE_ENABLE_PARTYTOWN ?? import.meta.env.ENABLE_PARTYTOWN, false)
}
