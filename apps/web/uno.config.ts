import { defineConfig, presetMini, presetTypography, presetWind, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
  presets: [presetMini(), presetWind(), presetTypography()],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    'app-shell': 'min-h-screen bg-slate-950 text-slate-100 antialiased',
    'surface': 'rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg backdrop-blur'
  },
  safelist: ['surface', 'app-shell']
})
