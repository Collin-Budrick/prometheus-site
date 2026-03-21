import { loadHomeDemoWarmCore } from './runtime-loaders'

type WarmHomeDemoAssetsOptions = Parameters<
  typeof import('./home-demo-warm-core').warmStaticHomeDemoAssets
>[0]

export const warmStaticHomeDemoAssets = (options: WarmHomeDemoAssetsOptions = {}) =>
  loadHomeDemoWarmCore().then(({ warmStaticHomeDemoAssets }) =>
    warmStaticHomeDemoAssets(options)
  )
