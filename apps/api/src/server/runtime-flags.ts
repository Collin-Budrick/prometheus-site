const truthyValues = new Set(['1', 'true', 'yes'])

export const shouldRunMigrations = (rawValue: string | undefined) => {
  const normalized = rawValue?.trim().toLowerCase() ?? ''
  if (normalized === '') return false
  return truthyValues.has(normalized)
}

export const isWebTransportEnabled = (rawValue: string | undefined) => {
  const normalized = rawValue?.trim().toLowerCase() ?? ''
  if (normalized === '') return false
  return truthyValues.has(normalized)
}
