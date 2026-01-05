export type FragmentLang = 'en' | 'ko'

export type FragmentTranslator = (value: string, params?: Record<string, string | number>) => string

export const defaultFragmentLang: FragmentLang = 'en'

export const normalizeFragmentLang = (value?: string | null): FragmentLang => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === '') return defaultFragmentLang
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('en')) return 'en'
  return defaultFragmentLang
}

const translations: Record<FragmentLang, Record<string, string>> = {
  en: {},
  ko: {
    'fragment addressable': '\uD504\uB798\uADF8\uBA3C\uD2B8 \uC8FC\uC18C \uC9C0\uC815',
    'edge-primary': '\uC5E3\uC9C0 \uC6B0\uC120',
    'Binary-first. Fragment-native. Zero hydration.':
      '\uBC14\uC774\uB108\uB9AC \uC6B0\uC120. \uD504\uB798\uADF8\uBA3C\uD2B8 \uB124\uC774\uD2F0\uBE0C. \uD558\uC774\uB4DC\uB808\uC774\uC158 0.',
    'The render tree is the artifact. HTML is a fallback. Every surface is compiled into deterministic binary fragments for replay, caching, and instant patching.':
      '\uB80C\uB354 \uD2B8\uB9AC\uB294 \uC0B0\uCD9C\uBB3C\uC785\uB2C8\uB2E4. HTML\uC740 \uB300\uCCB4 \uC218\uB2E8\uC785\uB2C8\uB2E4. \uBAA8\uB4E0 \uD45C\uBA74\uC740 \uC7AC\uC0DD, \uCE90\uC2F1, \uC989\uC2DC \uD328\uCE58\uB97C \uC704\uD55C \uACB0\uC815\uC801 \uBC14\uC774\uB108\uB9AC \uD504\uB798\uADF8\uBA3C\uD2B8\uB85C \uCEF4\uD30C\uC77C\uB429\uB2C8\uB2E4.',
    'TTFB < 10ms target': 'TTFB < 10ms \uBAA9\uD45C',
    'KV as source of truth': 'KV\uB97C \uB2E8\uC77C \uC18C\uC2A4\uB85C',
    'Qwik-owned DOM': 'Qwik \uC18C\uC720 DOM',
    'Resumable by default: no hydration dependency.':
      '\uAE30\uBCF8\uC740 \uC7AC\uAC1C \uAC00\uB2A5: \uD558\uC774\uB4DC\uB808\uC774\uC158 \uC758\uC874 \uC5C6\uC74C.',
    'Fragment-level caching + async revalidation.':
      '\uD504\uB798\uADF8\uBA3C\uD2B8 \uB2E8\uC704 \uCE90\uC2F1 + \uBE44\uB3D9\uAE30 \uC7AC\uAC80\uC99D.',
    'Deterministic replay with binary DOM trees.':
      '\uBC14\uC774\uB108\uB9AC DOM \uD2B8\uB9AC\uB85C \uACB0\uC815\uC801 \uC7AC\uC0DD.',
    'fragment planner': '\uD504\uB798\uADF8\uBA3C\uD2B8 \uD50C\uB798\uB108',
    'Planner executes before rendering.':
      '\uD50C\uB798\uB108\uB294 \uB80C\uB354\uB9C1 \uC804\uC5D0 \uC2E4\uD589\uB429\uB2C8\uB2E4.',
    'Dependency resolution, cache hit checks, and runtime selection happen up front. Rendering only occurs on cache miss; revalidation runs asynchronously.':
      '\uC758\uC874\uC131 \uD574\uC18C, \uCE90\uC2DC \uD788\uD2B8 \uD655\uC778, \uB7F0\uD0C0\uC784 \uC120\uD0DD\uC774 \uBA3C\uC800 \uC774\uB8E8\uC5B4\uC9D1\uB2C8\uB2E4. \uB80C\uB354\uB9C1\uC740 \uCE90\uC2DC \uBBF8\uC2A4\uC77C \uB54C\uB9CC \uC218\uD589\uB418\uBA70 \uC7AC\uAC80\uC99D\uC740 \uBE44\uB3D9\uAE30\uB85C \uC2E4\uD589\uB429\uB2C8\uB2E4.',
    Dependencies: '\uC758\uC874\uC131',
    Resolved: '\uD574\uACB0\uB428',
    'Cache hits': '\uCE90\uC2DC \uD788\uD2B8',
    Parallel: '\uBCD1\uB82C',
    Runtime: '\uB7F0\uD0C0\uC784',
    'Edge/Node': '\uC5E3\uC9C0/\uB178\uB4DC',
    Revalidation: '\uC7AC\uAC80\uC99D',
    Async: '\uBE44\uB3D9\uAE30',
    'wasm renderer': 'WASM \uB80C\uB354\uB7EC',
    'Hot-path fragments rendered by WASM.':
      'WASM\uC73C\uB85C \uB80C\uB354\uB9C1\uB41C \uD56B\uD328\uC2A4 \uD504\uB798\uADF8\uBA3C\uD2B8.',
    'Critical transforms run inside WebAssembly for deterministic, edge-safe execution. Numeric outputs feed fragment composition without touching HTML.':
      '\uACB0\uC815\uC801\uC774\uACE0 \uC5E3\uC9C0 \uC548\uC804\uD55C \uC2E4\uD589\uC744 \uC704\uD574 \uD575\uC2EC \uBCC0\uD658\uC740 WebAssembly \uC548\uC5D0\uC11C \uC2E4\uD589\uB429\uB2C8\uB2E4. \uC22B\uC790 \uCD9C\uB825\uC740 HTML\uC744 \uAC74\uB4DC\uB9AC\uC9C0 \uC54A\uACE0 \uD504\uB798\uADF8\uBA3C\uD2B8 \uAD6C\uC131\uC744 \uAD6C\uB3D9\uD569\uB2C8\uB2E4.',
    'Burst throughput': '\uBC84\uC2A4\uD2B8 \uCC98\uB9AC\uB7C9',
    'Hot-path score': '\uD56B\uD328\uC2A4 \uC810\uC218',
    'Cache TTL': '\uCE90\uC2DC TTL',
    'Stale TTL': '\uC2A4\uD14C\uC77C TTL',
    'preact island': 'Preact \uC544\uC77C\uB79C\uB4DC',
    'Isolated client islands stay sandboxed.':
      '\uBD84\uB9AC\uB41C \uD074\uB77C\uC774\uC5B8\uD2B8 \uC544\uC77C\uB79C\uB4DC\uB294 \uC0CC\uB4DC\uBC15\uC2A4 \uC0C1\uD0DC\uB97C \uC720\uC9C0\uD569\uB2C8\uB2E4.',
    'Preact loads only inside the island boundary. No shared state, no routing ownership, no global hydration.':
      'Preact\uB294 \uC544\uC77C\uB79C\uB4DC \uACBD\uACC4 \uC548\uC5D0\uC11C\uB9CC \uB85C\uB4DC\uB429\uB2C8\uB2E4. \uACF5\uC720 \uC0C1\uD0DC\uB3C4, \uB77C\uC6B0\uD305 \uC18C\uC720\uAD8C\uB3C4, \uC804\uC5ED \uD558\uC774\uB4DC\uB808\uC774\uC158\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4.',
    'Isolated island': '\uACA9\uB9AC\uB41C \uC544\uC77C\uB79C\uB4DC',
    'react authoring': 'React \uC800\uC791',
    'React stays server-only.': 'React\uB294 \uC11C\uBC84 \uC804\uC6A9\uC785\uB2C8\uB2E4.',
    'React fragments compile into binary trees without client hydration. The DOM remains owned by Qwik.':
      'React \uD504\uB798\uADF8\uBA3C\uD2B8\uB294 \uD074\uB77C\uC774\uC5B8\uD2B8 \uD558\uC774\uB4DC\uB808\uC774\uC158 \uC5C6\uC774 \uBC14\uC774\uB108\uB9AC \uD2B8\uB9AC\uB85C \uCEF4\uD30C\uC77C\uB429\uB2C8\uB2E4. DOM\uC740 Qwik\uC774 \uC18C\uC720\uD569\uB2C8\uB2E4.',
    'RSC-ready': 'RSC \uC900\uBE44\uB428',
    'react dock': 'React \uB3C4\uD06C',
    'Server-only dock fragment.': '\uC11C\uBC84 \uC804\uC6A9 \uB3C4\uD06C \uD504\uB798\uADF8\uBA3C\uD2B8.',
    'MagicUI dock authored in React, compiled to a static fragment.':
      'React\uB85C \uC791\uC131\uD55C MagicUI \uB3C4\uD06C\uB97C \uC815\uC801 \uD504\uB798\uADF8\uBA3C\uD2B8\uB85C \uCEF4\uD30C\uC77C\uD569\uB2C8\uB2E4.',
    'Dock shortcuts': '\uB3C4\uD06C \uBC14\uB85C\uAC00\uAE30',
    'fragment missing': '\uD504\uB798\uADF8\uBA3C\uD2B8 \uC5C6\uC74C',
    'Fragment missing': '\uD504\uB798\uADF8\uBA3C\uD2B8 \uC5C6\uC74C',
    'No renderer registered for {{id}}.': '{{id}}\uC5D0 \uB4F1\uB85D\uB41C \uB80C\uB354\uB7EC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
    'render error': '\uB80C\uB354 \uC624\uB958',
    'Fragment failed to render': '\uD504\uB798\uADF8\uBA3C\uD2B8 \uB80C\uB354 \uC2E4\uD328',
    'Last error: {{error}}': '\uB9C8\uC9C0\uB9C9 \uC624\uB958: {{error}}'
  }
}

const interpolate = (value: string, params?: Record<string, string | number>) => {
  if (!params) return value
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(params[key] ?? ''))
}

export const createFragmentTranslator = (lang: string): FragmentTranslator => {
  const resolved = normalizeFragmentLang(lang)
  const dictionary = translations[resolved] ?? translations.en
  return (value, params) => interpolate(dictionary[value] ?? value, params)
}
