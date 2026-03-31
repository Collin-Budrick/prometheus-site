export type Lang = string

export type UiCopy = {
  navHome: string
  navStore: string
  navLab: string
  navLogin: string
  navProfile: string
  navChat: string
  navSettings: string
  navDashboard: string
  dockAriaLabel: string
  themeLight: string
  themeDark: string
  themeAriaToLight: string
  themeAriaToDark: string
  languageToggleLabel: string
  fragmentStatusStreaming: string
  fragmentStatusStalled: string
  fragmentStatusIdle: string
  fragmentLoading: string
  fragmentClose: string
  demoActivate: string
  demoActivating: string
  homeIntroMarkdown: string
  homeIntroAuditLine: string
  homePrimaryStoreAction: string
  homePrimaryLabAction: string
  homePrimaryAuthAction: string
  homePrimaryShellAction: string
  homeSecondaryAuthAction: string
  homeSecondaryOfflineAction: string
  storeMetaLine: string
  storeTitle: string
  storeDescription: string
  storeAction: string
  loginMetaLine: string
  loginTitle: string
  loginDescription: string
  loginAction: string
  loginTab: string
  signupTab: string
  signupTitle: string
  signupDescription: string
  signupAction: string
  authNameLabel: string
  authEmailLabel: string
  authPasswordLabel: string
  authRememberLabel: string
  authPasskeyLabel: string
  authPasskeyHint: string
  authBiometricLoginLabel: string
  authBiometricLoginHint: string
  authBiometricLoginUnavailable: string
  authBiometricLoginFailed: string
  authBiometricLoginCredentialsExpired: string
  authSocialSectionLabel: string
  authMethodsLabel: string
  authHostedStatus: string
  authNotConfigured: string
  loginRuntimePendingLabel: string
  loginNextLabel: string
  authRedirectingMagicLink: string
  authRedirectingProvider: string
  authStartFailed: string
  authLogoutLabel: string
  profileNameAction: string
  profileNamePlaceholder: string
  profileIdLabel: string
  profileCardTitle: string
  profileCardHint: string
  profileBioLabel: string
  profileBioPlaceholder: string
  profileBioEmpty: string
  profilePhotoTitle: string
  profilePhotoHint: string
  profilePhotoUploadAction: string
  profilePhotoRemoveAction: string
  profileAvatarAlt: string
  profileColorTitle: string
  profileColorHint: string
  profileColorPickerAriaLabel: string
  profileColorRed: string
  profileColorGreen: string
  profileColorBlue: string
  profileSavedLocal: string
  profileSaveLocalFailed: string
  profileImageInvalid: string
  profileImageTooLarge: string
  profileImageReadFailed: string
  profileNameTooShort: string
  profileNameTooLong: string
  profileNameUpdateFailed: string
  profileNameUpdated: string
  settingsChatTitle: string
  settingsChatDescription: string
  settingsChatReadReceipts: string
  settingsChatReadReceiptsHint: string
  settingsChatTypingIndicators: string
  settingsChatTypingIndicatorsHint: string
  settingsInviteTitle: string
  settingsInviteDescription: string
  settingsInviteCodeLabel: string
  settingsInviteCopyAction: string
  settingsInviteRotateAction: string
  settingsInviteCopied: string
  settingsInviteRotated: string
  settingsInviteUnavailable: string
  settingsOfflineTitle: string
  settingsOfflineDescription: string
  settingsOfflineToggleLabel: string
  settingsOfflineToggleHint: string
  settingsOfflineRefreshLabel: string
  settingsOfflineRefreshHint: string
  settingsOfflineRefreshAction: string
  settingsOfflineRefreshPending: string
  settingsOfflineRefreshSuccess: string
  settingsOfflineCleanupLabel: string
  settingsOfflineCleanupHint: string
  settingsOfflineCleanupAction: string
  settingsOfflineCleanupPending: string
  settingsOfflineCleanupSuccess: string
  settingsOfflineSyncQueued: string
  settingsOfflineEnabled: string
  settingsOfflineDisabled: string
  settingsOfflineStorageError: string
  settingsNativeTitle: string
  settingsNativeDescription: string
  settingsNativeReviewAction: string
  settingsNativeReviewHint: string
  settingsNativeUpdateAction: string
  settingsNativeUpdateHint: string
  settingsNativeUnavailable: string
  settingsNativeRequestSuccess: string
  settingsNativeAccessibilityTitle: string
  settingsNativeAccessibilityDescription: string
  settingsNativeTextZoomAction: string
  settingsNativeTextZoomHint: string
  settingsNativeTextZoomAriaLabel: string
  settingsNativePrivacyShieldAction: string
  settingsNativePrivacyShieldHint: string
  settingsPasskeyTitle: string
  settingsPasskeyDescription: string
  settingsPasskeyAction: string
  settingsPasskeySuccess: string
  settingsPasskeyUnavailable: string
  settingsPasskeyFailed: string
  settingsLogoutFailed: string
  networkOfflineTitle: string
  networkOfflineHint: string
  networkOnlineTitle: string
  networkOnlineHint: string
  networkRetrySync: string
  networkSyncTitle: string
  networkSyncQueued: string
  networkCacheRefreshed: string
  networkCacheRefreshedHint: string
  networkCacheCleared: string
  networkCacheClearedHint: string
  protectedMetaLine: string
  protectedDescription: string
  protectedAction: string
  featureUnavailableMeta: string
  featureUnavailableTitle: string
  featureUnavailableDescription: string
  featureUnavailableAction: string
}

