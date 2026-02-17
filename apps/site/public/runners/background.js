const STORE_QUEUE_KEY = 'prom:bg:store-cart-queue:v1'
const STORE_CONFIG_KEY = 'prom:bg:store-config:v1'
const PREFETCH_CONFIG_KEY = 'prom:bg:prefetch-config:v1'
const PREFETCH_CACHE_KEY = 'prom:bg:prefetch-cache:v1'
const PREFETCH_CACHE_VERSION = 1
const PREFETCH_ENTRY_MAX_BYTES = 512 * 1024
const PREFETCH_CACHE_MAX_BYTES = 4 * 1024 * 1024
const PREFETCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24

const defaultPublicRoutes = ['/', '/store', '/lab', '/login', '/offline']
const defaultAuthRoutes = ['/chat', '/profile', '/settings', '/dashboard']
const defaultFragmentRoutes = ['/', '/store', '/lab', '/login', '/chat']

const isRecord = (value) => typeof value === 'object' && value !== null

const byteLength = (value) => {
  try {
    return new TextEncoder().encode(value).length
  } catch {
    return value.length
  }
}

const toString = (value) => (typeof value === 'string' ? value : '')

const normalizePath = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed === '/') return '/'
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return path.replace(/\/{2,}/g, '/')
}

const uniquePaths = (values) => {
  const seen = new Set()
  const normalized = []
  for (const value of values) {
    const path = normalizePath(value)
    if (!path || seen.has(path)) continue
    seen.add(path)
    normalized.push(path)
  }
  return normalized
}

const parseJson = (raw, fallback) => {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const getKvValue = (key) => {
  const reader = globalThis.CapacitorKV
  if (!reader || typeof reader.get !== 'function') return null
  try {
    const result = reader.get(key)
    if (!isRecord(result) || typeof result.value !== 'string') return null
    return result.value
  } catch {
    return null
  }
}

const setKvValue = (key, value) => {
  const writer = globalThis.CapacitorKV
  if (!writer || typeof writer.set !== 'function') return false
  try {
    writer.set(key, value)
    return true
  } catch {
    return false
  }
}

const normalizeStoreQueue = (parsed) => {
  if (!Array.isArray(parsed)) return []
  const queue = []
  for (const entry of parsed) {
    if (!isRecord(entry)) continue
    const type = entry.type === 'restore' ? 'restore' : entry.type === 'consume' ? 'consume' : null
    const id = Number(entry.id)
    const queuedAt = toString(entry.queuedAt)
    const amount = Number(entry.amount)
    if (!type || !Number.isFinite(id) || id <= 0 || !queuedAt) continue
    if (type === 'restore') {
      if (!Number.isFinite(amount) || amount <= 0) continue
      queue.push({ type, id: Math.trunc(id), amount: Math.trunc(amount), queuedAt })
      continue
    }
    queue.push({ type, id: Math.trunc(id), queuedAt })
  }
  return queue
}

const readStoreQueue = () => normalizeStoreQueue(parseJson(getKvValue(STORE_QUEUE_KEY), []))

const writeStoreQueue = (queue) => {
  const normalized = normalizeStoreQueue(queue)
  return setKvValue(STORE_QUEUE_KEY, JSON.stringify(normalized))
}

const readStoreConfig = () => {
  const parsed = parseJson(getKvValue(STORE_CONFIG_KEY), {})
  if (!isRecord(parsed)) return null
  const origin = toString(parsed.origin)
  const apiBase = toString(parsed.apiBase)
  if (!origin) return null
  return { origin, apiBase }
}

const normalizeApiBase = (origin, apiBase) => {
  const base = toString(apiBase).trim()
  if (!base) return origin
  if (base.startsWith('http://') || base.startsWith('https://')) return base.replace(/\/+$/, '')
  if (base.startsWith('/')) return `${origin}${base}`.replace(/\/+$/, '')
  return `${origin}/${base}`.replace(/\/+$/, '')
}

const writeStoreConfig = (config) => {
  if (!isRecord(config)) return false
  const origin = toString(config.origin).trim().replace(/\/+$/, '')
  if (!origin) return false
  const apiBase = normalizeApiBase(origin, toString(config.apiBase))
  return setKvValue(STORE_CONFIG_KEY, JSON.stringify({ origin, apiBase }))
}

const resolveNetworkStatus = () => {
  const api = globalThis.CapacitorDevice
  if (!api || typeof api.getNetworkStatus !== 'function') return { connected: true, connectionType: 'unknown' }
  try {
    const status = api.getNetworkStatus()
    if (!isRecord(status)) return { connected: true, connectionType: 'unknown' }
    return {
      connected: status.connected !== false,
      connectionType: toString(status.connectionType) || 'unknown'
    }
  } catch {
    return { connected: true, connectionType: 'unknown' }
  }
}

const postStoreAction = async (apiBase, action) => {
  const itemId = encodeURIComponent(String(action.id))
  if (action.type === 'consume') {
    try {
      const response = await fetch(`${apiBase}/store/items/${itemId}/consume`, {
        method: 'POST',
        headers: { accept: 'application/json' }
      })
      return { ok: response.ok, status: response.status }
    } catch {
      return { ok: false, status: 0 }
    }
  }
  try {
    const response = await fetch(`${apiBase}/store/items/${itemId}/restore`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: action.amount ?? 0 })
    })
    return { ok: response.ok, status: response.status }
  } catch {
    return { ok: false, status: 0 }
  }
}

