const truthyEnvValues = new Set(['1', 'true', 'yes', 'on'])

const isTruthyEnv = (value?: string | null) =>
  typeof value === 'string' && truthyEnvValues.has(value.trim().toLowerCase())

export const isStaticShellBuild = () => isTruthyEnv(process.env.PROMETHEUS_STATIC_SHELL_BUILD)
