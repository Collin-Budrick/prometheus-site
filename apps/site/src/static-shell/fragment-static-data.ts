import type { Lang } from '../lang'
import type { ContactInvitesSeed } from '../shared/contact-invites-seed'
import type { StoreSeed } from '../shared/store-seed'

export type StaticFragmentRouteData = {
  lang: Lang
  path: string
  fragmentVersions: Record<string, number>
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
}