const syncStoreQueue = async (reason) => {
  const queue = readStoreQueue()
  if (!queue.length) return { processed: 0, remaining: 0, reason, source: 'runner' }
  const network = resolveNetworkStatus()
  if (!network.connected) {
    return {
      processed: 0,
      remaining: queue.length,
      reason,
      source: 'runner',
      skippedReason: 'offline'
    }
  }
  const config = readStoreConfig()
  if (!config?.apiBase) {
    return {
      processed: 0,
      remaining: queue.length,
      reason,
      source: 'runner',
      skippedReason: 'missing-config'
    }
  }
  const remaining = []
  let processed = 0
  for (const action of queue) {
    const result = await postStoreAction(config.apiBase, action)
    const shouldRetry = !result.ok && (result.status === 0 || result.status >= 500)
    if (shouldRetry) {
      remaining.push(action)
      continue
    }
    processed += 1
  }
  writeStoreQueue(remaining)
  return { processed, remaining: remaining.length, reason, source: 'runner' }
}

const readPrefetchConfig = () => {
  const parsed = parseJson(getKvValue(PREFETCH_CONFIG_KEY), null)
  if (!isRecord(parsed)) return null
  const origin = toString(parsed.origin).trim().replace(/\/+$/, '')
  if (!origin) return null
  const apiBase = normalizeApiBase(origin, toString(parsed.apiBase))
  const lang = toString(parsed.lang) || 'en'
  const isAuthenticated = parsed.isAuthenticated === true
  const publicRoutes = uniquePaths(Array.isArray(parsed.publicRoutes) ? parsed.publicRoutes : defaultPublicRoutes)
  const authRoutes = uniquePaths(Array.isArray(parsed.authRoutes) ? parsed.authRoutes : defaultAuthRoutes)
  const fragmentRoutes = uniquePaths(Array.isArray(parsed.fragmentRoutes) ? parsed.fragmentRoutes : defaultFragmentRoutes)
  return { origin, apiBase, lang, isAuthenticated, publicRoutes, authRoutes, fragmentRoutes }
}

const writePrefetchConfig = (details) => {
  if (!isRecord(details)) return null
  const origin = toString(details.origin).trim().replace(/\/+$/, '')
  if (!origin) return null
  const apiBase = normalizeApiBase(origin, toString(details.apiBase))
  const lang = toString(details.lang) || 'en'
  const isAuthenticated = details.isAuthenticated === true
  const publicRoutes = uniquePaths(Array.isArray(details.publicRoutes) ? details.publicRoutes : defaultPublicRoutes)
  const authRoutes = uniquePaths(Array.isArray(details.authRoutes) ? details.authRoutes : defaultAuthRoutes)
  const fragmentRoutes = uniquePaths(Array.isArray(details.fragmentRoutes) ? details.fragmentRoutes : defaultFragmentRoutes)
  const config = { origin, apiBase, lang, isAuthenticated, publicRoutes, authRoutes, fragmentRoutes }
  setKvValue(PREFETCH_CONFIG_KEY, JSON.stringify(config))
  writeStoreConfig({ origin, apiBase })
  return config
}

