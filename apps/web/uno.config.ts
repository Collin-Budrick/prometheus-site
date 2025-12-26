import {
  defineConfig,
  presetMini,
  presetIcons,
  presetWind,
  transformerDirectives,
  transformerVariantGroup
} from 'unocss'
import type { IconifyJSON } from '@iconify/types'

/* cspell:ignore preflights iconify */

const variantLight = (matcher: string) => {
  if (!matcher.startsWith('light:')) return
  return {
    matcher: matcher.slice('light:'.length),
    selector: (input: string) => `.light ${input}, [data-theme="light"] ${input}`
  }
}

export default defineConfig({
  content: {
    pipeline: {
      include: ['./src/**/*.{ts,tsx,js,jsx,mdx,md}', './index.html']
    }
  },
  presets: [
    presetMini({ preflight: false }),
    presetWind({ preflight: false }),
    presetIcons({
      collections: {
        solar: async (): Promise<IconifyJSON> => (await import('@iconify-json/solar/icons.json')).default as IconifyJSON
      }
    })
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  variants: [
    variantLight
  ],
  shortcuts: {
    'app-shell': 'min-h-screen bg-slate-950 text-slate-100 font-sans antialiased',
    'surface': 'rounded-xl border border-slate-800 bg-slate-900',
    'stack-md': 'flex flex-col gap-4 md:gap-6',
    'stack-lg': 'flex flex-col gap-6 md:gap-8',
    'text-body': 'text-slate-200 leading-relaxed tracking-tight',
    'text-muted': 'text-slate-400 leading-relaxed tracking-tight',
    'title-lg': 'text-3xl font-semibold tracking-tight md:text-4xl',
    'title-md': 'text-2xl font-semibold tracking-tight'
  },
  safelist: ['surface', 'app-shell']
})
