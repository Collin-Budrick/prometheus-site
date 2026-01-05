import type { FragmentHeaderCopy } from './shared/fragment-copy'
import type { UiCopy } from './shared/ui-copy'

export type SiteFeature = 'store' | 'lab' | 'login'
export type Lang = 'en' | 'ko'
export type NavItem = { href: string; labelKey: keyof UiCopy; feature?: SiteFeature }
export type LabPageCopy = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
}

export const siteBrand = {
  name: 'Prometheus',
  product: 'Binary Fragment Platform',
  tagline: 'Binary-first rendering, fragment-native delivery.',
  metaDescription:
    'Binary-first rendering pipeline with fragment-addressable delivery, edge-ready caching, and zero-hydration UX.',
  themeColor: '#f97316'
}

export const siteFeatures: Record<SiteFeature, boolean> = {
  store: true,
  lab: true,
  login: true
}

export const supportedLanguages: Lang[] = ['en', 'ko']
export const defaultLanguage: Lang = 'en'

export const navItems: ReadonlyArray<NavItem> = [
  { href: '/', labelKey: 'navHome' },
  { href: '/store', labelKey: 'navStore', feature: 'store' },
  { href: '/lab', labelKey: 'navLab', feature: 'lab' },
  { href: '/login', labelKey: 'navLogin', feature: 'login' }
]

const buildEnabledNav = () =>
  navItems.filter((item) => {
    if (!item.feature) return true
    return siteFeatures[item.feature] !== false
  })

export const enabledNavItems = buildEnabledNav()
export const enabledRouteOrder = enabledNavItems.map((item) => item.href)

export const uiCopy: Record<Lang, UiCopy> = {
  en: {
    navHome: 'Home',
    navStore: 'Store',
    navLab: 'Lab',
    navLogin: 'Login',
    dockAriaLabel: 'Dock shortcuts',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeAriaToLight: 'Switch to light mode',
    themeAriaToDark: 'Switch to dark mode',
    languageShortEn: 'EN',
    languageShortKo: 'KO',
    languageAriaToEn: 'Switch to English',
    languageAriaToKo: 'Switch to Korean',
    fragmentStatusStreaming: 'Streaming fragments',
    fragmentStatusStalled: 'Stream stalled',
    fragmentStatusIdle: 'Idle',
    fragmentLoading: 'Loading fragment {id}',
    fragmentClose: 'Close',
    storeMetaLine: 'Store',
    storeTitle: 'Store',
    storeDescription: 'Browse curated modules, fragments, and templates designed for fast binary delivery.',
    storeAction: 'Browse catalog',
    loginMetaLine: 'Login',
    loginTitle: 'Login',
    loginDescription: 'Access your workspace, release controls, and deployment history.',
    loginAction: 'Request access',
    featureUnavailableMeta: 'Unavailable',
    featureUnavailableTitle: 'This feature is disabled',
    featureUnavailableDescription: 'Enable the feature in site config to expose this route.',
    featureUnavailableAction: 'Return home'
  },
  ko: {
    navHome: '홈',
    navStore: '스토어',
    navLab: '랩',
    navLogin: '로그인',
    dockAriaLabel: 'Dock 바로가기',
    themeLight: '라이트',
    themeDark: '다크',
    themeAriaToLight: '라이트 모드로 전환',
    themeAriaToDark: '다크 모드로 전환',
    languageShortEn: 'EN',
    languageShortKo: 'KO',
    languageAriaToEn: '영어로 전환',
    languageAriaToKo: '한국어로 전환',
    fragmentStatusStreaming: '프래그먼트 스트리밍',
    fragmentStatusStalled: '스트림 중단',
    fragmentStatusIdle: '대기',
    fragmentLoading: '프래그먼트 {id} 로딩 중',
    fragmentClose: '닫기',
    storeMetaLine: '스토어',
    storeTitle: '스토어',
    storeDescription:
      '빠른 바이너리 전달을 위해 큐레이션된 모듈, 프래그먼트, 템플릿을 살펴보세요.',
    storeAction: '카탈로그 보기',
    loginMetaLine: '로그인',
    loginTitle: '로그인',
    loginDescription: '워크스페이스, 릴리스 제어, 배포 기록에 접근하세요.',
    loginAction: '접근 요청',
    featureUnavailableMeta: '사용 불가',
    featureUnavailableTitle: '이 기능은 비활성화되었습니다',
    featureUnavailableDescription: '이 라우트를 노출하려면 사이트 설정에서 기능을 활성화하세요.',
    featureUnavailableAction: '홈으로 돌아가기'
  }
}

