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
  authLogoutLabel: string
  profileNameAction: string
  settingsChatTitle: string
  settingsChatDescription: string
  settingsChatReadReceipts: string
  settingsChatReadReceiptsHint: string
  settingsChatTypingIndicators: string
  settingsChatTypingIndicatorsHint: string
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
