type StaticShellPerformanceEnv = ImportMeta & {
  env?: {
    DEV?: boolean
  }
}

type StaticShellPerformanceTarget = typeof globalThis & {
  __PROM_STATIC_SHELL_DEBUG_PERF__?: boolean
}

export type PromPerfDebugRouteTransition = {
  from: string
  to: string
  startAt: number | null
  endAt: number | null
}

export type PromPerfDebugState = {
  staticShellBootstrapAt: number | null
  workerPrewarmAt: number | null
  firstFragmentCommitAt: number | null
  firstActionableControlAt: number | null
  routeTransitions: PromPerfDebugRouteTransition[]
}

type PromPerfDebugTarget = Window & {
  __PROM_PERF_DEBUG__?: PromPerfDebugState
}

export const PROM_PERF_DEBUG_MARK_NAMES = {
  staticShellBootstrapStart: 'prom:perf:static-shell-bootstrap-start',
  staticShellBootstrapEnd: 'prom:perf:static-shell-bootstrap-end',
  workerPrewarm: 'prom:perf:worker-prewarm',
  firstFragmentCommit: 'prom:perf:first-fragment-commit',
  firstActionableControl: 'prom:perf:first-actionable-control',
  routeTransitionStart: 'prom:perf:route-transition-start',
  routeTransitionEnd: 'prom:perf:route-transition-end'
} as const

const PROM_USER_TIMING_DEBUG_ALIASES: Partial<
  Record<
    string,
    Array<{
      field: Exclude<keyof PromPerfDebugState, 'routeTransitions'>
      markName: string
    }>
  >
> = {
  'prom:home:worker-instantiated': [
    {
      field: 'workerPrewarmAt',
      markName: PROM_PERF_DEBUG_MARK_NAMES.workerPrewarm
    }
  ],
  'prom:home:first-anchor-patch-applied': [
    {
      field: 'firstFragmentCommitAt',
      markName: PROM_PERF_DEBUG_MARK_NAMES.firstFragmentCommit
    }
  ],
  'prom:home:lcp-release': [
    {
      field: 'firstActionableControlAt',
      markName: PROM_PERF_DEBUG_MARK_NAMES.firstActionableControl
    }
  ]
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

const createPromPerfDebugState = (): PromPerfDebugState => ({
  staticShellBootstrapAt: null,
  workerPrewarmAt: null,
  firstFragmentCommitAt: null,
  firstActionableControlAt: null,
  routeTransitions: []
})

const getPromPerfNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

const canUseUserTiming = () =>
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function'

const ensurePromPerfDebugState = () => {
  if (!allowDetailedStaticShellPerformance()) {
    return null
  }

  if (typeof window === 'undefined') {
    return null
  }

  const windowRef = window as PromPerfDebugTarget
  const current = windowRef.__PROM_PERF_DEBUG__
  if (current) {
    return current
  }

  const next = createPromPerfDebugState()
  windowRef.__PROM_PERF_DEBUG__ = next
  return next
}

export const markStaticShellPerformance = (name: string) => {
  if (!allowDetailedStaticShellPerformance()) {
    return
  }

  if (!canUseUserTiming()) {
    return
  }

  performance.mark(name)
}

export const recordPromPerfTimestamp = (
  field: Exclude<keyof PromPerfDebugState, 'routeTransitions'>,
  markName: string
) => {
  const state = ensurePromPerfDebugState()
  if (!state) {
    return null
  }

  if (state[field] !== null) {
    return state[field]
  }

  const at = getPromPerfNow()
  state[field] = at
  markStaticShellPerformance(markName)
  return at
}

export const startPromPerfRouteTransition = (from: string, to: string) => {
  const state = ensurePromPerfDebugState()
  if (!state) {
    return null
  }

  const transition: PromPerfDebugRouteTransition = {
    from,
    to,
    startAt: getPromPerfNow(),
    endAt: null
  }
  state.routeTransitions.push(transition)
  markStaticShellPerformance(PROM_PERF_DEBUG_MARK_NAMES.routeTransitionStart)
  return transition
}

export const finishPromPerfRouteTransition = (
  transition: PromPerfDebugRouteTransition | null
) => {
  if (!transition || transition.endAt !== null) {
    return
  }

  transition.endAt = getPromPerfNow()
  markStaticShellPerformance(PROM_PERF_DEBUG_MARK_NAMES.routeTransitionEnd)
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
  PROM_USER_TIMING_DEBUG_ALIASES[name]?.forEach(({ field, markName }) => {
    recordPromPerfTimestamp(field, markName)
  })
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
