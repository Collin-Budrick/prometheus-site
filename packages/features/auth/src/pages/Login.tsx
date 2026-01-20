import type { DocumentHead } from '@builder.io/qwik-city'
import { LoginRoute, LoginSkeleton, resolveAuthFormState, type AuthCopy, type AuthFormState } from '../login-route'

export type { AuthCopy, AuthFormState }
export { LoginRoute, LoginSkeleton, resolveAuthFormState }

export const head: DocumentHead = {
  title: 'Login',
  meta: [
    {
      name: 'description',
      content: 'Authenticate to access your workspace and deployment history.'
    }
  ]
}

export const skeleton = LoginSkeleton

export default LoginRoute
