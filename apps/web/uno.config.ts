import {
  defineConfig,
  presetMini,
  presetTypography,
  presetWind,
  transformerDirectives,
  transformerVariantGroup
} from 'unocss'
import type { Variant } from '@unocss/core'

const variantLight: Variant = (matcher) => {
  if (!matcher.startsWith('light:')) return
  return {
    matcher: matcher.slice('light:'.length),
    selector: (input) => `.light ${input}, [data-theme="light"] ${input}`
  }
}

export default defineConfig({
  content: {
    pipeline: {
      include: ['./src/**/*.{ts,tsx,js,jsx,mdx,md}', './index.html']
    }
  },
  presets: [presetMini(), presetWind(), presetTypography()],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  variants: [
    variantLight
  ],
  shortcuts: {
    'app-shell': 'min-h-screen bg-slate-950 text-slate-100 antialiased',
    'surface': 'rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg backdrop-blur'
  },
  safelist: ['surface', 'app-shell']
})
