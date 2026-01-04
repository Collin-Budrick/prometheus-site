import type { Lang } from './lang-store'

export type FragmentHeaderCopy = {
  heading: 'h1' | 'h2'
  metaLine?: string | string[]
  title: string
  description?: string
}

type FragmentCopyMap = Record<string, FragmentHeaderCopy>

const fragmentCopy: Record<Lang, FragmentCopyMap> = {
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
        'Preact는 아일랜드 경계 안에서만 로드됩니다. 공유 상태도, 라우팅 소유권도, 전역 하이드레이션도 없습니다.'
    },
    'fragment://page/home/react@v1': {
      heading: 'h2',
      metaLine: 'React 저작',
      title: 'React는 서버 전용입니다.',
      description:
        'React 프래그먼트는 클라이언트 하이드레이션 없이 바이너리 트리로 컴파일됩니다. DOM은 Qwik이 소유합니다.'
    }
  }
}

export const getFragmentHeaderCopy = (lang: Lang) => fragmentCopy[lang] ?? fragmentCopy.en
