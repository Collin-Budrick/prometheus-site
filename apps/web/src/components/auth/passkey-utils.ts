export const bufferDecode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export const encodeBuffer = (value: ArrayBuffer | ArrayBufferView) =>
  btoa(String.fromCharCode(...new Uint8Array(value as ArrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export const toPublicKeyCreationOptions = (options: any): PublicKeyCredentialCreationOptions => ({
  ...options,
  challenge: bufferDecode(options.challenge),
  user: {
    ...options.user,
    id: bufferDecode(options.user.id)
  },
  excludeCredentials: options.excludeCredentials?.map((cred: any) => ({
    ...cred,
    id: bufferDecode(cred.id)
  }))
})

export const publicKeyCredentialToCreateJSON = (credential: PublicKeyCredential) => {
  const response = credential.response as AuthenticatorAttestationResponse & {
    getTransports?: () => string[]
  }
  const transports = response.getTransports?.() ?? []
  return {
    id: credential.id,
    rawId: encodeBuffer(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: encodeBuffer(response.clientDataJSON),
      attestationObject: encodeBuffer(response.attestationObject),
      transports
    }
  }
}
