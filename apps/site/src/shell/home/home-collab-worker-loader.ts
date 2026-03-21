import { asTrustedScriptUrl } from '../../security/client'
import { resolveStaticAssetUrl } from '../core/static-asset-url'

export const HOME_COLLAB_WORKER_ASSET_PATH =
  'build/static-shell/apps/site/src/shell/home/home-collab.worker.js'

export type HomeCollabWorkerLike = Pick<
  Worker,
  'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'
>

type HomeCollabWorkerConstructor = new (
  scriptURL: string | URL,
  options?: WorkerOptions
) => HomeCollabWorkerLike

export const resolveHomeCollabWorkerUrl = (
  options?: Parameters<typeof resolveStaticAssetUrl>[1]
) => resolveStaticAssetUrl(HOME_COLLAB_WORKER_ASSET_PATH, options)

export const createHomeCollabWorker = ({
  assetUrl = resolveHomeCollabWorkerUrl(),
  WorkerImpl = typeof Worker !== 'undefined' ? Worker : undefined
}: {
  assetUrl?: string
  WorkerImpl?: HomeCollabWorkerConstructor | undefined
} = {}) => {
  if (!WorkerImpl) {
    return null
  }
  const trustedUrl = asTrustedScriptUrl(assetUrl)
  return new WorkerImpl(trustedUrl as unknown as string, {
    type: 'module',
    name: 'prom-home-collab'
  })
}
