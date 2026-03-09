import type { Lang } from '../lang'
import type { LanguageSeedPayload } from '../lang/selection'
import type { StaticShellAuthPolicy, StaticShellBootstrapMode } from './constants'

export type StaticShellSeed = {
  lang: Lang
  currentPath: string
  languageSeed: LanguageSeedPayload
  bootstrapMode: StaticShellBootstrapMode
  authPolicy: StaticShellAuthPolicy
  snapshotKey: string
}

export type StaticShellSnapshot = {
  path: string
  lang: Lang
  title: string
  regions: {
    header: string
    main: string
    dock: string
  }
}

export type StaticShellSnapshotManifest = Record<string, Partial<Record<Lang, string>>>

export type StaticIslandRouteKind = 'dashboard' | 'profile' | 'settings' | 'login'

export type StaticIslandRouteData = {
  lang: Lang
  path: string
  island: StaticIslandRouteKind
  authPolicy: StaticShellAuthPolicy
}
