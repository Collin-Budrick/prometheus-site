import type {
  DemoCopy,
  FragmentHeaderCopy,
  LanguagePack,
  LabPageCopy,
  PreactIslandCopy,
  PlannerDemoCopy,
  ReactBinaryDemoCopy,
  UiCopy,
  WasmRendererDemoCopy
} from './types'

export type UiCopyKey = keyof UiCopy
export type DemoCopyKey = keyof DemoCopy

export type LanguageResourceSelection = {
  ui?: readonly UiCopyKey[]
  demos?: readonly DemoCopyKey[]
  lab?: boolean
  fragments?: boolean
  fragmentHeaders?: true | readonly string[]
}

export type LanguageSeedPayload = {
  ui?: Partial<UiCopy>
  demos?: Partial<DemoCopy>
  lab?: LabPageCopy
  fragments?: Record<string, string>
  fragmentHeaders?: Record<string, FragmentHeaderCopy>
}

export const shellUiKeys = [
  'navHome',
  'navStore',
  'navLab',
  'navLogin',
  'navProfile',
  'navChat',
  'navSettings',
  'navDashboard',
  'dockAriaLabel',
  'themeAriaToLight',
  'themeAriaToDark',
  'languageToggleLabel',
  'fragmentStatusStreaming',
  'fragmentStatusStalled',
  'fragmentStatusIdle',
  'fragmentLoading',
  'fragmentClose'
] as const satisfies readonly UiCopyKey[]

export const shellLanguageSelection: LanguageResourceSelection = {
  ui: shellUiKeys
}

export const homeUiKeys = [
  'homeIntroMarkdown',
  'demoActivate',
  'demoActivating'
] as const satisfies readonly UiCopyKey[]

export const storeUiKeys = [
  'storeMetaLine',
  'storeTitle',
  'storeDescription',
  'storeAction',
  'featureUnavailableMeta',
  'featureUnavailableTitle',
  'featureUnavailableDescription',
  'featureUnavailableAction'
] as const satisfies readonly UiCopyKey[]

export const loginUiKeys = [
  'loginMetaLine',
  'loginTitle',
  'loginDescription',
  'loginAction',
  'loginTab',
  'signupTab',
  'signupTitle',
  'signupDescription',
  'signupAction',
  'authNameLabel',
  'authEmailLabel',
  'authPasswordLabel',
  'authRememberLabel',
  'authPasskeyLabel',
  'authPasskeyHint',
  'authBiometricLoginLabel',
  'authBiometricLoginHint',
  'authBiometricLoginUnavailable',
  'authBiometricLoginFailed',
  'authBiometricLoginCredentialsExpired',
  'authSocialSectionLabel',
  'authMethodsLabel',
  'authHostedStatus',
  'authNotConfigured',
  'authRedirectingMagicLink',
  'authRedirectingProvider',
  'authStartFailed',
  'featureUnavailableMeta',
  'featureUnavailableTitle',
  'featureUnavailableDescription',
  'featureUnavailableAction'
] as const satisfies readonly UiCopyKey[]

export const protectedUiKeys = [
  'protectedMetaLine',
  'protectedDescription',
  'protectedAction'
] as const satisfies readonly UiCopyKey[]

export const profileUiKeys = [
  'profileNameAction',
  'profileNamePlaceholder',
  'profileIdLabel',
  'profileCardTitle',
  'profileCardHint',
  'profileBioLabel',
  'profileBioPlaceholder',
  'profileBioEmpty',
  'profilePhotoTitle',
  'profilePhotoHint',
  'profilePhotoUploadAction',
  'profilePhotoRemoveAction',
  'profileAvatarAlt',
  'profileColorTitle',
  'profileColorHint',
  'profileColorPickerAriaLabel',
  'profileColorRed',
  'profileColorGreen',
  'profileColorBlue',
  'profileSavedLocal',
  'profileSaveLocalFailed',
  'profileImageInvalid',
  'profileImageTooLarge',
  'profileImageReadFailed',
  'profileNameTooShort',
  'profileNameTooLong',
  'profileNameUpdateFailed',
  'profileNameUpdated',
  'authNameLabel',
  'authEmailLabel'
] as const satisfies readonly UiCopyKey[]

