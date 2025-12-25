import { Elysia, t } from 'elysia'
import { handleAuthRequest, signInWithEmail, signUpWithEmail, validateSession } from '../../auth/auth'

const buildSessionResponse = (result: Awaited<ReturnType<typeof validateSession>>) => {
  const headers = new Headers(result?.headers ?? undefined)
  headers.set('content-type', 'application/json')

  return new Response(JSON.stringify(result?.response ?? null), {
    status: result?.status ?? 200,
    headers
  })
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .post(
    '/sign-in/email',
    async ({ body, request }) => signInWithEmail(body, { request }),
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String(),
        callbackURL: t.Optional(t.String()),
        rememberMe: t.Optional(t.Boolean())
      })
    }
  )
  .post(
    '/sign-up/email',
    async ({ body, request }) => signUpWithEmail(body, { request }),
    {
      body: t.Object({
        name: t.String(),
        email: t.String({ format: 'email' }),
        password: t.String(),
        callbackURL: t.Optional(t.String()),
        rememberMe: t.Optional(t.Boolean())
      })
    }
  )
  .get('/session', async ({ request }) => buildSessionResponse(await validateSession({ request })))
  // Delegate all remaining auth, passkey, and OAuth routes to Better Auth's handler
  .all('/*', async ({ request }) => handleAuthRequest(request))