const readPrefetchCache = () => {
  const parsed = parseJson(getKvValue(PREFETCH_CACHE_KEY), {
    version: PREFETCH_CACHE_VERSION,
    entries: {}
  })
  if (!isRecord(parsed) || parsed.version !== PREFETCH_CACHE_VERSION || !isRecord(parsed.entries)) {
    return { version: PREFETCH_CACHE_VERSION, entries: {} }
  }
  return { version: PREFETCH_CACHE_VERSION, entries: parsed.entries }
}

const getCacheEntryBytes = (entry) => {
  if (!isRecord(entry)) return 0
  const payloadText = toString(entry.payloadText)
  if (!payloadText) return 0
  const cachedBytes = Number(entry.payloadBytes)
  if (Number.isFinite(cachedBytes) && cachedBytes > 0) return Math.trunc(cachedBytes)
  return byteLength(payloadText)
}

const prunePrefetchCache = (cache) => {
  if (!isRecord(cache.entries)) {
    cache.entries = {}
    return cache
  }
  const now = Date.now()
  const entries = cache.entries
  const removable = []
  let totalBytes = 0

  for (const [key, value] of Object.entries(entries)) {
    if (!isRecord(value)) {
      removable.push(key)
      continue
    }
    const fetchedAt = Number(value.fetchedAt)
    const payloadText = toString(value.payloadText)
    const payloadBytes = getCacheEntryBytes(value)
    if (!payloadText || !Number.isFinite(fetchedAt) || now - fetchedAt > PREFETCH_CACHE_TTL_MS) {
      removable.push(key)
      continue
    }
    if (payloadBytes <= 0 || payloadBytes > PREFETCH_ENTRY_MAX_BYTES) {
      removable.push(key)
      continue
    }
    value.payloadBytes = payloadBytes
    totalBytes += payloadBytes
  }

  for (const key of removable) {
    delete entries[key]
  }

  if (totalBytes <= PREFETCH_CACHE_MAX_BYTES) return cache

  const ordered = Object.entries(entries)
    .map(([key, value]) => ({
      key,
      at: Number(isRecord(value) ? value.lastAccessedAt : 0) || Number(isRecord(value) ? value.fetchedAt : 0) || 0,
      bytes: getCacheEntryBytes(value)
    }))
    .sort((a, b) => a.at - b.at)

  for (const entry of ordered) {
    if (totalBytes <= PREFETCH_CACHE_MAX_BYTES) break
    totalBytes -= entry.bytes
    delete entries[entry.key]
  }

  return cache
}

const writePrefetchCache = (cache) => {
  const normalized = prunePrefetchCache(cache)
  setKvValue(PREFETCH_CACHE_KEY, JSON.stringify(normalized))
  return normalized
}

const buildActiveRoutes = (config) => {
  const publicRoutes = Array.isArray(config.publicRoutes) ? config.publicRoutes : defaultPublicRoutes
  const authRoutes = Array.isArray(config.authRoutes) ? config.authRoutes : defaultAuthRoutes
  return config.isAuthenticated ? uniquePaths([...publicRoutes, ...authRoutes]) : uniquePaths(publicRoutes)
}

const withLang = (origin, path, lang) => {
  const url = new URL(path, origin)
  if (lang) url.searchParams.set('lang', lang)
  return url.toString()
}

const prefetchRouteDocument = async (origin, path, lang) => {
  const url = withLang(origin, path, lang)
  try {
    await fetch(url, { method: 'GET', headers: { accept: 'text/html' } })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

const fetchFragmentPlanPayload = async (apiBase, path, lang) => {
  const params = new URLSearchParams({ path, includeInitial: '1' })
  if (lang) params.set('lang', lang)
  const url = `${apiBase}/fragments/plan?${params.toString()}`
  try {
    const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } })
    if (!response.ok) {
      return { ok: false, status: response.status }
    }
    const payloadText = await response.text()
    const payloadBytes = byteLength(payloadText)
    if (payloadBytes > PREFETCH_ENTRY_MAX_BYTES) {
      return { ok: false, status: 413 }
    }
    const payload = parseJson(payloadText, null)
    if (!isRecord(payload) || !Array.isArray(payload.fragments) || typeof payload.path !== 'string') {
      return { ok: false, status: 422 }
    }
    const etag = toString(response.headers.get('etag'))
    return { ok: true, status: response.status, payloadText, payloadBytes, etag }
  } catch {
    return { ok: false, status: 0 }
  }
}

const upsertPrefetchEntry = (cache, key, value) => {
  cache.entries[key] = {
    ...value,
    payloadBytes: value.payloadBytes,
    lastAccessedAt: Date.now()
  }
}

