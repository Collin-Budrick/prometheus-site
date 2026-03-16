import type { Lang } from '../lang'
import type { FragmentRuntimePlanEntry } from '../fragment/runtime/protocol'
import type { ContactInvitesSeed } from '../shared/contact-invites-seed'
import type { StoreSeed } from '../shared/store-seed'
import type { StaticShellAuthPolicy } from './constants'

export type StaticFragmentRouteData = {
  lang: Lang
  path: string
  snapshotKey: string
  authPolicy: StaticShellAuthPolicy
  bootstrapMode: 'fragment-static'
  fragmentOrder: string[]
  planSignature: string
  versionSignature: string
  runtimePlanEntries: FragmentRuntimePlanEntry[]
  fragmentVersions: Record<string, number>
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
}
