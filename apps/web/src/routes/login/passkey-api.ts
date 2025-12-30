import type { RequestEventBase } from '@builder.io/qwik-city'

import { buildAuthHeaders, forwardAuthCookies, resolveApiBase } from '../../server/auth/session'

export const fetchPasskeyAuthenticateOptions = async (
  event: RequestEventBase,
  fetcher: typeof fetch = fetch
) => {
  const apiBase = resolveApiBase(event)
  const response = await fetcher(`${apiBase}/api/auth/passkey/generate-authenticate-options`, {
    headers: buildAuthHeaders(event)
  })

  forwardAuthCookies(response, event)
  return response
}

export const fetchPasskeyAuthenticationVerification = async (
  event: RequestEventBase,
  payload: unknown,
  fetcher: typeof fetch = fetch
) => {
  const apiBase = resolveApiBase(event)
  const response = await fetcher(`${apiBase}/api/auth/passkey/verify-authentication`, {
    method: 'POST',
    headers: buildAuthHeaders(event, {
      'content-type': 'application/json'
    }),
    body: JSON.stringify(payload)
  })

  forwardAuthCookies(response, event)
  return response
}
