const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const encodeBase64Url = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

type CredentialDescriptorInput = PublicKeyCredentialDescriptor & { id?: unknown }

const normalizeCredentialDescriptor = (descriptor: CredentialDescriptorInput) => {
  const id = descriptor.id
  return {
    ...descriptor,
    id: typeof id === 'string' ? decodeBase64Url(id) : id
  } as PublicKeyCredentialDescriptor
}

export const normalizePublicKeyOptions = (options: unknown): PublicKeyCredentialRequestOptions => {
  const candidate = options && typeof options === 'object' ? (options as Record<string, unknown>) : {}
  const publicKey = (candidate.publicKey ?? candidate) as Record<string, unknown>
  const normalized: Record<string, unknown> = { ...publicKey }

  if (typeof normalized.challenge === 'string') {
    normalized.challenge = decodeBase64Url(normalized.challenge)
  }

  if (normalized.user && typeof normalized.user === 'object') {
    const user = normalized.user as Record<string, unknown>
    if (typeof user.id === 'string') {
      normalized.user = { ...user, id: decodeBase64Url(user.id) }
    }
  }

  if (Array.isArray(normalized.allowCredentials)) {
    normalized.allowCredentials = normalized.allowCredentials.map((entry) =>
      normalizeCredentialDescriptor(entry as CredentialDescriptorInput)
    )
  }

  if (Array.isArray(normalized.excludeCredentials)) {
    normalized.excludeCredentials = normalized.excludeCredentials.map((entry) =>
      normalizeCredentialDescriptor(entry as CredentialDescriptorInput)
    )
  }

  return normalized as unknown as PublicKeyCredentialRequestOptions
}

export const serializeCredential = (credential: PublicKeyCredential) => {
  const response = credential.response
  const clientDataJSON = encodeBase64Url(response.clientDataJSON)
  const payload: Record<string, unknown> = {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {}
  }

  if ('attestationObject' in response) {
    const attestation = response as AuthenticatorAttestationResponse
    payload.response = {
      clientDataJSON,
      attestationObject: encodeBase64Url(attestation.attestationObject)
    }
  } else {
    const assertion = response as AuthenticatorAssertionResponse
    payload.response = {
      clientDataJSON,
      authenticatorData: encodeBase64Url(assertion.authenticatorData),
      signature: encodeBase64Url(assertion.signature),
      userHandle: assertion.userHandle ? encodeBase64Url(assertion.userHandle) : null
    }
  }

  return payload
}
