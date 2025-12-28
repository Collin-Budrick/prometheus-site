import { describe, expect, it } from 'bun:test'
import { publicKeyCredentialToCreateJSON } from '../src/components/auth/passkey-utils'

const makeBuffer = (...values: number[]) => new Uint8Array(values).buffer

const makeCredential = (responseOverrides: Record<string, unknown>) =>
  ({
    id: 'cred-123',
    type: 'public-key',
    rawId: makeBuffer(1, 2, 3),
    response: {
      clientDataJSON: makeBuffer(4),
      attestationObject: makeBuffer(5),
      ...responseOverrides
    }
  }) as PublicKeyCredential

describe('publicKeyCredentialToCreateJSON', () => {
  it('includes transports when provided by the authenticator', () => {
    const credential = makeCredential({
      getTransports: () => ['usb', 'nfc']
    })

    const payload = publicKeyCredentialToCreateJSON(credential)

    expect(payload.response.transports).toEqual(['usb', 'nfc'])
  })

  it('defaults transports to an empty array when unavailable', () => {
    const credential = makeCredential({})

    const payload = publicKeyCredentialToCreateJSON(credential)

    expect(payload.response.transports).toEqual([])
  })
})
