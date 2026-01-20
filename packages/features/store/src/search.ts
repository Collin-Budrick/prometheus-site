import { sql } from 'drizzle-orm'
import type { ValkeyClientType } from '@valkey/client'
import type { DatabaseClient } from '@platform/db'
import type { StoreItemPayload, StoreItemRowSnapshot, StoreItemsTable } from './realtime'

export type StoreSearchHit = {
  id: number
  score?: number
}

export type StoreSearchResult = {
  total: number
  hits: StoreSearchHit[]
}

export const storeSearchIndex = 'store:search'
export const storeSearchKeyPrefix = 'store:item:'
export const storeSearchVectorField = 'embedding'
export const storeSearchVectorDims = 24

const buildStoreSearchKey = (id: number) => `${storeSearchKeyPrefix}${id}`

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}

const isUnknownIndexError = (error: unknown) => {
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes('unknown index') ||
    message.includes('no such index') ||
    message.includes('index with name') ||
    message.includes('not found')
  )
}

const isDropIndexArgError = (error: unknown) => {
  const message = toErrorMessage(error).toLowerCase()
  return message.includes('wrong number of arguments') || message.includes('syntax error')
}

const isUnsupportedCommand = (error: unknown) => {
  const message = toErrorMessage(error).toLowerCase()
  return message.includes('unknown command') || message.includes('unsupported')
}


const isMissingTableError = (error: unknown) => {
  const candidates: Array<{ code?: string; message?: string }> = []
  let current: unknown = error
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      candidates.push(current as { code?: string; message?: string })
      const cause = (current as { cause?: unknown }).cause
      if (!cause || cause === current) break
      current = cause
    } else {
      break
    }
  }

  return candidates.some((record) => {
    if (record.code === '42P01') return true
    const message = record.message?.toLowerCase() ?? ''
    return message.includes('relation') && message.includes('does not exist')
  })
}

const escapeTagValue = (value: string) => value.replace(/[-[\]{}()*+?.,\\^$|#:@\s]/g, '\\$&')

const tokenize = (value: string) => {
  const matches = value.toLowerCase().match(/[\p{L}\p{N}]+/gu)
  if (!matches) return []
  return matches.filter((entry) => entry.length > 0)
}

const serializeTags = (value: string) => {
  const tokens = tokenize(value)
  if (!tokens.length) return ''
  const expanded = new Set<string>()
  tokens.forEach((token) => {
    for (let i = 1; i <= token.length; i += 1) {
      expanded.add(token.slice(0, i))
    }
  })
  return Array.from(expanded).join(',')
}

const buildFilterExpression = (value: string) => {
  const trimmed = value.trim()
  const terms = tokenize(trimmed)
  if (!terms.length) {
    return trimmed ? '@name:{__no_match__}' : '*'
  }
  if (terms.length === 1) {
    return `@name:{${escapeTagValue(terms[0])}}`
  }
  return `@name:{${terms.map((term) => escapeTagValue(term)).join('|')}}`
}

const hashToken = (value: string) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const buildEmbedding = (value: string) => {
  const vector = new Float32Array(storeSearchVectorDims)
  const tokens = tokenize(value)
  tokens.forEach((token) => {
    const index = hashToken(token) % storeSearchVectorDims
    vector[index] += 1
  })
  let norm = 0
  for (let i = 0; i < vector.length; i += 1) {
    norm += vector[i] * vector[i]
  }
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vector.length; i += 1) {
      vector[i] /= norm
    }
  }
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
}

const createStoreSearchIndex = async (client: ValkeyClientType) => {
  return client.sendCommand([
    'FT.CREATE',
    storeSearchIndex,
    'ON',
    'HASH',
    'PREFIX',
    '1',
    storeSearchKeyPrefix,
    'SCHEMA',
    storeSearchVectorField,
    'VECTOR',
    'HNSW',
    '6',
    'TYPE',
    'FLOAT32',
    'DIM',
    String(storeSearchVectorDims),
    'DISTANCE_METRIC',
    'COSINE',
    'name',
    'TAG',
    'SEPARATOR',
    ',',
    'id',
    'NUMERIC',
    'price',
    'NUMERIC'
  ])
}

export const ensureStoreSearchIndex = async (client: ValkeyClientType) => {
  if (typeof client.sendCommand !== 'function') {
    console.warn('Store search unavailable: Valkey client missing sendCommand')
    return false
  }
  try {
    await client.sendCommand(['FT.INFO', storeSearchIndex])
    return true
  } catch (error) {
    if (isUnsupportedCommand(error)) {
      console.warn('Store search unavailable: Valkey Search module not detected')
      return false
    }
    if (!isUnknownIndexError(error)) {
      console.warn('Store search index check failed', error)
      return false
    }
  }

  try {
    await createStoreSearchIndex(client)
    return true
  } catch (error) {
    if (!toErrorMessage(error).toLowerCase().includes('index already exists')) {
      console.warn('Store search index creation failed', error)
      return false
    }
    return true
  }
}

