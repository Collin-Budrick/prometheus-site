const truthyValues = new Set(['1', 'true', 'yes'])

export const shouldRunMigrations = (rawValue: string | undefined) => {
  if (!rawValue) return false

  const normalized = rawValue.trim().toLowerCase()
  return truthyValues.has(normalized)
}

export const isWebTransportEnabled = (rawValue: string | undefined) => {
  if (!rawValue) return false

  const normalized = rawValue.trim().toLowerCase()
  return truthyValues.has(normalized)
}
