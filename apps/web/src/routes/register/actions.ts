import type { RequestEventAction } from '@builder.io/qwik-city'
import { _ } from '../../i18n/translate'
import {
  buildAuthHeaders,
  buildRedirectHtml,
  forwardAuthCookies,
  resolveApiBase,
  resolveAuthCallbackUrl
} from '../../server/auth/session'
import { normalizeAuthCallback } from '../auth-callback'

export const emailRegisterAction = async (data: Record<string, any>, event: RequestEventAction) => {
  const apiBase = resolveApiBase(event)
  const callback = normalizeAuthCallback(data.callback)
  const callbackURL = resolveAuthCallbackUrl(event, callback)
  const response = await fetch(`${apiBase}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: buildAuthHeaders(event, {
      'content-type': 'application/json'
    }),
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      password: data.password,
      rememberMe: data.remember === 'on' || data.remember === 'true',
      callbackURL
    })
  })

  forwardAuthCookies(response, event)

  if (!response.ok) {
    let message = _`Unable to create your account right now.`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) message = payload.message
    } catch {}
    return event.fail(response.status, { message })
  }

  throw event.html(200, buildRedirectHtml(callback))
}