const runPrefetch = async (reason) => {
  const config = readPrefetchConfig()
  if (!config) {
    return { warmed: 0, planned: 0, cached: 0, reason, skippedReason: 'missing-config', source: 'runner' }
  }
  const network = resolveNetworkStatus()
  if (!network.connected) {
    return { warmed: 0, planned: 0, cached: 0, reason, skippedReason: 'offline', source: 'runner' }
  }

  const activeRoutes = buildActiveRoutes(config)
  const fragmentRouteSet = new Set(uniquePaths(config.fragmentRoutes))
  const cache = readPrefetchCache()
  let warmed = 0
  let planned = 0
  let cached = 0

  for (const path of activeRoutes) {
    const warmResult = await prefetchRouteDocument(config.origin, path, config.lang)
    if (warmResult.ok) warmed += 1
    if (!fragmentRouteSet.has(path)) continue

    const planResult = await fetchFragmentPlanPayload(config.apiBase, path, config.lang)
    if (!planResult.ok) continue
    planned += 1
    const key = `${config.lang}|${path}`
    upsertPrefetchEntry(cache, key, {
      path,
      lang: config.lang,
      fetchedAt: Date.now(),
      etag: planResult.etag,
      payloadText: planResult.payloadText,
      payloadBytes: planResult.payloadBytes
    })
    cached += 1
  }

  writePrefetchCache(cache)
  return { warmed, planned, cached, reason, source: 'runner' }
}

const exportPrefetchCache = () => {
  const cache = prunePrefetchCache(readPrefetchCache())
  writePrefetchCache(cache)
  const entries = Object.values(cache.entries)
    .filter((entry) => isRecord(entry))
    .map((entry) => ({
      path: normalizePath(toString(entry.path)),
      lang: toString(entry.lang) || 'en',
      fetchedAt: Number(entry.fetchedAt) || 0,
      etag: toString(entry.etag),
      payloadText: toString(entry.payloadText)
    }))
    .filter((entry) => entry.path && entry.payloadText)
  return { entries }
}

const runBackgroundTick = async () => {
  const [store, prefetch] = await Promise.all([syncStoreQueue('background:tick'), runPrefetch('background:tick')])
  return { store, prefetch, source: 'runner' }
}

const handleAsyncEvent = (resolve, reject, runner) => {
  Promise.resolve()
    .then(() => runner())
    .then((result) => resolve(result))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      reject(message)
    })
}

addEventListener('background:tick', (resolve, reject) => {
  handleAsyncEvent(resolve, reject, () => runBackgroundTick())
})

addEventListener('store-cart-queue:get', (resolve, reject) => {
  handleAsyncEvent(resolve, reject, () => ({ queue: readStoreQueue() }))
})

addEventListener('store-cart-queue:set', (resolve, reject, details) => {
  handleAsyncEvent(resolve, reject, () => {
    const queue = isRecord(details) && Array.isArray(details.queue) ? details.queue : []
    const normalized = normalizeStoreQueue(queue)
    writeStoreQueue(normalized)
    return { size: normalized.length }
  })
})

addEventListener('store-cart-config:set', (resolve, reject, details) => {
  handleAsyncEvent(resolve, reject, () => {
    const ok = writeStoreConfig(details)
    return { ok }
  })
})

addEventListener('store-cart-sync', (resolve, reject, details) => {
  handleAsyncEvent(resolve, reject, () => {
    const reason = isRecord(details) ? toString(details.reason) || 'manual' : 'manual'
    return syncStoreQueue(reason)
  })
})

addEventListener('prefetch:configure', (resolve, reject, details) => {
  handleAsyncEvent(resolve, reject, () => {
    const config = writePrefetchConfig(details)
    if (!config) return { ok: false, skippedReason: 'invalid-config' }
    const activeRoutes = buildActiveRoutes(config)
    return { ok: true, activeRoutes, source: 'runner' }
  })
})

addEventListener('prefetch:run-now', (resolve, reject, details) => {
  handleAsyncEvent(resolve, reject, () => {
    const reason = isRecord(details) ? toString(details.reason) || 'manual' : 'manual'
    return runPrefetch(reason)
  })
})

addEventListener('prefetch:export', (resolve, reject) => {
  handleAsyncEvent(resolve, reject, () => exportPrefetchCache())
})
