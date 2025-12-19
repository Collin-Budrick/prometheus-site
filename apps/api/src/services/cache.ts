import { createClient } from '@valkey/client'

const valkeyOptions = {
  socket: {
    host: process.env.VALKEY_HOST ?? 'localhost',
    port: Number.parseInt(process.env.VALKEY_PORT ?? '6379', 10)
  }
}

const MAX_CONNECT_ATTEMPTS = 5
const BASE_BACKOFF_MS = 200

export const valkey = createClient(valkeyOptions)
let cacheReady = false

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const isValkeyReady = () => cacheReady && valkey.isOpen

export async function connectValkey() {
  if (valkey.isOpen) {
    cacheReady = true
    return
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      await valkey.connect()
      cacheReady = valkey.isOpen
      console.log('Valkey connected')
      return
    } catch (error) {
      lastError = error
      cacheReady = false
      console.error(`Valkey connection attempt ${attempt} failed`, error)
      if (attempt === MAX_CONNECT_ATTEMPTS) {
        throw new Error(`Valkey connection failed after ${MAX_CONNECT_ATTEMPTS} attempts`, {
          cause: lastError
        })
      }

      const backoff = BASE_BACKOFF_MS * attempt
      await wait(backoff)
    }
  }
}
