import { afterEach, describe, expect, it } from 'bun:test'
import { isNativeSQLiteAvailable, openNativeSQLite, withNativeSQLite } from './sqlite'

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
})

describe('native sqlite bridge', () => {
  it('returns unavailable outside native runtime', async () => {
    const available = await isNativeSQLiteAvailable()
    expect(available).toBe(false)

    const db = await openNativeSQLite({ database: 'app.db' })
    expect(db).toBeNull()
  })

  it('returns null task result when bridge is unavailable', async () => {
    const result = await withNativeSQLite({ database: 'cache.db' }, async () => {
      return 1
    })
    expect(result).toBeNull()
  })
})
