export const markStaticShellPerformance = (name: string) => {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
    return
  }

  performance.mark(name)
}

export const measureStaticShellPerformance = (
  name: string,
  startMark: string,
  endMark: string
) => {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') {
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

  markStaticShellPerformance(startMark)

  return () => {
    markStaticShellPerformance(endMark)
    measureStaticShellPerformance(name, startMark, endMark)
  }
}
