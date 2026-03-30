import { convexAdapter } from '@convex-dev/better-auth'
import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { anonymous } from 'better-auth/plugins/anonymous'
import { bearer } from 'better-auth/plugins/bearer'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import { jwt } from 'better-auth/plugins/jwt'
import { magicLink } from 'better-auth/plugins/magic-link'
import { oidcProvider } from 'better-auth/plugins/oidc-provider'
import { oneTimeToken } from 'better-auth/plugins/one-time-token'
import { phoneNumber } from 'better-auth/plugins/phone-number'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { username } from 'better-auth/plugins/username'
import { convex } from '@convex-dev/better-auth/plugins'

export const options = {
  database: convexAdapter({} as never, {} as never),
  emailAndPassword: {
    enabled: true
  },
  rateLimit: {
    storage: 'database'
  },
  plugins: [
    twoFactor(),
    anonymous(),
    username(),
    phoneNumber(),
    magicLink({ sendMagicLink: async () => {} }),
    emailOTP({ sendVerificationOTP: async () => {} }),
    genericOAuth({
      config: [
        {
          clientId: '',
          clientSecret: '',
          providerId: ''
        }
      ]
    }),
    oidcProvider({
      loginPage: '/login'
    }),
    bearer(),
    oneTimeToken(),
    passkey(),
    jwt(),
    convex({
      authConfig: { providers: [{ applicationID: 'convex', domain: '' }] }
    })
  ]
} satisfies BetterAuthOptions
