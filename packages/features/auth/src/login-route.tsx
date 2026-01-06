import { component$ } from '@builder.io/qwik'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'

export type AuthCopy = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
  closeLabel: string
}

const defaultAuthCopy: AuthCopy = {
  metaLine: 'Secure Access',
  title: 'Login',
  description: 'Access your workspace and deployment history.',
  actionLabel: 'Sign in',
  closeLabel: 'Close'
}

export const LoginRoute = component$<{
  copy?: Partial<AuthCopy>
}>(({ copy }) => {
  const resolvedCopy = { ...defaultAuthCopy, ...copy }

  return (
    <StaticRouteTemplate
      metaLine={resolvedCopy.metaLine}
      title={resolvedCopy.title}
      description={resolvedCopy.description}
      actionLabel={resolvedCopy.actionLabel}
      closeLabel={resolvedCopy.closeLabel}
    />
  )
})

export const LoginSkeleton = () => <StaticRouteSkeleton />

export default LoginRoute
