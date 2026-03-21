import type { Lang } from '../../lang'
import type { FragmentPayload } from '../../fragment/types'
import type { FragmentRuntimePlanEntry } from '../../fragment/runtime/protocol'
import type { ContactInvitesSeed } from '../../shared/contact-invites-seed'
import type { StoreSeed } from '../../features/store/store-seed'
import type { StaticShellAuthPolicy } from '../core/constants'

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
  runtimeFetchGroups?: string[][]
  runtimeInitialFragments?: FragmentPayload[]
  fragmentVersions: Record<string, number>
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
}
