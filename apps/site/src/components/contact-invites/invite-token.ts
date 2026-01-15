import { parseContactInviteEvent, type ContactInviteRelayEvent } from './contacts-relay'

const tokenPrefix = 'prometheus-invite:v1:'

const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (normalized.length % 4)) % 4
  const padded = `${normalized}${'='.repeat(padding)}`
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export const encodeInviteToken = (event: ContactInviteRelayEvent) => {
  const payload = JSON.stringify({ v: 1, ...event })
  return `${tokenPrefix}${encodeBase64Url(payload)}`
}

export const decodeInviteToken = (token: string): ContactInviteRelayEvent | null => {
  const trimmed = token.trim()
  if (!trimmed) return null
  const raw = trimmed.startsWith(tokenPrefix) ? trimmed.slice(tokenPrefix.length) : trimmed
  let decoded = ''
  try {
    decoded = decodeBase64Url(raw)
  } catch {
    decoded = raw
  }
  try {
    const parsed = JSON.parse(decoded) as unknown
    return parseContactInviteEvent(parsed)
  } catch {
    return null
  }
}
