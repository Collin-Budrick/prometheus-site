import {
  createFragmentTranslator as createCoreFragmentTranslator,
  defaultFragmentLang,
  normalizeFragmentLang,
  type FragmentLang,
  type FragmentTranslator
} from '@core/fragments'

const translations: Record<FragmentLang, Record<string, string>> = {
  en: {},
  ko: {
    'fragment addressable': '프래그먼트 주소 지정',
    'edge-primary': '엣지 우선',
    'Binary-first. Fragment-native. Zero hydration.':
      '바이너리 우선. 프래그먼트 네이티브. 하이드레이션 0.',
    'The render tree is the artifact. HTML is a fallback. Every surface is compiled into deterministic binary fragments for replay, caching, and instant patching.':
      '렌더 트리는 산출물입니다. HTML은 대체 수단입니다. 모든 표면은 재생, 캐싱, 즉시 패치를 위해 결정적 바이너리 프래그먼트로 컴파일됩니다.',
    'TTFB < 10ms target': 'TTFB < 10ms 목표',
    'KV as source of truth': 'KV를 단일 소스로',
    'Qwik-owned DOM': 'Qwik 소유 DOM',
    'Resumable by default: no hydration dependency.': '기본은 재개 가능: 하이드레이션 의존 없음.',
    'Fragment-level caching + async revalidation.': '프래그먼트 단위 캐싱 + 비동기 재검증.',
    'Deterministic replay with binary DOM trees.': '바이너리 DOM 트리로 결정적 재생.',
    'fragment planner': '프래그먼트 플래너',
    'Planner executes before rendering.': '플래너는 렌더링 전에 실행됩니다.',
    'Dependency resolution, cache hit checks, and runtime selection happen up front. Rendering only occurs on cache miss; revalidation runs asynchronously.':
      '의존성 해소, 캐시 히트 확인, 런타임 선택이 먼저 이뤄집니다. 렌더링은 캐시 미스일 때만 수행되며 재검증은 비동기로 실행됩니다.',
    Dependencies: '의존성',
    Resolved: '해결됨',
    'Cache hits': '캐시 히트',
    Parallel: '병렬',
    Runtime: '런타임',
    'Edge/Node': '엣지/노드',
    Revalidation: '재검증',
    Async: '비동기',
    'wasm renderer': 'WASM 렌더러',
    'Hot-path fragments rendered by WASM.': 'WASM으로 렌더링된 핫패스 프래그먼트.',
    'Critical transforms run inside WebAssembly for deterministic, edge-safe execution. Numeric outputs feed fragment composition without touching HTML.':
      '결정적이고 엣지 안전한 실행을 위해 핵심 변환은 WebAssembly 내부에서 실행됩니다. 숫자 출력은 HTML을 건드리지 않고 프래그먼트 구성을 구성합니다.',
    'Burst throughput': '버스트 처리량',
    'Hot-path score': '핫패스 점수',
    'Cache TTL': '캐시 TTL',
    'Stale TTL': '스테일 TTL',
    'preact island': 'Preact 아일랜드',
    'Isolated client islands stay sandboxed.': '분리된 클라이언트 아일랜드는 샌드박스 상태를 유지합니다.',
    'Preact loads only inside the island boundary. No shared state, no routing ownership, no global hydration.':
      'Preact는 아일랜드 경계 내부에서만 로드됩니다. 공유 상태, 라우팅 소유권, 전역 하이드레이션이 없습니다.',
    'Isolated island': '격리된 아일랜드',
    'react authoring': 'React 저작',
    'React stays server-only.': 'React는 서버 전용입니다.',
    'React fragments compile into binary trees without client hydration. The DOM remains owned by Qwik.':
      'React 프래그먼트는 클라이언트 하이드레이션 없이 바이너리 트리로 컴파일됩니다. DOM은 Qwik이 소유합니다.',
    'RSC-ready': 'RSC 준비됨',
    'react dock': 'React 도크',
    'Server-only dock fragment.': '서버 전용 도크 프래그먼트.',
    'MagicUI dock authored in React, compiled to a static fragment.':
      'React로 작성된 MagicUI 도크를 정적 프래그먼트로 컴파일합니다.',
    'Dock shortcuts': '도크 바로가기',
    'fragment missing': '프래그먼트 없음',
    'Fragment missing': '프래그먼트 없음',
    'No renderer registered for {{id}}.': '{{id}}에 등록된 렌더러가 없습니다.',
    'render error': '렌더 오류',
    'Fragment failed to render': '프래그먼트 렌더 실패',
    'Last error: {{error}}': '마지막 오류: {{error}}'
  }
}

export const createFragmentTranslator = (lang: string): FragmentTranslator =>
  createCoreFragmentTranslator(lang, translations, defaultFragmentLang)

export { defaultFragmentLang, normalizeFragmentLang }
export type { FragmentLang }
