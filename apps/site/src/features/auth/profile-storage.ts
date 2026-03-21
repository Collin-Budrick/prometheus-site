export type ProfileColor = {
  r: number
  g: number
  b: number
}

export type ProfileMeta = {
  hash: string
  updatedAt: string
}

export type ProfilePayload = {
  bio?: string
  avatar?: string
  color?: ProfileColor
  updatedAt?: string
  hash?: string
}

type ProfileCacheEntry = {
  profile?: ProfilePayload
  meta?: ProfileMeta
}

export const PROFILE_STORAGE_KEY = 'prometheus.profile.local'
const PROFILE_STORAGE_BACKUP_KEY = 'prometheus.profile.local.backup'
const PROFILE_COOKIE_KEY = 'prom-profile-local'
export const PROFILE_CACHE_KEY = 'prometheus.profile.cache'
export const PROFILE_UPDATED_EVENT = 'prometheus:profile-updated'
export const DEFAULT_PROFILE_COLOR: ProfileColor = { r: 96, g: 156, b: 248 }
export const PROFILE_AVATAR_MAX_BYTES = 1_200_000
const PROFILE_COOKIE_VERSION = 1
const PROFILE_STORAGE_VERSION = 2
const PROFILE_CACHE_VERSION = 2

export const clampChannel = (value: number) => Math.min(255, Math.max(0, Math.round(value)))

const parseProfileColor = (value: unknown): ProfileColor | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const r = typeof record.r === 'number' ? clampChannel(record.r) : null
  const g = typeof record.g === 'number' ? clampChannel(record.g) : null
  const b = typeof record.b === 'number' ? clampChannel(record.b) : null
  if (r === null || g === null || b === null) return null
  return { r, g, b }
}

const isValidTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  return !Number.isNaN(Date.parse(value))
}

const isValidHash = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  return /^[a-f0-9]{8}$/i.test(value)
}

export const parseProfilePayload = (value: unknown): ProfilePayload | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const color = parseProfileColor(record.color)
  const updatedAt = isValidTimestamp(record.updatedAt) ? record.updatedAt : undefined
  const hash = isValidHash(record.hash) ? record.hash : undefined
  const bio = typeof record.bio === 'string' ? record.bio : undefined
  const avatar = typeof record.avatar === 'string' ? record.avatar : undefined
  if (!bio && !avatar && !color && !updatedAt && !hash) return null
  return { bio, avatar, color: color ?? undefined, updatedAt, hash }
}

export const parseProfileMeta = (value: unknown): ProfileMeta | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (!isValidHash(record.hash) || !isValidTimestamp(record.updatedAt)) return null
  return { hash: record.hash, updatedAt: record.updatedAt }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeProfilePayload = (payload: ProfilePayload): ProfilePayload => ({
  bio: payload.bio?.trim() ? payload.bio?.trim() : undefined,
  avatar: payload.avatar,
  color: payload.color,
  updatedAt: payload.updatedAt,
  hash: payload.hash
})

const readCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name === key) {
      if (!raw) return ''
      try {
        return decodeURIComponent(raw)
      } catch {
        return null
      }
    }
  }
  return null
}

const buildCookieProfilePayload = (payload: ProfilePayload): ProfilePayload => {
  const normalized = normalizeProfilePayload(payload)
  return {
    bio: normalized.bio,
    color: normalized.color,
    updatedAt: normalized.updatedAt,
    hash: normalized.hash
  }
}

type ProfileCookieEnvelope = {
  version: typeof PROFILE_COOKIE_VERSION
  payload: ProfilePayload
}

const resolveCookieProfilePayload = (value: unknown) => {
  if (!isRecord(value)) return null
  if (value.version === PROFILE_COOKIE_VERSION && value.payload) {
    return parseProfilePayload(value.payload)
  }
  return parseProfilePayload(value)
}

const serializeProfileCookiePayload = (payload: ProfilePayload) =>
  JSON.stringify({
    version: PROFILE_COOKIE_VERSION,
    payload: buildCookieProfilePayload(payload)
  } satisfies ProfileCookieEnvelope)

