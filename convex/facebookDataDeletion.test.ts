import { createHmac } from 'node:crypto'
import { expect, test } from 'bun:test'
import {
  createFacebookDataDeletionStatus,
  decodeFacebookDataDeletionStatusToken,
  encodeFacebookDataDeletionStatusToken,
  parseFacebookSignedRequest,
  renderFacebookDataDeletionStatusPage
} from './facebookDataDeletion'

const testSecret = 'facebook-app-secret-for-tests'

const toBase64Url = (value: Buffer | string) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const buildSignedRequest = (payload: Record<string, unknown>, secret: string) => {
  const payloadSegment = toBase64Url(JSON.stringify(payload))
  const signatureSegment = toBase64Url(createHmac('sha256', secret).update(payloadSegment).digest())
  return `${signatureSegment}.${payloadSegment}`
}

test('parseFacebookSignedRequest verifies the Facebook signature and payload', async () => {
  const signedRequest = buildSignedRequest(
    {
      algorithm: 'HMAC-SHA256',
      issued_at: 1711819200,
      user_id: 'facebook-user-123'
    },
    testSecret
  )

  const payload = await parseFacebookSignedRequest(signedRequest, testSecret)

  expect(payload.user_id).toBe('facebook-user-123')
  expect(payload.algorithm).toBe('HMAC-SHA256')
})

test('parseFacebookSignedRequest rejects an invalid signature', async () => {
  const signedRequest = buildSignedRequest(
    {
      algorithm: 'HMAC-SHA256',
      user_id: 'facebook-user-123'
    },
    'wrong-secret'
  )

  await expect(parseFacebookSignedRequest(signedRequest, testSecret)).rejects.toThrow(
    'Invalid Facebook signed_request signature.'
  )
})

test('facebook data deletion status tokens round-trip and expire', async () => {
  const status = createFacebookDataDeletionStatus({
    completedAt: 1711819200000,
    confirmationCode: 'ABC123DEF456',
    matchFound: true
  })

  const token = await encodeFacebookDataDeletionStatusToken(status, testSecret)
  const decoded = await decodeFacebookDataDeletionStatusToken(token, testSecret, status.completedAt)

  expect(decoded).toEqual(status)
  await expect(decodeFacebookDataDeletionStatusToken(token, testSecret, status.expiresAt + 1)).rejects.toThrow(
    'Deletion status token has expired.'
  )
})

test('renderFacebookDataDeletionStatusPage includes the confirmation code and privacy link', () => {
  const html = renderFacebookDataDeletionStatusPage({
    origin: 'https://prometheus.prod',
    status: createFacebookDataDeletionStatus({
      completedAt: 1711819200000,
      confirmationCode: 'ABC123DEF456',
      matchFound: false
    })
  })

  expect(html).toContain('ABC123DEF456')
  expect(html).toContain('https://prometheus.prod/privacy/')
  expect(html).toContain('did not find an active Facebook-linked account')
})
