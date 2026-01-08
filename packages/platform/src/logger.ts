import {
  configureSync,
  defaultConsoleFormatter,
  getConfig,
  getConsoleSink,
  getLogger,
  jsonLinesFormatter,
  type LogLevel,
  type Logger
} from '@logtape/logtape'

export type PlatformLogger = Logger

type LogFormat = 'json' | 'pretty'

const getRuntimeEnv = () => {
  if (typeof process !== 'undefined' && typeof process.env === 'object') {
    return process.env as Record<string, string | undefined>
  }

  if (typeof import.meta !== 'undefined') {
    const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    if (metaEnv) return metaEnv
  }

  return {} as Record<string, string | undefined>
}

const resolveLogLevel = (value: string | undefined): LogLevel => {
  const normalized = value?.trim().toLowerCase()
  switch (normalized) {
    case 'trace':
      return 'trace'
    case 'debug':
      return 'debug'
    case 'info':
      return 'info'
    case 'warn':
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    case 'fatal':
      return 'fatal'
    default:
      return 'info'
  }
}

const resolveLogFormat = (value: string | undefined, isBrowser: boolean): LogFormat => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'json' || normalized === 'pretty') return normalized
  return isBrowser ? 'pretty' : 'json'
}

const configureLogTape = () => {
  if (getConfig()) return

  const env = getRuntimeEnv()
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const level = resolveLogLevel(env.LOG_LEVEL)
  const format = resolveLogFormat(env.LOG_FORMAT, isBrowser)
  const formatter = format === 'json' ? jsonLinesFormatter : defaultConsoleFormatter

  configureSync({
    sinks: {
      console: getConsoleSink({ formatter })
    },
    loggers: [
      {
        category: [],
        sinks: ['console'],
        lowestLevel: level
      },
      {
        category: ['logtape', 'meta'],
        sinks: ['console'],
        lowestLevel: 'error'
      }
    ]
  })
}

const parseScope = (scope: string) => scope.split(':').map((entry) => entry.trim()).filter(Boolean)

export const createLogger = (scope = ''): PlatformLogger => {
  configureLogTape()
  const category = parseScope(scope)
  if (category.length === 0) {
    return getLogger()
  }
  return getLogger(category)
}
