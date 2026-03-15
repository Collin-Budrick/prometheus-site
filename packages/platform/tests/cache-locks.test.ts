import { describe, expect, it } from 'bun:test'
import { releaseCacheLock, writeCache } from '@platform/cache-helpers'
import { createFragmentStore } from '@platform/server/fragments'

type TestCacheClient = {
  client: {
    commandOptions: (options: Record<string, unknown>) => Record<string, unknown>
    get: (...args: unknown[]) => Promise<string | null>
    del: (...args: unknown[]) => Promise<number>
    set: (...args: unknown[]) => Promise<string | null>
  }
  isReady: () => boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

const createFailingCacheClient = (error: Error): TestCacheClient => ({
  client: {
    commandOptions: (options) => options,
    async get() {
      throw error
    },
    async del() {
      return 0
    }
    ,
    async set() {
      throw error
    }
  },
  isReady: () => true,
  connect: async () => {},
  disconnect: async () => {}
})

const captureWarnings = async (runner: () => Promise<void>) => {
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }

  try {
    await runner()
  } finally {
    console.warn = originalWarn
  }

  return warnings
}

describe('fragment cache lock release logging', () => {
  it('suppresses abort-style errors during best-effort lock cleanup', async () => {
    const abortError = new Error('The command was aborted')
    abortError.name = 'AbortError'
    const cacheClient = createFailingCacheClient(abortError)

    const warnings = await captureWarnings(async () => {
      await releaseCacheLock(cacheClient as never, 'fragment:lock:test', 'token')
      const store = createFragmentStore(cacheClient as never)
      await store.releaseLock('fragment:lock:test', 'token')
    })

    expect(warnings).toHaveLength(0)
  })

  it('still warns on non-abort lock cleanup failures', async () => {
    const cacheClient = createFailingCacheClient(new Error('boom'))

    const warnings = await captureWarnings(async () => {
      await releaseCacheLock(cacheClient as never, 'fragment:lock:test', 'token')
      const store = createFragmentStore(cacheClient as never)
      await store.releaseLock('fragment:lock:test', 'token')
    })

    expect(warnings).toHaveLength(2)
    expect(warnings.every(([message]) => String(message).includes('Failed to release fragment cache lock:'))).toBe(true)
  })

  it('suppresses abort-style errors during best-effort cache writes', async () => {
    const abortError = new Error('The command was aborted')
    abortError.name = 'AbortError'
    const cacheClient = createFailingCacheClient(abortError)

    const warnings = await captureWarnings(async () => {
      await writeCache(cacheClient as never, 'fragment:cache:test', { ok: true }, 60)
    })

    expect(warnings).toHaveLength(0)
  })

  it('still warns on non-abort cache write failures', async () => {
    const cacheClient = createFailingCacheClient(new Error('boom'))

    const warnings = await captureWarnings(async () => {
      await writeCache(cacheClient as never, 'fragment:cache:test', { ok: true }, 60)
    })

    expect(warnings).toHaveLength(1)
    expect(String(warnings[0]?.[0])).toContain('Failed to write cache entry')
  })
})