export const settingsUiKeys = [
  'authLogoutLabel',
  'settingsChatTitle',
  'settingsChatDescription',
  'settingsChatReadReceipts',
  'settingsChatReadReceiptsHint',
  'settingsChatTypingIndicators',
  'settingsChatTypingIndicatorsHint',
  'settingsInviteTitle',
  'settingsInviteDescription',
  'settingsInviteCodeLabel',
  'settingsInviteCopyAction',
  'settingsInviteRotateAction',
  'settingsInviteCopied',
  'settingsInviteRotated',
  'settingsInviteUnavailable',
  'settingsOfflineTitle',
  'settingsOfflineDescription',
  'settingsOfflineToggleLabel',
  'settingsOfflineToggleHint',
  'settingsOfflineRefreshLabel',
  'settingsOfflineRefreshHint',
  'settingsOfflineRefreshAction',
  'settingsOfflineRefreshPending',
  'settingsOfflineRefreshSuccess',
  'settingsOfflineCleanupLabel',
  'settingsOfflineCleanupHint',
  'settingsOfflineCleanupAction',
  'settingsOfflineCleanupPending',
  'settingsOfflineCleanupSuccess',
  'settingsOfflineSyncQueued',
  'settingsOfflineEnabled',
  'settingsOfflineDisabled',
  'settingsOfflineStorageError',
  'settingsNativeAccessibilityTitle',
  'settingsNativeAccessibilityDescription',
  'settingsNativeTextZoomAction',
  'settingsNativeTextZoomHint',
  'settingsNativeTextZoomAriaLabel',
  'settingsNativePrivacyShieldAction',
  'settingsNativePrivacyShieldHint',
  'settingsLogoutFailed'
] as const satisfies readonly UiCopyKey[]

export const allDemoKeys = [
  'planner',
  'wasmRenderer',
  'reactBinary',
  'preactIsland'
] as const satisfies readonly DemoCopyKey[]

export const homeLanguageSelection: LanguageResourceSelection = {
  ui: homeUiKeys,
  demos: allDemoKeys,
  fragments: true
}

export const storeLanguageSelection: LanguageResourceSelection = {
  ui: storeUiKeys,
  fragments: true
}

export const loginLanguageSelection: LanguageResourceSelection = {
  ui: loginUiKeys
}

export const labLanguageSelection: LanguageResourceSelection = {
  ui: ['featureUnavailableMeta', 'featureUnavailableTitle', 'featureUnavailableDescription', 'featureUnavailableAction'],
  lab: true
}

export const chatLanguageSelection: LanguageResourceSelection = {
  ui: [...protectedUiKeys, 'navChat']
}

export const dashboardLanguageSelection: LanguageResourceSelection = {
  ui: [...protectedUiKeys, 'navDashboard']
}

export const profileLanguageSelection: LanguageResourceSelection = {
  ui: [...protectedUiKeys, 'navProfile', ...profileUiKeys]
}

export const settingsLanguageSelection: LanguageResourceSelection = {
  ui: [...protectedUiKeys, 'navSettings', ...settingsUiKeys]
}

export const emptyLabCopy: LabPageCopy = {
  metaLine: '',
  title: '',
  description: '',
  actionLabel: ''
}

export const emptyPlannerDemoCopy: PlannerDemoCopy = {
  title: '',
  run: '',
  running: '',
  shuffle: '',
  waiting: '',
  steps: [],
  fragments: [],
  labels: {
    dependencies: '',
    cache: '',
    runtime: ''
  },
  root: '',
  resolved: '',
  pending: '',
  hit: '',
  miss: '',
  checked: '',
  waitingCache: '',
  selecting: '',
  renderNow: '',
  skipRender: '',
  awaitRender: '',
  revalidateQueued: '',
  freshRender: '',
  awaitRevalidate: ''
}

export const emptyWasmRendererDemoCopy: WasmRendererDemoCopy = {
  title: '',
  run: '',
  subtitle: '',
  panels: {
    inputs: '',
    wasm: '',
    fragment: ''
  },
  aria: {
    decreaseA: '',
    increaseA: '',
    decreaseB: '',
    increaseB: ''
  },
  notes: {
    inputs: '',
    wasm: '',
    fragment: ''
  },
  metrics: {
    burst: '',
    hotPath: ''
  },
  footer: {
    edgeSafe: '',
    deterministic: '',
    htmlUntouched: ''
  }
}

export const emptyReactBinaryDemoCopy: ReactBinaryDemoCopy = {
  title: '',
  actions: {
    react: '',
    binary: '',
    qwik: ''
  },
  stages: [],
  ariaStages: '',
  panels: {
    reactTitle: '',
    binaryTitle: '',
    qwikTitle: '',
    reactCaption: '',
    binaryCaption: '',
    qwikCaption: ''
  },
  footer: {
    hydrationSkipped: '',
    binaryStream: ''
  }
}

