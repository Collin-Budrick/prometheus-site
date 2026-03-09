import type { DocumentHead } from '@builder.io/qwik-city'
import { LoginRoute, LoginSkeleton, type AuthCopy } from '../login-route'
import { resolveAuthFormState, type AuthFormState } from '../auth-form-state'

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
