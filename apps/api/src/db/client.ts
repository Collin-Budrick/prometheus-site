import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

type ConnectionMetrics = {
  attempts: number
  failures: number
  lastError?: string
  lastSuccessAt?: Date
}

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'prometheus'}:${process.env.POSTGRES_PASSWORD ?? 'secret'}@${
    process.env.POSTGRES_HOST ?? 'localhost'
  }:${process.env.POSTGRES_PORT ?? 5433}/${process.env.POSTGRES_DB ?? 'prometheus'}`

const ssl = process.env.POSTGRES_SSL === 'true' ? 'require' : false
const maxRetries = Number(process.env.DB_CONNECT_RETRIES ?? 5)
const baseDelayMs = Number(process.env.DB_CONNECT_BACKOFF_MS ?? 200)

const metrics: ConnectionMetrics = {
  attempts: 0,
  failures: 0
}

let isReady = false
let resolveReadiness: (() => void) | null = null
const readiness = new Promise<void>((resolve) => {
  resolveReadiness = resolve
})

export const pgClient = postgres(connectionString, { max: 5, ssl })
export const db = drizzle({ client: pgClient })

const sleep = (durationMs: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })

const markReady = () => {
  isReady = true
  resolveReadiness?.()
}

const attemptConnection = async () => {
  metrics.attempts += 1
  try {
    await pgClient`select 1`
    metrics.lastSuccessAt = new Date()
    metrics.lastError = undefined
    markReady()
    return true
  } catch (error) {
    metrics.failures += 1
    metrics.lastError = error instanceof Error ? error.message : String(error)
    return false
  }
}

const connectWithBackoff = async () => {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const connected = await attemptConnection()
    if (connected) return

    const delay = Math.min(baseDelayMs * 2 ** attempt, 5000)
    await sleep(delay)
  }
}

void connectWithBackoff()

export const getConnectionMetrics = (): ConnectionMetrics => ({ ...metrics })

export const waitForReadiness = () => readiness

export const isDbReady = () => isReady
