import type { RequestEventAction } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { forwardAuthCookies } from '../../../server/auth/session'
import { normalizeAuthCallback } from '../auth-callback'

export const emailRegisterAction = async (data: Record<string, any>, event: RequestEventAction) => {
  const apiBase = event.env.get('API_URL') ?? 'http://localhost:4000'
  const callback = normalizeAuthCallback(data.callback, event.params.locale)
  const response = await fetch(`${apiBase}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: event.request.headers.get('cookie') ?? ''
    },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      password: data.password,
      rememberMe: data.remember === 'on' || data.remember === 'true',
      callbackURL: callback
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

  throw event.redirect(302, callback)
}
