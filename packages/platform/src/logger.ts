export type PlatformLogger = {
  debug: (message: string, meta?: unknown) => void
  info: (message: string, meta?: unknown) => void
  warn: (message: string, meta?: unknown) => void
  error: (message: string, meta?: unknown) => void
  child: (scope: string) => PlatformLogger
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const logToConsole = (level: LogLevel, scope: string, message: string, meta?: unknown) => {
  const prefix = scope ? `[${scope}]` : ''
  if (meta !== undefined) {
    console[level](`${prefix} ${message}`.trim(), meta)
    return
  }
  console[level](`${prefix} ${message}`.trim())
}

export const createLogger = (scope = ''): PlatformLogger => {
  const child = (nextScope: string) => createLogger(scope ? `${scope}:${nextScope}` : nextScope)

  return {
    debug: (message, meta) => logToConsole('debug', scope, message, meta),
    info: (message, meta) => logToConsole('info', scope, message, meta),
    warn: (message, meta) => logToConsole('warn', scope, message, meta),
    error: (message, meta) => logToConsole('error', scope, message, meta),
    child
  }
}
