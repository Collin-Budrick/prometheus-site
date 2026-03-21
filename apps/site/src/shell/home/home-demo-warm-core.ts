import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import { HOME_DEMO_KINDS, normalizeHomeDemoAssetMap } from './home-demo-runtime-types'
import {
  warmHomeDemoKind,
  warmHomeDemoStartupAttachRuntime
} from './home-demo-runtime-loader'
import { warmHomeDemoEntryRuntime } from './home-demo-entry-loader'
import { scheduleStaticShellTask } from '../core/scheduler'

type WarmHomeDemoAssetsOptions = {
  doc?: Document | null
  scheduleTask?: typeof scheduleStaticShellTask
}

export const warmStaticHomeDemoAssets = async ({
  doc = typeof document !== 'undefined' ? document : null,
  scheduleTask = scheduleStaticShellTask
}: WarmHomeDemoAssetsOptions = {}) => {
  if (!doc) {
    return
  }

  const data = readStaticHomeBootstrapData({ doc })
  if (!data) {
    return
  }

  const assets = normalizeHomeDemoAssetMap(data.homeDemoAssets)

  await Promise.all([
    warmHomeDemoStartupAttachRuntime({ doc }),
    warmHomeDemoEntryRuntime({ doc })
  ])

  await new Promise<void>((resolve) => {
    scheduleTask(
      () => {
        void Promise.all(
          HOME_DEMO_KINDS.map((kind) =>
            warmHomeDemoKind(kind, assets[kind], { doc })
          )
        )
          .catch((error) => {
            console.error('Static home demo kind warmup failed:', error)
          })
          .finally(() => {
            resolve()
          })
      },
      {
        priority: 'background',
        timeoutMs: 0,
        preferIdle: false,
        waitForPaint: true
      }
    )
  })
}
