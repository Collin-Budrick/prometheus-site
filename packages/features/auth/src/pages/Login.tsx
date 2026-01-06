import type { DocumentHead } from '@builder.io/qwik-city'
import { LoginRoute, LoginSkeleton, type AuthCopy } from '../login-route'

export type { AuthCopy }
export { LoginRoute, LoginSkeleton }

export const head: DocumentHead = {
  title: 'Login',
  meta: [
    {
      name: 'description',
      content: 'Access your workspace and deployment history.'
    }
  ]
}

export const skeleton = LoginSkeleton

export default LoginRoute
