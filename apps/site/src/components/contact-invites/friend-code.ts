type FriendCodeUser = {
  id: string
  email?: string | null
  name?: string | null
}

const storagePrefix = 'contact-invites:friend-code:'

const resolveStorageKey = (user: FriendCodeUser) => `${storagePrefix}${user.id}`

const createRawToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const formatToken = (value: string) => {
  const compact = value.replace(/[^a-z0-9]/gi, '').toUpperCase()
  if (compact.length <= 4) return compact
  const parts = [compact.slice(0, 4), compact.slice(4, 8), compact.slice(8, 12), compact.slice(12, 16)]
  return parts.filter(Boolean).join('-')
}

const generateFriendCode = () => formatToken(createRawToken())

const readStoredCode = (user: FriendCodeUser) => {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(resolveStorageKey(user)) ?? ''
  } catch {
    return ''
  }
}

const writeStoredCode = (user: FriendCodeUser, code: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(resolveStorageKey(user), code)
  } catch {
    // ignore storage errors
  }
}

export const ensureFriendCode = (user: FriendCodeUser) => {
  const stored = readStoredCode(user)
  if (stored) return stored
  const fresh = generateFriendCode()
  writeStoredCode(user, fresh)
  return fresh
}

export const rotateFriendCode = (user: FriendCodeUser) => {
  const fresh = generateFriendCode()
  writeStoredCode(user, fresh)
  return fresh
}