export const fragmentHeaderCopy: Record<Lang, Record<string, FragmentHeaderCopy>> = {
  en: {
    'fragment://page/home/hero@v1': {
      heading: 'h1',
      metaLine: ['fragment addressable', 'edge-primary'],
      title: 'Binary-first. Fragment-native. Zero hydration.',
      description:
        'The render tree is the artifact. HTML is a fallback. Every surface is compiled into deterministic binary fragments for replay, caching, and instant patching.'
    },
    'fragment://page/home/planner@v1': {
      heading: 'h2',
      metaLine: 'fragment planner',
      title: 'Planner executes before rendering.',
      description:
        'Dependency resolution, cache hit checks, and runtime selection happen up front. Rendering only occurs on cache miss; revalidation runs asynchronously.'
    },
    'fragment://page/home/ledger@v1': {
      heading: 'h2',
      metaLine: 'wasm renderer',
      title: 'Hot-path fragments rendered by WASM.',
      description:
        'Critical transforms run inside WebAssembly for deterministic, edge-safe execution. Numeric outputs feed fragment composition without touching HTML.'
    },
    'fragment://page/home/island@v1': {
      heading: 'h2',
      metaLine: 'preact island',
      title: 'Isolated client islands stay sandboxed.',
      description:
        'Preact loads only inside the island boundary. No shared state, no routing ownership, no global hydration.'
    },
    'fragment://page/home/react@v1': {
      heading: 'h2',
      metaLine: 'react authoring',
      title: 'React stays server-only.',
      description:
        'React fragments compile into binary trees without client hydration. The DOM remains owned by Qwik.'
    },
    'fragment://page/home/dock@v1': {
      heading: 'h2',
      metaLine: 'react dock',
      title: 'Server-only dock fragment.',
      description: 'MagicUI dock authored in React, compiled to a static fragment.'
    }
  },
  ko: {
    'fragment://page/home/hero@v1': {
      heading: 'h1',
      metaLine: ['프래그먼트 주소 지정', '엣지 우선'],
      title: '바이너리 우선. 프래그먼트 네이티브. 하이드레이션 0.',
      description:
        '렌더 트리는 산출물입니다. HTML은 대체 수단입니다. 모든 표면은 재생, 캐싱, 즉시 패치를 위한 결정적 바이너리 프래그먼트로 컴파일됩니다.'
    },
    'fragment://page/home/planner@v1': {
      heading: 'h2',
      metaLine: '프래그먼트 플래너',
      title: '플래너는 렌더링 전에 실행됩니다.',
      description:
        '의존성 해소, 캐시 히트 확인, 런타임 선택이 먼저 이뤄집니다. 렌더링은 캐시 미스일 때만 수행되며 재검증은 비동기로 실행됩니다.'
    },
    'fragment://page/home/ledger@v1': {
      heading: 'h2',
      metaLine: 'WASM 렌더러',
      title: 'WASM으로 렌더링된 핫패스 프래그먼트.',
      description:
        '결정적이고 엣지 안전한 실행을 위해 핵심 변환은 WebAssembly 안에서 실행됩니다. 숫자 출력은 HTML을 건드리지 않고 프래그먼트 구성을 구동합니다.'
    },
    'fragment://page/home/island@v1': {
      heading: 'h2',
      metaLine: 'Preact 아일랜드',
      title: '분리된 클라이언트 아일랜드는 샌드박스 상태를 유지합니다.',
      description:
        'Preact는 아일랜드 경계 안에서만 로드됩니다. 공유 상태, 라우팅 소유권, 전역 하이드레이션도 없습니다.'
    },
    'fragment://page/home/react@v1': {
      heading: 'h2',
      metaLine: 'React 저작',
      title: 'React는 서버 전용입니다.',
      description:
        'React 프래그먼트는 클라이언트 하이드레이션 없이 바이너리 트리로 컴파일됩니다. DOM은 Qwik이 소유합니다.'
    },
    'fragment://page/home/dock@v1': {
      heading: 'h2',
      metaLine: 'React 도크',
      title: '서버 전용 도크 프래그먼트.',
      description: 'React로 작성한 MagicUI 도크를 정적 프래그먼트로 컴파일합니다.'
    }
  }
}

export const labCopy: Record<Lang, LabPageCopy> = {
  en: {
    metaLine: 'Lab',
    title: 'Lab',
    description: 'Prototype new fragment systems, run experiments, and validate edge behaviors.',
    actionLabel: 'Launch experiment'
  },
  ko: {
    metaLine: '랩',
    title: '랩',
    description:
      '새로운 프래그먼트 시스템을 프로토타이핑하고 실험을 실행해 엣지 동작을 검증하세요.',
    actionLabel: '실험 시작'
  }
}
