const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type FragmentKnownVersions = Record<string, number>

const toBase64Url = (value: Uint8Array) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }

  let binary = ''
  value.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const base64 = `${normalized}${padding}`

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'))
  }

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export const encodeFragmentKnownVersions = (versions: FragmentKnownVersions) => {
  const entries = Object.entries(versions).filter(
    ([id, value]) => id.trim() !== '' && Number.isFinite(value)
  )
  if (!entries.length) return ''
  return toBase64Url(
    encoder.encode(
      JSON.stringify(
        entries.reduce<FragmentKnownVersions>((acc, [id, value]) => {
          acc[id] = value
          return acc
        }, {})
      )
    )
  )
}

export const decodeFragmentKnownVersions = (value: string | null | undefined): FragmentKnownVersions => {
  if (!value) return {}
  try {
    const parsed = JSON.parse(decoder.decode(fromBase64Url(value))) as Record<string, unknown>
    return Object.entries(parsed).reduce<FragmentKnownVersions>((acc, [id, updatedAt]) => {
      if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
        acc[id] = updatedAt
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}
