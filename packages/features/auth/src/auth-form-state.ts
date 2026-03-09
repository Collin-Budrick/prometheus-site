export type AuthFormState = {
  email: string
  name: string
  remember: boolean
}

export const authRememberCookieKey = 'auth:remember'
export const authEmailCookieKey = 'auth:email'
export const authNameCookieKey = 'auth:name'
export const authFormCookieMaxAge = 2592000

export const readCookieValueRaw = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, ...rest] = part.split('=')
    if (!name) continue
    if (name.trim() === key) {
      return rest.join('=').trim()
    }
  }
  return null
}

const readCookieValue = (cookieHeader: string | null, key: string) => {
  const raw = readCookieValueRaw(cookieHeader, key)
  if (raw === null) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

const parseRememberCookie = (value: string | null) => value === '1' || value === 'true'

export const resolveAuthFormState = (cookieHeader: string | null): AuthFormState => ({
  email: readCookieValue(cookieHeader, authEmailCookieKey) ?? '',
  name: readCookieValue(cookieHeader, authNameCookieKey) ?? '',
  remember: parseRememberCookie(readCookieValue(cookieHeader, authRememberCookieKey))
})