export const emptyPreactIslandCopy: PreactIslandCopy = {
  label: '',
  countdown: '',
  ready: '',
  readySub: '',
  activeSub: '',
  reset: ''
}

export const allUiCopyKeys = [
  'navHome',
  'navStore',
  'navLab',
  'navLogin',
  'navProfile',
  'navChat',
  'navSettings',
  'navDashboard',
  'dockAriaLabel',
  'themeLight',
  'themeDark',
  'themeAriaToLight',
  'themeAriaToDark',
  'languageToggleLabel',
  'fragmentStatusStreaming',
  'fragmentStatusStalled',
  'fragmentStatusIdle',
  'fragmentLoading',
  'fragmentClose',
  'demoActivate',
  'demoActivating',
  'homeIntroMarkdown',
  'storeMetaLine',
  'storeTitle',
  'storeDescription',
  'storeAction',
  'loginMetaLine',
  'loginTitle',
  'loginDescription',
  'loginAction',
  'loginTab',
  'signupTab',
  'signupTitle',
  'signupDescription',
  'signupAction',
  'authNameLabel',
  'authEmailLabel',
  'authPasswordLabel',
  'authRememberLabel',
  'authPasskeyLabel',
  'authPasskeyHint',
  'authBiometricLoginLabel',
  'authBiometricLoginHint',
  'authBiometricLoginUnavailable',
  'authBiometricLoginFailed',
  'authBiometricLoginCredentialsExpired',
  'authSocialSectionLabel',
  'authMethodsLabel',
  'authHostedStatus',
  'authNotConfigured',
  'authRedirectingMagicLink',
  'authRedirectingProvider',
  'authStartFailed',
  'authLogoutLabel',
  'profileNameAction',
  'profileNamePlaceholder',
  'profileIdLabel',
  'profileCardTitle',
  'profileCardHint',
  'profileBioLabel',
  'profileBioPlaceholder',
  'profileBioEmpty',
  'profilePhotoTitle',
  'profilePhotoHint',
  'profilePhotoUploadAction',
  'profilePhotoRemoveAction',
  'profileAvatarAlt',
  'profileColorTitle',
  'profileColorHint',
  'profileColorPickerAriaLabel',
  'profileColorRed',
  'profileColorGreen',
  'profileColorBlue',
  'profileSavedLocal',
  'profileSaveLocalFailed',
  'profileImageInvalid',
  'profileImageTooLarge',
  'profileImageReadFailed',
  'profileNameTooShort',
  'profileNameTooLong',
  'profileNameUpdateFailed',
  'profileNameUpdated',
  'settingsChatTitle',
  'settingsChatDescription',
  'settingsChatReadReceipts',
  'settingsChatReadReceiptsHint',
  'settingsChatTypingIndicators',
  'settingsChatTypingIndicatorsHint',
  'settingsInviteTitle',
  'settingsInviteDescription',
  'settingsInviteCodeLabel',
  'settingsInviteCopyAction',
  'settingsInviteRotateAction',
  'settingsInviteCopied',
  'settingsInviteRotated',
  'settingsInviteUnavailable',
  'settingsOfflineTitle',
  'settingsOfflineDescription',
  'settingsOfflineToggleLabel',
  'settingsOfflineToggleHint',
  'settingsOfflineRefreshLabel',
  'settingsOfflineRefreshHint',
  'settingsOfflineRefreshAction',
  'settingsOfflineRefreshPending',
  'settingsOfflineRefreshSuccess',
  'settingsOfflineCleanupLabel',
  'settingsOfflineCleanupHint',
  'settingsOfflineCleanupAction',
  'settingsOfflineCleanupPending',
  'settingsOfflineCleanupSuccess',
  'settingsOfflineSyncQueued',
  'settingsOfflineEnabled',
  'settingsOfflineDisabled',
  'settingsOfflineStorageError',
  'settingsNativeTitle',
  'settingsNativeDescription',
  'settingsNativeReviewAction',
  'settingsNativeReviewHint',
  'settingsNativeUpdateAction',
  'settingsNativeUpdateHint',
  'settingsNativeUnavailable',
  'settingsNativeRequestSuccess',
  'settingsNativeAccessibilityTitle',
  'settingsNativeAccessibilityDescription',
  'settingsNativeTextZoomAction',
  'settingsNativeTextZoomHint',
  'settingsNativeTextZoomAriaLabel',
  'settingsNativePrivacyShieldAction',
  'settingsNativePrivacyShieldHint',
  'settingsLogoutFailed',
  'networkOfflineTitle',
  'networkOfflineHint',
  'networkOnlineTitle',
  'networkOnlineHint',
  'networkRetrySync',
  'networkSyncTitle',
  'networkSyncQueued',
  'networkCacheRefreshed',
  'networkCacheRefreshedHint',
  'networkCacheCleared',
  'networkCacheClearedHint',
  'protectedMetaLine',
  'protectedDescription',
  'protectedAction',
  'featureUnavailableMeta',
  'featureUnavailableTitle',
  'featureUnavailableDescription',
  'featureUnavailableAction'
] as const satisfies readonly UiCopyKey[]