export const rebuildStoreSearchIndex = async (options: {
  db: DatabaseClient['db']
  storeItemsTable: StoreItemsTable
  valkey: ValkeyClientType
  isValkeyReady: () => boolean
}) => {
  if (!options.isValkeyReady()) return false
  if (typeof options.valkey.sendCommand !== 'function' || typeof options.valkey.multi !== 'function') {
    console.warn('Store search unavailable: Valkey client missing search commands')
    return false
  }

  try {
    await options.valkey.sendCommand(['FT.DROPINDEX', storeSearchIndex, 'DD'])
  } catch (error) {
    if (isUnknownIndexError(error) || isUnsupportedCommand(error)) {
      // ignore missing index or module
    } else if (isDropIndexArgError(error)) {
      try {
        await options.valkey.sendCommand(['FT.DROPINDEX', storeSearchIndex])
      } catch (fallbackError) {
        if (!isUnknownIndexError(fallbackError) && !isUnsupportedCommand(fallbackError)) {
          console.warn('Store search index reset failed', fallbackError)
        }
      }
    } else {
      console.warn('Store search index reset failed', error)
    }
  }

  const ready = await ensureStoreSearchIndex(options.valkey)
  if (!ready) return false

  let tableExists = true
  try {
    const tableCheck = await options.db
      .execute<{ exists: string | null }>(sql`select to_regclass('store_items') as exists`)
      .execute()
    tableExists = Boolean(tableCheck[0]?.exists)
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn('Store search rebuild skipped: store_items table missing')
      return false
    }
  }

  if (!tableExists) {
    console.warn('Store search rebuild skipped: store_items table missing')
    return false
  }

  let rows: StoreItemRowSnapshot[]
  try {
    rows = (await options.db.select().from(options.storeItemsTable)) as StoreItemRowSnapshot[]
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn('Store search rebuild skipped: store_items table missing')
      return false
    }
    throw error
  }
  if (!rows.length) return true

  const pipeline = options.valkey.multi()
  rows.forEach((row) => {
    const nameValue = row.name ?? ''
    const priceValue = typeof row.price === 'number' || typeof row.price === 'string' ? String(row.price) : ''
    pipeline.hSet(buildStoreSearchKey(row.id), {
      id: String(row.id),
      name: serializeTags(nameValue),
      price: priceValue,
      [storeSearchVectorField]: buildEmbedding(nameValue)
    })
  })
  await pipeline.exec()
  return true
}

export const upsertStoreSearchDocument = async (client: ValkeyClientType, item: StoreItemPayload) => {
  if (typeof client.hSet !== 'function') return
  const nameValue = item.name ?? ''
  await client.hSet(buildStoreSearchKey(item.id), {
    id: String(item.id),
    name: serializeTags(nameValue),
    price: String(item.price),
    [storeSearchVectorField]: buildEmbedding(nameValue)
  })
}

export const removeStoreSearchDocument = async (client: ValkeyClientType, id: number) => {
  if (!Number.isFinite(id)) return
  await client.del(buildStoreSearchKey(id))
}

export const searchStoreIndex = async (
  client: ValkeyClientType,
  query: string,
  options: { limit: number; offset: number }
): Promise<StoreSearchResult> => {
  if (typeof client.sendCommand !== 'function') {
    return { total: 0, hits: [] }
  }
  const filter = buildFilterExpression(query)

  const runSearch = async (args: Array<string | Buffer>) => {
    const reply = await client.sendCommand(args)
    if (!Array.isArray(reply) || reply.length === 0) {
      return { total: 0, hits: [] as StoreSearchHit[] }
    }

    const total = Number(reply[0]) || 0
    const hits: StoreSearchHit[] = []
    const entries = reply.slice(1)

    const isScoreValue = (value: unknown) =>
      typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))
    const looksLikePairs = entries.length % 2 === 0 && isScoreValue(entries[1])

    if (looksLikePairs) {
      for (let i = 0; i < entries.length; i += 2) {
        const key = entries[i]
        const scoreRaw = entries[i + 1]
        if (typeof key !== 'string') continue
        const idValue = key.startsWith(storeSearchKeyPrefix) ? key.slice(storeSearchKeyPrefix.length) : key
        const id = Number(idValue)
        if (!Number.isFinite(id)) continue
        const score = Number(scoreRaw)
        hits.push({ id, score: Number.isFinite(score) ? score : undefined })
      }
    } else {
      entries.forEach((entry) => {
        if (typeof entry !== 'string') return
        const idValue = entry.startsWith(storeSearchKeyPrefix) ? entry.slice(storeSearchKeyPrefix.length) : entry
        const id = Number(idValue)
        if (!Number.isFinite(id)) return
        hits.push({ id })
      })
    }

    return { total, hits }
  }

  const k = Math.max(1, options.limit + options.offset)
  const queryVector = buildEmbedding(query)
  const q = `${filter}=>[KNN ${k} @${storeSearchVectorField} $query_vector]`

  try {
    return await runSearch([
      'FT.SEARCH',
      storeSearchIndex,
      q,
      'NOCONTENT',
      'LIMIT',
      String(options.offset),
      String(options.limit),
      'DIALECT',
      '2',
      'PARAMS',
      '2',
      'query_vector',
      queryVector
    ])
  } catch (error) {
    const message = toErrorMessage(error).toLowerCase()
    if (message.includes('missing `=>`') || message.includes('missing =>') || message.includes('invalid filter format')) {
      console.warn('Store search query rejected by Valkey parser', error)
      return { total: 0, hits: [] }
    }
    throw error
  }
}
