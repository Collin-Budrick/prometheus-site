import type { Lang, PlannerDemoCopy, PreactIslandCopy, ReactBinaryDemoCopy, UiCopy, WasmRendererDemoCopy } from '../lang'
import { defaultLanguage } from '../lang/manifest'
import type { LanguageSeedPayload } from '../lang/selection'
import { normalizeStaticShellLang } from './lang-param'

export type HomeStaticUiCopy = Pick<
  UiCopy,
  | 'navHome'
  | 'navStore'
  | 'navLab'
  | 'navLogin'
  | 'navProfile'
  | 'navChat'
  | 'navSettings'
  | 'navDashboard'
  | 'dockAriaLabel'
  | 'themeAriaToLight'
  | 'themeAriaToDark'
  | 'languageToggleLabel'
  | 'fragmentStatusStreaming'
  | 'fragmentStatusStalled'
  | 'fragmentStatusIdle'
  | 'demoActivate'
  | 'demoActivating'
  | 'homeIntroMarkdown'
>

type HomeStaticCopyState = {
  ui: Partial<HomeStaticUiCopy>
  demos: Partial<{
    planner: PlannerDemoCopy
    wasmRenderer: WasmRendererDemoCopy
    reactBinary: ReactBinaryDemoCopy
    preactIsland: PreactIslandCopy
  }>
}

const emptyUiCopy: HomeStaticUiCopy = {
  navHome: '',
  navStore: '',
  navLab: '',
  navLogin: '',
  navProfile: '',
  navChat: '',
  navSettings: '',
  navDashboard: '',
  dockAriaLabel: '',
  themeAriaToLight: '',
  themeAriaToDark: '',
  languageToggleLabel: '',
  fragmentStatusStreaming: '',
  fragmentStatusStalled: '',
  fragmentStatusIdle: '',
  demoActivate: '',
  demoActivating: '',
  homeIntroMarkdown: ''
}