const emptyUiEntries = allUiCopyKeys.map((key) => [key, ''])
export const emptyUiCopy: UiCopy = Object.fromEntries(emptyUiEntries) as UiCopy

const mergeUiKeys = (keys: readonly UiCopyKey[] | undefined, next: readonly UiCopyKey[] | undefined) => {
  const merged = new Set<UiCopyKey>(keys ?? [])
  next?.forEach((key) => merged.add(key))
  return Array.from(merged)
}

export const mergeLanguageSelections = (
  base: LanguageResourceSelection,
  next: LanguageResourceSelection
): LanguageResourceSelection => ({
  ui: mergeUiKeys(base.ui, next.ui),
  demos: Array.from(new Set([...(base.demos ?? []), ...(next.demos ?? [])])),
  lab: base.lab || next.lab,
  fragments: base.fragments || next.fragments,
  fragmentHeaders:
    base.fragmentHeaders === true || next.fragmentHeaders === true
      ? true
      : Array.from(new Set([...(base.fragmentHeaders ?? []), ...(next.fragmentHeaders ?? [])]))
})

const pickKeys = <T extends Record<string, unknown>, K extends keyof T>(value: T, keys: readonly K[]) =>
  keys.reduce<Pick<T, K>>((acc, key) => {
    acc[key] = value[key]
    return acc
  }, {} as Pick<T, K>)

export const selectLanguageResources = (
  pack: LanguagePack,
  selection: LanguageResourceSelection
): LanguageSeedPayload => {
  const payload: LanguageSeedPayload = {}
  if (selection.ui?.length) {
    payload.ui = pickKeys(pack.ui, selection.ui)
  }
  if (selection.demos?.length) {
    payload.demos = pickKeys(pack.demos, selection.demos)
  }
  if (selection.lab) {
    payload.lab = pack.lab
  }
  if (selection.fragments) {
    payload.fragments = pack.fragments ?? {}
  }
  if (selection.fragmentHeaders === true) {
    payload.fragmentHeaders = { ...pack.fragmentHeaders }
  } else if (selection.fragmentHeaders?.length) {
    payload.fragmentHeaders = selection.fragmentHeaders.reduce<Record<string, FragmentHeaderCopy>>((acc, id) => {
      const value = pack.fragmentHeaders[id]
      if (value) acc[id] = value
      return acc
    }, {})
  }
  return payload
}

export const mergeLanguageSeedPayload = (
  base: LanguageSeedPayload | undefined,
  next: LanguageSeedPayload
): LanguageSeedPayload => ({
  ui: { ...(base?.ui ?? {}), ...(next.ui ?? {}) },
  demos: { ...(base?.demos ?? {}), ...(next.demos ?? {}) },
  lab: next.lab ?? base?.lab,
  fragments: { ...(base?.fragments ?? {}), ...(next.fragments ?? {}) },
  fragmentHeaders: { ...(base?.fragmentHeaders ?? {}), ...(next.fragmentHeaders ?? {}) }
})

export const withFragmentHeaderSelection = (
  base: LanguageResourceSelection,
  fragmentHeaderIds: readonly string[]
): LanguageResourceSelection => ({
  ...base,
  fragmentHeaders: fragmentHeaderIds.length ? fragmentHeaderIds : base.fragmentHeaders
})

export const resolveRouteLanguageSelection = (pathName: string): LanguageResourceSelection => {
  const path = pathName || '/'
  if (path === '/') return { ...homeLanguageSelection, fragmentHeaders: true }
  if (path.startsWith('/store')) return { ...storeLanguageSelection, fragmentHeaders: true }
  if (path.startsWith('/login')) return { ...loginLanguageSelection, fragmentHeaders: true }
  if (path.startsWith('/lab')) return { ...labLanguageSelection, fragmentHeaders: true }
  if (path.startsWith('/chat')) return { ...chatLanguageSelection, fragmentHeaders: true }
  if (path.startsWith('/dashboard')) return dashboardLanguageSelection
  if (path.startsWith('/profile')) return profileLanguageSelection
  if (path.startsWith('/settings')) return settingsLanguageSelection
  return {}
}
