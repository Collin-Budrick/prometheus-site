import { normalizeRoutePath } from '../../shared/route-navigation'

export const FRAGMENT_PAYLOAD_RESOURCE_KEY_PREFIX = 'data:fragment-payload:'

const escapeResourceSegment = (value: string) =>
  encodeURIComponent(value).replace(/%3A/gi, ':')

const decodeResourceSegment = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const buildFragmentPayloadResourceKey = ({
  path,
  lang,
  fragmentId
}: {
  path: string
  lang: string
  fragmentId: string
}) =>
  `${FRAGMENT_PAYLOAD_RESOURCE_KEY_PREFIX}${escapeResourceSegment(normalizeRoutePath(path))}:${escapeResourceSegment(lang)}:${escapeResourceSegment(fragmentId)}`

export const parseFragmentPayloadResourceKey = (resourceKey?: string | null) => {
  if (typeof resourceKey !== 'string' || !resourceKey.startsWith(FRAGMENT_PAYLOAD_RESOURCE_KEY_PREFIX)) {
    return null
  }
  const body = resourceKey.slice(FRAGMENT_PAYLOAD_RESOURCE_KEY_PREFIX.length)
  const firstSeparator = body.indexOf(':')
  const secondSeparator = body.indexOf(':', firstSeparator + 1)
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) {
    return null
  }
  return {
    path: normalizeRoutePath(decodeResourceSegment(body.slice(0, firstSeparator))),
    lang: decodeResourceSegment(body.slice(firstSeparator + 1, secondSeparator)),
    fragmentId: decodeResourceSegment(body.slice(secondSeparator + 1))
  }
}
