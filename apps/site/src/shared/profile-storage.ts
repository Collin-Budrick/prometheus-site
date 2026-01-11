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
export const PROFILE_CACHE_KEY = 'prometheus.profile.cache'
export const PROFILE_UPDATED_EVENT = 'prometheus:profile-updated'
export const DEFAULT_PROFILE_COLOR: ProfileColor = { r: 96, g: 156, b: 248 }
export const PROFILE_AVATAR_MAX_BYTES = 1_200_000

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

export const parseProfilePayload = (value: unknown): ProfilePayload | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const color = parseProfileColor(record.color)
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : undefined
  const hash = typeof record.hash === 'string' ? record.hash : undefined
  const bio = typeof record.bio === 'string' ? record.bio : undefined
  const avatar = typeof record.avatar === 'string' ? record.avatar : undefined
  if (!bio && !avatar && !color && !updatedAt && !hash) return null
  return { bio, avatar, color: color ?? undefined, updatedAt, hash }
}

export const parseProfileMeta = (value: unknown): ProfileMeta | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.hash !== 'string' || typeof record.updatedAt !== 'string') return null
  return { hash: record.hash, updatedAt: record.updatedAt }
}

const normalizeProfilePayload = (payload: ProfilePayload): ProfilePayload => ({
  bio: payload.bio?.trim() ? payload.bio?.trim() : undefined,
  avatar: payload.avatar,
  color: payload.color,
  updatedAt: payload.updatedAt,
  hash: payload.hash
})

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

export const loadLocalProfile = (): ProfilePayload | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ProfilePayload
    const payload = parseProfilePayload(parsed)
    if (!payload) return null
    if (!payload.color) payload.color = DEFAULT_PROFILE_COLOR
    return payload
  } catch {
    return null
  }
}

export const saveLocalProfile = (payload: ProfilePayload) => {
  if (typeof window === 'undefined') return false
  try {
    const normalized = normalizeProfilePayload(payload)
    const hasData = Boolean(normalized.bio || normalized.avatar || normalized.color)
    if (!hasData) {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY)
      return true
    }
    const meta = buildProfileMeta(normalized)
    const stored = { ...normalized, ...meta }
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(stored))
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
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const entries: Record<string, ProfileCacheEntry> = {}
    for (const [key, value] of Object.entries(parsed)) {
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
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(entries))
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
