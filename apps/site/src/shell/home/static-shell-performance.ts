type StaticShellPerformanceEnv = ImportMeta & {
  env?: {
    DEV?: boolean
  }
}

type StaticShellPerformanceTarget = typeof globalThis & {
  __PROM_STATIC_SHELL_DEBUG_PERF__?: boolean
}

const allowDetailedStaticShellPerformance = () => {
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as StaticShellPerformanceEnv).env
      : undefined

  if (env?.DEV) {
    return true
  }

  return Boolean(
    (globalThis as StaticShellPerformanceTarget).__PROM_STATIC_SHELL_DEBUG_PERF__
  )
}

const canUseUserTiming = () =>
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function'

export const markStaticShellPerformance = (name: string) => {
  if (!allowDetailedStaticShellPerformance()) {
    return
  }

  if (!canUseUserTiming()) {
    return
  }

  performance.mark(name)
}

export const measureStaticShellPerformance = (
  name: string,
  startMark: string,
  endMark: string
) => {
  if (!allowDetailedStaticShellPerformance()) {
    return
  }

  if (!canUseUserTiming()) {
    return
  }

  try {
    performance.measure(name, startMark, endMark)
  } catch {
    // Ignore missing mark failures on partial startup paths.
  }
}

export const markStaticShellUserTiming = (name: string) => {
  if (!canUseUserTiming()) {
    return
  }

  performance.mark(name)
}

export const measureStaticShellUserTiming = (
  name: string,
  startMark: string,
  endMark: string
) => {
  if (!canUseUserTiming()) {
    return
  }

  try {
    performance.measure(name, startMark, endMark)
  } catch {
    // Ignore missing mark failures on partial startup paths.
  }
}

let nextStaticShellPerformanceMeasureId = 1

export const startStaticShellPerformanceMeasure = (name: string) => {
  const measureId = `${name}:${nextStaticShellPerformanceMeasureId++}`
  const startMark = `${measureId}:start`
  const endMark = `${measureId}:end`

  const enabled = allowDetailedStaticShellPerformance()
  if (enabled) {
    markStaticShellPerformance(startMark)
  }

  return () => {
    if (!enabled) {
      return
    }
    markStaticShellPerformance(endMark)
    measureStaticShellPerformance(name, startMark, endMark)
  }
}
