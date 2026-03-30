export const facebookDataDeletionPath = '/api/auth/facebook/data-deletion'
export const facebookDataDeletionStatusPath = '/api/auth/facebook/data-deletion-status'

const defaultStatusTokenTtlMs = 1000 * 60 * 60 * 24 * 30
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

type JsonRecord = Record<string, unknown>

export type FacebookSignedRequestPayload = JsonRecord & {
  algorithm?: string
  issued_at?: number
  user_id?: string
}

export type FacebookDataDeletionStatus = {
  confirmationCode: string
  completedAt: number
  expiresAt: number
  matchFound: boolean
  provider: 'facebook'
  status: 'completed'
}

const normalizeOptionalString = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const bytesToBinaryString = (value: Uint8Array) =>
  Array.from(value, (byte) => String.fromCharCode(byte)).join('')

const binaryStringToBytes = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0))

const toBase64Url = (value: Uint8Array | string) =>
  btoa(bytesToBinaryString(typeof value === 'string' ? textEncoder.encode(value) : value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  return binaryStringToBytes(atob(padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`))
}

const signEncodedSegment = async (encodedSegment: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    {
      hash: 'SHA-256',
      name: 'HMAC'
    },
    false,
    ['sign']
  )

  return new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(encodedSegment)))
}

const fixedTimeEquals = (left: Uint8Array, right: Uint8Array) => {
  const maxLength = Math.max(left.length, right.length)
  let diff = left.length ^ right.length
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}

const verifySignedSegments = async (signatureSegment: string, payloadSegment: string, secret: string) => {
  const receivedSignature = fromBase64Url(signatureSegment)
  const expectedSignature = await signEncodedSegment(payloadSegment, secret)
  return fixedTimeEquals(receivedSignature, expectedSignature)
}

const parseJsonRecord = (value: Uint8Array) => {
  const parsed = JSON.parse(textDecoder.decode(value))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object payload.')
  }
  return parsed as JsonRecord
}

export const parseFacebookSignedRequest = async (signedRequest: string, appSecret: string) => {
  const normalizedRequest = normalizeOptionalString(signedRequest)
  const normalizedSecret = normalizeOptionalString(appSecret)
  if (!normalizedRequest) throw new Error('Missing signed_request.')
  if (!normalizedSecret) throw new Error('Missing Facebook app secret.')

  const [signatureSegment, payloadSegment, ...rest] = normalizedRequest.split('.')
  if (!signatureSegment || !payloadSegment || rest.length > 0) {
    throw new Error('Invalid signed_request format.')
  }

  if (!(await verifySignedSegments(signatureSegment, payloadSegment, normalizedSecret))) {
    throw new Error('Invalid Facebook signed_request signature.')
  }

  const payload = parseJsonRecord(fromBase64Url(payloadSegment)) as FacebookSignedRequestPayload
  if (payload.algorithm !== 'HMAC-SHA256') {
    throw new Error('Unsupported Facebook signed_request algorithm.')
  }
  if (typeof payload.user_id !== 'string' || !payload.user_id.trim()) {
    throw new Error('Missing Facebook user_id in signed_request payload.')
  }
  return payload
}

export const generateFacebookDataDeletionConfirmationCode = () =>
  crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()

export const createFacebookDataDeletionStatus = ({
  completedAt = Date.now(),
  confirmationCode = generateFacebookDataDeletionConfirmationCode(),
  matchFound
}: {
  completedAt?: number
  confirmationCode?: string
  matchFound: boolean
}): FacebookDataDeletionStatus => ({
  confirmationCode,
  completedAt,
  expiresAt: completedAt + defaultStatusTokenTtlMs,
  matchFound,
  provider: 'facebook',
  status: 'completed'
})

export const encodeFacebookDataDeletionStatusToken = async (
  status: FacebookDataDeletionStatus,
  signingSecret: string
) => {
  const normalizedSecret = normalizeOptionalString(signingSecret)
  if (!normalizedSecret) throw new Error('Missing token signing secret.')
  const payloadSegment = toBase64Url(JSON.stringify(status))
  const signatureSegment = toBase64Url(await signEncodedSegment(payloadSegment, normalizedSecret))
  return `${signatureSegment}.${payloadSegment}`
}

export const decodeFacebookDataDeletionStatusToken = async (
  token: string,
  signingSecret: string,
  now = Date.now()
) => {
  const normalizedToken = normalizeOptionalString(token)
  const normalizedSecret = normalizeOptionalString(signingSecret)
  if (!normalizedToken) throw new Error('Missing deletion status token.')
  if (!normalizedSecret) throw new Error('Missing token signing secret.')

  const [signatureSegment, payloadSegment, ...rest] = normalizedToken.split('.')
  if (!signatureSegment || !payloadSegment || rest.length > 0) {
    throw new Error('Invalid deletion status token format.')
  }
  if (!(await verifySignedSegments(signatureSegment, payloadSegment, normalizedSecret))) {
    throw new Error('Invalid deletion status token signature.')
  }

  const payload = parseJsonRecord(fromBase64Url(payloadSegment)) as Partial<FacebookDataDeletionStatus>
  if (payload.provider !== 'facebook' || payload.status !== 'completed') {
    throw new Error('Invalid deletion status token payload.')
  }
  if (typeof payload.confirmationCode !== 'string' || !payload.confirmationCode.trim()) {
    throw new Error('Missing confirmation code in deletion status token.')
  }
  if (typeof payload.completedAt !== 'number' || !Number.isFinite(payload.completedAt)) {
    throw new Error('Invalid deletion completion time in token.')
  }
  if (typeof payload.expiresAt !== 'number' || !Number.isFinite(payload.expiresAt)) {
    throw new Error('Invalid deletion status token expiration.')
  }
  if (typeof payload.matchFound !== 'boolean') {
    throw new Error('Invalid deletion status match flag.')
  }
  if (payload.expiresAt < now) {
    throw new Error('Deletion status token has expired.')
  }

  return payload as FacebookDataDeletionStatus
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC'
  }).format(new Date(timestamp))

export const renderFacebookDataDeletionStatusPage = ({
  origin,
  status
}: {
  origin: string
  status: FacebookDataDeletionStatus
}) => {
  const escapedOrigin = escapeHtml(origin)
  const escapedCode = escapeHtml(status.confirmationCode)
  const completedAt = escapeHtml(formatTimestamp(status.completedAt))
  const resultSummary = status.matchFound
    ? 'We found a matching Facebook-linked account and removed the associated authentication records and active sessions.'
    : 'We did not find an active Facebook-linked account for this request, and no additional action is required.'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Facebook Data Deletion Request</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: #f3f5f8;
        color: #122033;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(31, 73, 125, 0.16), transparent 42%),
          linear-gradient(180deg, #f8fbff 0%, #eef2f7 100%);
      }
      main {
        width: min(640px, calc(100vw - 32px));
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 28px 80px rgba(18, 32, 51, 0.16);
        padding: 32px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #255db0;
      }
      h1 {
        margin: 14px 0 12px;
        font-size: clamp(2rem, 4vw, 2.6rem);
        line-height: 1.08;
      }
      p {
        margin: 0 0 18px;
        line-height: 1.65;
        color: #35455d;
      }
      .card {
        margin-top: 24px;
        padding: 18px 20px;
        border-radius: 18px;
        background: #f6f8fc;
        border: 1px solid #d8e1f0;
      }
      .label {
        display: block;
        margin-bottom: 6px;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #5a6f8f;
      }
      code {
        font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        font-size: 0.96rem;
        color: #102749;
      }
      a {
        color: #255db0;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Prometheus</div>
      <h1>Facebook data deletion request completed</h1>
      <p>${escapeHtml(resultSummary)}</p>
      <div class="card">
        <span class="label">Confirmation code</span>
        <code>${escapedCode}</code>
      </div>
      <div class="card">
        <span class="label">Processed at</span>
        <strong>${completedAt} UTC</strong>
      </div>
      <p>
        If you have any questions about this request, review our
        <a href="${escapedOrigin}/privacy/">Privacy Policy</a>
        for additional contact details.
      </p>
    </main>
  </body>
</html>`
}
