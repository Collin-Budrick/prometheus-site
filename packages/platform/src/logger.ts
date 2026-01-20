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

const getRuntimeEnv = (): Record<string, string | undefined> => {
  if (typeof process !== 'undefined' && typeof process.env === 'object') {
    return process.env
  }

  const metaEnv = typeof import.meta !== 'undefined' ? Reflect.get(import.meta, 'env') : undefined
  if (metaEnv !== undefined && metaEnv !== null && typeof metaEnv === 'object') {
    const normalized: Record<string, string | undefined> = {}
    for (const key of Object.keys(metaEnv)) {
      const value = Reflect.get(metaEnv, key)
      if (typeof value === 'string') {
        normalized[key] = value
      } else if (typeof value === 'boolean') {
        normalized[key] = value ? 'true' : 'false'
      }
    }
    return normalized
  }

  return {}
}

const resolveLogLevel = (value: string | undefined): LogLevel => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === undefined || normalized === '') return 'info'
  const levels: Partial<Record<string, LogLevel>> = {
    trace: 'trace',
    debug: 'debug',
    info: 'info',
    warn: 'warning',
    warning: 'warning',
    error: 'error',
    fatal: 'fatal'
  }
  return levels[normalized] ?? 'info'
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