export type FragmentHeaderCopy = {
  heading: 'h1' | 'h2'
  metaLine?: string | string[]
  title: string
  description?: string
}

export type LabPageCopy = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
}

export type PlannerDemoCopy = {
  title: string
  run: string
  running: string
  shuffle: string
  waiting: string
  steps: Array<{
    id: string
    label: string
    hint: string
  }>
  fragments: Array<{
    id: string
    label: string
    deps: string[]
    runtime: string
  }>
  labels: {
    dependencies: string
    cache: string
    runtime: string
  }
  root: string
  resolved: string
  pending: string
  hit: string
  miss: string
  checked: string
  waitingCache: string
  selecting: string
  renderNow: string
  skipRender: string
  awaitRender: string
  revalidateQueued: string
  freshRender: string
  awaitRevalidate: string
}

export type WasmRendererDemoCopy = {
  title: string
  run: string
  subtitle: string
  panels: {
    inputs: string
    wasm: string
    fragment: string
  }
  aria: {
    decreaseA: string
    increaseA: string
    decreaseB: string
    increaseB: string
  }
  notes: {
    inputs: string
    wasm: string
    fragment: string
  }
  metrics: {
    burst: string
    hotPath: string
  }
  footer: {
    edgeSafe: string
    deterministic: string
    htmlUntouched: string
  }
}

export type ReactBinaryDemoCopy = {
  title: string
  actions: {
    react: string
    binary: string
    qwik: string
  }
  stages: Array<{
    id: string
    label: string
    hint: string
  }>
  ariaStages: string
  panels: {
    reactTitle: string
    binaryTitle: string
    qwikTitle: string
    reactCaption: string
    binaryCaption: string
    qwikCaption: string
  }
  footer: {
    hydrationSkipped: string
    binaryStream: string
  }
}

export type PreactIslandCopy = {
  label: string
  countdown: string
  ready: string
  readySub: string
  activeSub: string
  reset: string
}

export type DemoCopy = {
  planner: PlannerDemoCopy
  wasmRenderer: WasmRendererDemoCopy
  reactBinary: ReactBinaryDemoCopy
  preactIsland: PreactIslandCopy
}

export type LanguagePack = {
  ui: UiCopy
  fragmentHeaders: Record<string, FragmentHeaderCopy>
  lab: LabPageCopy
  demos: DemoCopy
  fragments?: Record<string, string>
}