const emptyPlannerDemoCopy: PlannerDemoCopy = {
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

const emptyWasmRendererDemoCopy: WasmRendererDemoCopy = {
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

const emptyReactBinaryDemoCopy: ReactBinaryDemoCopy = {
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

const emptyPreactIslandCopy: PreactIslandCopy = {
  label: '',
  countdown: '',
  ready: '',
  readySub: '',
  activeSub: '',
  reset: ''
}

const homeCopyCache = new Map<string, HomeStaticCopyState>()

const cloneUi = (value?: Partial<HomeStaticUiCopy>) => ({ ...(value ?? {}) })
const omitUndefined = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>

const clonePlannerDemo = (value?: PlannerDemoCopy): PlannerDemoCopy => ({
  ...emptyPlannerDemoCopy,
  ...(value ?? {}),
  labels: {
    ...emptyPlannerDemoCopy.labels,
    ...(value?.labels ?? {})
  },
  steps: value?.steps ? value.steps.map((step) => ({ ...step })) : [],
  fragments: value?.fragments ? value.fragments.map((fragment) => ({ ...fragment, deps: [...fragment.deps] })) : []
})

const cloneWasmRendererDemo = (value?: WasmRendererDemoCopy): WasmRendererDemoCopy => ({
  ...emptyWasmRendererDemoCopy,
  ...(value ?? {}),
  panels: {
    ...emptyWasmRendererDemoCopy.panels,
    ...(value?.panels ?? {})
  },
  aria: {
    ...emptyWasmRendererDemoCopy.aria,
    ...(value?.aria ?? {})
  },
  notes: {
    ...emptyWasmRendererDemoCopy.notes,
    ...(value?.notes ?? {})
  },
  metrics: {
    ...emptyWasmRendererDemoCopy.metrics,
    ...(value?.metrics ?? {})
  },
  footer: {
    ...emptyWasmRendererDemoCopy.footer,
    ...(value?.footer ?? {})
  }
})

const cloneReactBinaryDemo = (value?: ReactBinaryDemoCopy): ReactBinaryDemoCopy => ({
  ...emptyReactBinaryDemoCopy,
  ...(value ?? {}),
  actions: {
    ...emptyReactBinaryDemoCopy.actions,
    ...(value?.actions ?? {})
  },
  stages: value?.stages ? value.stages.map((stage) => ({ ...stage })) : [],
  panels: {
    ...emptyReactBinaryDemoCopy.panels,
    ...(value?.panels ?? {})
  },
  footer: {
    ...emptyReactBinaryDemoCopy.footer,
    ...(value?.footer ?? {})
  }
})

const clonePreactIslandDemo = (value?: PreactIslandCopy): PreactIslandCopy => ({
  ...emptyPreactIslandCopy,
  ...(value ?? {})
})

const resolveHomeCopyLang = (lang: Lang | string) => normalizeStaticShellLang(lang)

const toHomeUi = (payload?: LanguageSeedPayload): Partial<HomeStaticUiCopy> =>
  omitUndefined({
    navHome: payload?.ui?.navHome,
    navStore: payload?.ui?.navStore,
    navLab: payload?.ui?.navLab,
    navLogin: payload?.ui?.navLogin,
    navProfile: payload?.ui?.navProfile,
    navChat: payload?.ui?.navChat,
    navSettings: payload?.ui?.navSettings,
    navDashboard: payload?.ui?.navDashboard,
    dockAriaLabel: payload?.ui?.dockAriaLabel,
    themeAriaToLight: payload?.ui?.themeAriaToLight,
    themeAriaToDark: payload?.ui?.themeAriaToDark,
    languageToggleLabel: payload?.ui?.languageToggleLabel,
    fragmentStatusStreaming: payload?.ui?.fragmentStatusStreaming,
    fragmentStatusStalled: payload?.ui?.fragmentStatusStalled,
    fragmentStatusIdle: payload?.ui?.fragmentStatusIdle,
    demoActivate: payload?.ui?.demoActivate,
    demoActivating: payload?.ui?.demoActivating,
    homeIntroMarkdown: payload?.ui?.homeIntroMarkdown
  })

export const seedStaticHomeCopy = (
  lang: Lang,
  shellSeed: LanguageSeedPayload,
  routeSeed: LanguageSeedPayload
) => {
  const normalized = resolveHomeCopyLang(lang)
  const existing = homeCopyCache.get(normalized)
  homeCopyCache.set(normalized, {
    ui: {
      ...(existing?.ui ?? {}),
      ...cloneUi(toHomeUi(shellSeed)),
      ...cloneUi(toHomeUi(routeSeed))
    },
    demos: {
      ...(existing?.demos ?? {}),
      ...(routeSeed.demos?.planner ? { planner: clonePlannerDemo(routeSeed.demos.planner) } : {}),
      ...(routeSeed.demos?.wasmRenderer
        ? { wasmRenderer: cloneWasmRendererDemo(routeSeed.demos.wasmRenderer) }
        : {}),
      ...(routeSeed.demos?.reactBinary ? { reactBinary: cloneReactBinaryDemo(routeSeed.demos.reactBinary) } : {}),
      ...(routeSeed.demos?.preactIsland
        ? { preactIsland: clonePreactIslandDemo(routeSeed.demos.preactIsland) }
        : {})
    }
  })
}

const getHomeStaticState = (lang: Lang | string): HomeStaticCopyState | undefined =>
  homeCopyCache.get(lang.trim().toLowerCase()) ??
  homeCopyCache.get(resolveHomeCopyLang(lang)) ??
  homeCopyCache.get(defaultLanguage)

export const getStaticHomeUiCopy = (lang: Lang | string): HomeStaticUiCopy => ({
  ...emptyUiCopy,
  ...(getHomeStaticState(lang)?.ui ?? {})
})

export const getStaticHomePlannerDemoCopy = (lang: Lang | string): PlannerDemoCopy =>
  clonePlannerDemo(getHomeStaticState(lang)?.demos.planner)

export const getStaticHomeWasmRendererDemoCopy = (lang: Lang | string): WasmRendererDemoCopy =>
  cloneWasmRendererDemo(getHomeStaticState(lang)?.demos.wasmRenderer)

export const getStaticHomeReactBinaryDemoCopy = (lang: Lang | string): ReactBinaryDemoCopy =>
  cloneReactBinaryDemo(getHomeStaticState(lang)?.demos.reactBinary)

export const getStaticHomePreactIslandDemoCopy = (lang: Lang | string): PreactIslandCopy =>
  clonePreactIslandDemo(getHomeStaticState(lang)?.demos.preactIsland)

export const resetStaticHomeCopyForTests = () => {
  homeCopyCache.clear()
}