export const readLocalProfileFromCookie = (cookieHeader: string | null): ProfilePayload | null => {
  const raw = readCookieValue(cookieHeader, PROFILE_COOKIE_KEY)
  if (!raw) return null
  try {
    const payload = resolveCookieProfilePayload(JSON.parse(raw))
    if (!payload) return null
    if (!payload.color) payload.color = DEFAULT_PROFILE_COLOR
    return payload
  } catch {
    return null
  }
}

const writeLocalProfileCookie = (payload: ProfilePayload | null) => {
  if (typeof document === 'undefined') return
  if (!payload) {
    document.cookie = `${PROFILE_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`
    return
  }
  const cookiePayload = buildCookieProfilePayload(payload)
  const hasData = Boolean(cookiePayload.bio || cookiePayload.color)
  if (!hasData) {
    document.cookie = `${PROFILE_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`
    return
  }
  try {
    const serialized = encodeURIComponent(serializeProfileCookiePayload(cookiePayload))
    document.cookie = `${PROFILE_COOKIE_KEY}=${serialized}; path=/; max-age=2592000; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

export const computeProfileHash = (payload: ProfilePayload) => {
  const normalized = normalizeProfilePayload(payload)
  const source = JSON.stringify({
    bio: normalized.bio ?? '',
    avatar: normalized.avatar ?? '',
    color: normalized.color ?? DEFAULT_PROFILE_COLOR
  })
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const buildProfileMeta = (payload: ProfilePayload | null): ProfileMeta | null => {
  if (!payload) return null
  const updatedAt = payload.updatedAt ?? new Date().toISOString()
  const hash = payload.hash ?? computeProfileHash(payload)
  return { updatedAt, hash }
}

export const buildLocalProfilePayload = (bio: string, avatar: string | null, color: ProfileColor): ProfilePayload => {
  const trimmedBio = bio.trim()
  const hasCustomColor =
    color.r !== DEFAULT_PROFILE_COLOR.r ||
    color.g !== DEFAULT_PROFILE_COLOR.g ||
    color.b !== DEFAULT_PROFILE_COLOR.b
  const payload: ProfilePayload = {
    bio: trimmedBio.length ? trimmedBio : undefined,
    avatar: avatar ?? undefined,
    color: hasCustomColor ? color : undefined,
    updatedAt: new Date().toISOString()
  }
  payload.hash = computeProfileHash(payload)
  return payload
}

type ProfileStorageEnvelope = {
  version: number
  payload: ProfilePayload
}

type ProfileCacheEnvelope = {
  version: number
  entries: Record<string, ProfileCacheEntry>
}

const serializeProfileStorageEnvelope = (payload: ProfilePayload) =>
  JSON.stringify({ version: PROFILE_STORAGE_VERSION, payload } satisfies ProfileStorageEnvelope)

const serializeProfileCacheEnvelope = (entries: Record<string, ProfileCacheEntry>) =>
  JSON.stringify({ version: PROFILE_CACHE_VERSION, entries } satisfies ProfileCacheEnvelope)

const parseProfileStorageEnvelope = (value: unknown): ProfilePayload | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'number') return null
  if (!record.payload) return null
  if (record.version < 1) return null
  return parseProfilePayload(record.payload)
}

const parseProfileCacheEnvelope = (value: unknown): Record<string, ProfileCacheEntry> | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'number' || record.version < 1) return null
  const entries = record.entries
  if (!entries || typeof entries !== 'object') return null
  return entries as Record<string, ProfileCacheEntry>
}

const loadProfileFromStorage = (key: string) => {
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    const payload = parseProfileStorageEnvelope(parsed) ?? parseProfilePayload(parsed)
    if (!payload) return null
    if (!payload.color) payload.color = DEFAULT_PROFILE_COLOR
    return payload
  } catch {
    return null
  }
}

export const loadLocalProfile = (): ProfilePayload | null => {
  if (typeof window === 'undefined') return null
  const payload =
    loadProfileFromStorage(PROFILE_STORAGE_KEY) ?? loadProfileFromStorage(PROFILE_STORAGE_BACKUP_KEY)
  if (payload) {
    if (!payload.color) payload.color = DEFAULT_PROFILE_COLOR
    return payload
  }
  const cookiePayload = readLocalProfileFromCookie(typeof document === 'undefined' ? null : document.cookie)
  if (!cookiePayload) return null
  try {
    persistLocalProfile(PROFILE_STORAGE_KEY, cookiePayload)
    persistLocalProfile(PROFILE_STORAGE_BACKUP_KEY, cookiePayload)
  } catch {
    // ignore storage failures
  }
  return cookiePayload
}

const persistLocalProfile = (key: string, payload: ProfilePayload) => {
  const meta = buildProfileMeta(payload)
  const stored = { ...payload, ...meta }
  window.localStorage.setItem(key, serializeProfileStorageEnvelope(stored))
}

const removeLocalProfile = (key: string) => {
  window.localStorage.removeItem(key)
}

export const saveLocalProfile = (payload: ProfilePayload) => {
  if (typeof window === 'undefined') return false
  try {
    const normalized = normalizeProfilePayload(payload)
    const hasData = Boolean(normalized.bio || normalized.avatar || normalized.color)
    if (!hasData) {
      removeLocalProfile(PROFILE_STORAGE_KEY)
      removeLocalProfile(PROFILE_STORAGE_BACKUP_KEY)
      writeLocalProfileCookie(null)
      return true
    }
    persistLocalProfile(PROFILE_STORAGE_KEY, normalized)
    persistLocalProfile(PROFILE_STORAGE_BACKUP_KEY, normalized)
    writeLocalProfileCookie(normalized)
    return true
  } catch {
    return false
  }
}

export const emitProfileUpdate = (payload: ProfilePayload) => {
  if (typeof window === 'undefined') return
  const meta = buildProfileMeta(payload)
  window.dispatchEvent(
    new CustomEvent(PROFILE_UPDATED_EVENT, {
      detail: { profile: payload, meta }
    })
  )
}

const loadRemoteCache = (): Record<string, ProfileCacheEntry> => {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(PROFILE_CACHE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    const legacy = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
    const envelopeEntries = parseProfileCacheEnvelope(parsed) ?? null
    const entriesSource = envelopeEntries ?? legacy
    const entries: Record<string, ProfileCacheEntry> = {}
    for (const [key, value] of Object.entries(entriesSource)) {
      if (!value || typeof value !== 'object') continue
      const record = value as Record<string, unknown>
      const profile = parseProfilePayload(record.profile ?? record)
      const meta = parseProfileMeta(record.meta)
      if (!profile && !meta) continue
      entries[key] = { profile: profile ?? undefined, meta: meta ?? undefined }
    }
    return entries
  } catch {
    return {}
  }
}

const saveRemoteCache = (entries: Record<string, ProfileCacheEntry>) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(PROFILE_CACHE_KEY, serializeProfileCacheEnvelope(entries))
    return true
  } catch {
    return false
  }
}

export const loadRemoteProfiles = () => {
  const cache = loadRemoteCache()
  const profiles: Record<string, ProfilePayload> = {}
  Object.entries(cache).forEach(([key, entry]) => {
    if (entry.profile) {
      if (!entry.profile.color) {
        entry.profile.color = DEFAULT_PROFILE_COLOR
      }
      profiles[key] = entry.profile
    }
  })
  return profiles
}

export const loadRemoteProfile = (userId: string) => {
  const cache = loadRemoteCache()
  const entry = cache[userId]
  if (!entry?.profile) return null
  if (!entry.profile.color) {
    entry.profile.color = DEFAULT_PROFILE_COLOR
  }
  return entry.profile
}

export const loadRemoteProfileMeta = (userId: string) => {
  const cache = loadRemoteCache()
  const entry = cache[userId]
  if (entry?.meta) return entry.meta
  if (entry?.profile && entry.profile.hash && entry.profile.updatedAt) {
    return { hash: entry.profile.hash, updatedAt: entry.profile.updatedAt }
  }
  return null
}

export const saveRemoteProfile = (userId: string, profile: ProfilePayload) => {
  if (typeof window === 'undefined') return false
  const cache = loadRemoteCache()
  const meta = buildProfileMeta(profile)
  const stored = { ...profile, ...meta }
  cache[userId] = { profile: stored, meta: meta ?? undefined }
  return saveRemoteCache(cache)
}

export const saveRemoteProfileMeta = (userId: string, meta: ProfileMeta) => {
  if (typeof window === 'undefined') return false
  const cache = loadRemoteCache()
  const entry = cache[userId] ?? {}
  cache[userId] = { ...entry, meta }
  return saveRemoteCache(cache)
}
