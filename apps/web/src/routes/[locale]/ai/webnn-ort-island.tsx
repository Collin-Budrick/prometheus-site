import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import type { AccelerationTarget } from './acceleration'
import {
  defaultWebNnModelId,
  onnxCommunityModelPrefix,
  webNnModels,
  type TransformersDtype,
  type AiModelId,
  type WebNnModelId
} from '../../../config/ai-models'
import type {
  AiDeviceCapabilities,
  AiWorkerRequest,
  AiWorkerResponse,
  DeviceMode,
  LoadState,
  Runtime,
  TranscriptEntry
} from '../../../workers/ai-inference.worker'
import { acquireAiWorker, releaseAiWorker } from '../../../workers/ai-worker-client'
import { checkStorageGuard } from './storage-guard'

const formatBytes = (bytes: number) => {
  const gb = bytes / 1024 ** 3
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`
  }

  const mb = bytes / 1024 ** 2
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

const formatDeviceModeLabel = (device: DeviceMode) => {
  switch (device) {
    case 'webnn-npu':
      return _`WebNN NPU`
    case 'webnn-gpu':
      return _`WebNN GPU`
    case 'webnn-cpu':
      return _`WebNN CPU`
    case 'webgpu':
      return _`WebGPU`
    case 'wasm':
      return _`WASM`
    case 'webnn':
    default:
      return _`WebNN`
  }
}

const customModelKey = '__custom-onnx-community__'
const defaultOnnxCommunityModelId =
  webNnModels.find((model) => model.id.startsWith(onnxCommunityModelPrefix))?.id ??
  (defaultWebNnModelId.startsWith(onnxCommunityModelPrefix)
    ? defaultWebNnModelId
    : `${onnxCommunityModelPrefix}gemma-3-270m-it-ONNX`)

const normalizeOnnxCommunityModelId = (input: string) => {
  const trimmed = input.trim()
  if (!trimmed) return null

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '')
  const hfMatch = withoutProtocol.match(/huggingface\.co\/([^/]+\/[^/]+)(?:\/.*)?$/i)
  if (hfMatch) {
    const repoId = hfMatch[1]
    return repoId.startsWith(onnxCommunityModelPrefix) ? repoId : null
  }

  if (withoutProtocol.startsWith(onnxCommunityModelPrefix)) {
    const [org, repo] = withoutProtocol.split('/')
    if (org === 'onnx-community' && repo) {
      return `${org}/${repo}`
    }
  }

  if (!withoutProtocol.includes('/')) {
    return `${onnxCommunityModelPrefix}${withoutProtocol}`
  }

  return null
}

interface WebNnOrtIslandProps {
  preferredAcceleration?: AccelerationTarget
  accelerationReady?: boolean
  capabilities?: AiDeviceCapabilities
  manualOverride?: boolean
}

export const WebNnOrtIsland = component$<WebNnOrtIslandProps>(
  ({ preferredAcceleration, accelerationReady, capabilities, manualOverride }) => {
  const workerRef = useSignal<Worker | null>(null)
  const workerListenerRef = useSignal<((event: MessageEvent<AiWorkerResponse>) => void) | null>(null)
  const selectedModelId = useSignal<WebNnModelId>(defaultWebNnModelId)
  const isCustomModelSelected = useSignal(false)
  const customModelInput = useSignal(defaultOnnxCommunityModelId)
  const customModelId = useSignal<WebNnModelId>(defaultOnnxCommunityModelId)
  const customModelError = useSignal('')
  const customModelDtype = useSignal<TransformersDtype>('q4f16')
  const loadedModelId = useSignal<AiModelId | null>(null)
  const loadState = useSignal<LoadState>('idle')
  const progress = useSignal('')
  const error = useSignal('')
  const prompt = useSignal('')
  const pendingPrompt = useSignal('')
  const streamingText = useSignal('')
  const isStreaming = useSignal(false)
  const transcript = useSignal<TranscriptEntry[]>([])
  const runtime = useSignal<Runtime>('transformers')
  const deviceMode = useSignal<DeviceMode>('webnn')
  const wasmThreads = useSignal<number | null>(null)
  const dtype = useSignal<TransformersDtype | 'auto' | null>(null)
  const hasTransformersCache = useSignal(false)
  const cacheCheckComplete = useSignal(false)
  const installState = useSignal<'idle' | 'installing' | 'done' | 'error'>('idle')
  const installProgress = useSignal('')
  const installModelId = useSignal<AiModelId | null>(null)
  const shouldShowDownloadWarning = useSignal(false)
  const downloadWarningDismissed = useSignal(false)
  const storageWarning = useSignal('')
  const freeStorageBytes = useSignal<number | null>(null)
  const isStorageBlocked = useSignal(false)
  const storageCheckUnavailable = useSignal(false)
  const storageCheckComplete = useSignal(false)
  const isAutoWarming = useSignal(false)
  const autoWarmQueued = useSignal(false)

  const checkCaches = $(async () => {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      try {
        const databases = await indexedDB.databases()
        const names = databases.map((db) => db?.name?.toLowerCase() ?? '')
        hasTransformersCache.value = names.some((name) => name?.includes('transformers') || name?.includes('huggingface'))
      } catch (err) {
        console.error(err)
      }
    }

    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      try {
        const cacheNames = await caches.keys()
        if (cacheNames.some((name) => name.includes('transformers'))) {
          hasTransformersCache.value = true
        }
      } catch (err) {
        console.error(err)
      }
    }

    cacheCheckComplete.value = true
    if (!downloadWarningDismissed.value) {
      shouldShowDownloadWarning.value = !hasTransformersCache.value
    }
  })

  const ensureWorker = $(async () => {
    if (workerRef.value) return workerRef.value
    const listener = (event: MessageEvent<AiWorkerResponse>) => {
      const data = event.data
      if (!data) return

      switch (data.type) {
        case 'progress':
          loadState.value = data.loadState ?? loadState.value
          progress.value = data.message
          if (data.runtime) runtime.value = data.runtime
          if (data.deviceMode) deviceMode.value = data.deviceMode
          if (data.modelId) loadedModelId.value = data.modelId
          if (typeof data.threads === 'number') wasmThreads.value = data.threads
          if (data.dtype) {
            dtype.value = data.dtype
          } else if (data.runtime === 'web-llm') {
            dtype.value = null
          }
          break
        case 'prefetch-progress':
          installState.value = 'installing'
          installProgress.value = data.message
          installModelId.value = data.modelId
          break
        case 'prefetch-complete':
          installState.value = 'done'
          installProgress.value = _`Background install complete.`
          installModelId.value = data.modelId
          shouldShowDownloadWarning.value = false
          void checkCaches()
          break
        case 'prefetch-error':
          installState.value = 'error'
          installProgress.value = data.error
          installModelId.value = data.modelId
          break
        case 'ready':
          loadState.value = 'ready'
          progress.value = data.message
          runtime.value = data.runtime
          deviceMode.value = data.deviceMode
          loadedModelId.value = data.modelId
          wasmThreads.value = typeof data.threads === 'number' ? data.threads : wasmThreads.value
          dtype.value = data.runtime === 'transformers' ? data.dtype ?? dtype.value ?? null : null
          error.value = ''
          break
        case 'token':
          streamingText.value = `${streamingText.value}${data.chunk}`
          break
        case 'complete':
          isStreaming.value = false
          transcript.value = [
            ...transcript.value,
            { role: 'user', content: pendingPrompt.value || '' },
            { role: 'assistant', content: data.content || streamingText.value }
          ]
          streamingText.value = ''
          pendingPrompt.value = ''
          break
        case 'error':
          loadState.value = data.loadState ?? loadState.value
          error.value = data.error
          isStreaming.value = false
          streamingText.value = ''
          break
        case 'stopped':
          isStreaming.value = false
          streamingText.value = ''
          pendingPrompt.value = ''
          break
        case 'terminated':
          loadState.value = 'idle'
          runtime.value = 'transformers'
          deviceMode.value = 'webnn'
          wasmThreads.value = null
          dtype.value = null
          break
      }
    }

    const worker = acquireAiWorker(listener)
    workerListenerRef.value = listener
    workerRef.value = worker
    return worker
  })

  const getSelectedModel = () => webNnModels.find((model) => model.id === selectedModelId.value)

  const updateStorageEstimate = $(async (modelId: WebNnModelId) => {
    storageCheckComplete.value = false
    try {
      const model = webNnModels.find((item) => item.id === modelId)
      const guard = await checkStorageGuard(model?.sizeBytes)
      freeStorageBytes.value = guard.freeBytes
      isStorageBlocked.value = guard.blocked
      storageCheckUnavailable.value = guard.unavailable
      if (guard.blocked && guard.freeBytes !== null && model?.sizeBytes) {
        storageWarning.value = _`Only ${formatBytes(guard.freeBytes)} free; ${model.label} needs about ${model.size}. Free up space or pick a smaller model.`
      } else if (guard.unavailable) {
        storageWarning.value = _`Storage estimate unavailable; your browser skipped the storage safety check.`
      } else {
        storageWarning.value = ''
      }
      if (guard.unavailable) {
        console.warn('Storage guard skipped: Storage API unavailable.')
      }
    } finally {
      storageCheckComplete.value = true
    }
  })

  const resetConversation = $(() => {
    streamingText.value = ''
    transcript.value = []
    error.value = ''
    workerRef.value?.postMessage({ type: 'reset' } satisfies AiWorkerRequest)
  })

  const loadModel = $(async (modelId: WebNnModelId, acceleration?: AccelerationTarget) => {
    const isCustomInvalid =
      isCustomModelSelected.value && (!customModelId.value || customModelError.value.length > 0)
    if (isCustomInvalid) {
      error.value = customModelError.value || _`Enter a valid onnx-community model id to continue.`
      return
    }
    if (isStorageBlocked.value) {
      error.value = storageWarning.value || _`Not enough free storage for the selected model.`
      installState.value = 'error'
      return
    }
    const resolvedAcceleration = acceleration ?? preferredAcceleration ?? 'npu'
    const worker = await ensureWorker()
    loadState.value = 'loading'
    loadedModelId.value = null
    error.value = ''
    wasmThreads.value = null
    dtype.value = null
    progress.value = _`Starting WebNN inference...`

    const resolvedDtype =
      isCustomModelSelected.value && customModelDtype.value !== 'auto' ? customModelDtype.value : undefined
    worker.postMessage({
      type: 'load-model',
      modelId,
      acceleration: resolvedAcceleration,
      dtype: resolvedDtype,
      capabilities,
    } satisfies AiWorkerRequest)
  })

  const prefetchModel = $(async (modelId: WebNnModelId) => {
    const isCustomInvalid =
      isCustomModelSelected.value && (!customModelId.value || customModelError.value.length > 0)
    if (isCustomInvalid) {
      error.value = customModelError.value || _`Enter a valid onnx-community model id to continue.`
      return
    }
    if (isStorageBlocked.value) {
      error.value = storageWarning.value || _`Not enough free storage for the selected model.`
      installState.value = 'error'
      return
    }
    const worker = await ensureWorker()
    installState.value = 'installing'
    installProgress.value = _`Starting background download...`
    installModelId.value = modelId
    const resolvedDtype =
      isCustomModelSelected.value && customModelDtype.value !== 'auto' ? customModelDtype.value : undefined
    worker.postMessage({
      type: 'prefetch-model',
      modelId,
      dtype: resolvedDtype,
      capabilities,
    } satisfies AiWorkerRequest)
  })

  useVisibleTask$(() => {
    const restoreDownloadWarning = () => {
      if (typeof sessionStorage === 'undefined') return
      const dismissed = sessionStorage.getItem('ai-download-warning-dismissed') === '1'
      downloadWarningDismissed.value = dismissed
      shouldShowDownloadWarning.value = !dismissed
    }

    restoreDownloadWarning()
    void checkCaches()
    void updateStorageEstimate(selectedModelId.value)

    return () => {
      workerRef.value?.postMessage({ type: 'clear-cache' } satisfies AiWorkerRequest)
      if (workerListenerRef.value) {
        releaseAiWorker(workerListenerRef.value)
      }
      workerRef.value = null
      workerListenerRef.value = null
    }
  })

  useVisibleTask$(({ track }) => {
    track(() => selectedModelId.value)
    void updateStorageEstimate(selectedModelId.value)
  })

  useVisibleTask$(({ track }) => {
    track(() => cacheCheckComplete.value)
    track(() => hasTransformersCache.value)
    track(() => installState.value)
    track(() => loadState.value)
    track(() => selectedModelId.value)
    track(() => isStorageBlocked.value)
    track(() => storageCheckComplete.value)
    track(() => manualOverride)
    track(() => accelerationReady)
    track(() => capabilities?.probe?.npu?.opsPerSecond)
    track(() => capabilities?.npuTier)

    const connection =
      typeof navigator === 'undefined'
        ? null
        : (navigator as Navigator & { connection?: { downlink?: number; saveData?: boolean } }).connection ?? null

    const hasCache = hasTransformersCache.value
    const saveData = connection?.saveData ?? false
    const downlink = connection?.downlink ?? 0
    const npuOps = capabilities?.probe?.npu?.opsPerSecond ?? 0
    const npuGops = npuOps > 0 ? npuOps / 1_000_000_000 : 0
    const connectionHealthy = downlink >= 25
    const probeHealthy = npuGops >= 10 || capabilities?.npuTier === 'high'

    if (
      typeof navigator === 'undefined' ||
      autoWarmQueued.value ||
      manualOverride ||
      !accelerationReady ||
      !cacheCheckComplete.value ||
      !storageCheckComplete.value ||
      hasCache ||
      isStorageBlocked.value ||
      isCustomModelSelected.value ||
      selectedModelId.value !== defaultWebNnModelId ||
      installState.value === 'installing' ||
      loadState.value === 'loading' ||
      saveData ||
      (!connectionHealthy && !probeHealthy)
    ) {
      return
    }

    autoWarmQueued.value = true
    isAutoWarming.value = true
    void prefetchModel(selectedModelId.value)
  })

  useVisibleTask$(({ track }) => {
    track(() => installState.value)
    if (!isAutoWarming.value) return
    if (installState.value === 'done' || installState.value === 'error') {
      isAutoWarming.value = false
    }
  })

  const handleModelChange = $(async (event: Event) => {
    const target = event.target as HTMLSelectElement
    const nextModel = target.value
    if (nextModel === customModelKey) {
      isCustomModelSelected.value = true
      selectedModelId.value = customModelId.value
      customModelError.value = customModelId.value
        ? ''
        : _`Enter an onnx-community model id to continue.`
      return
    }
    isCustomModelSelected.value = false
    selectedModelId.value = nextModel as WebNnModelId
  })

  const handleCustomModelInput = $((event: Event) => {
    const target = event.target as HTMLInputElement
    const nextValue = target.value
    customModelInput.value = nextValue
    const normalized = normalizeOnnxCommunityModelId(nextValue)
    if (!normalized) {
      customModelError.value = _`Use an onnx-community model id or Hugging Face URL.`
      customModelId.value = ''
      if (isCustomModelSelected.value) {
        selectedModelId.value = ''
      }
      return
    }
    customModelError.value = ''
    customModelId.value = normalized
    if (isCustomModelSelected.value) {
      selectedModelId.value = normalized
    }
  })

  const handleCustomDtypeChange = $((event: Event) => {
    const target = event.target as HTMLSelectElement
    customModelDtype.value = target.value as TransformersDtype
  })

  const stopStreaming = $(async () => {
    if (!isStreaming.value) return

    workerRef.value?.postMessage({ type: 'stop' } satisfies AiWorkerRequest)
  })

  const sendPrompt = $(async () => {
    const promptValue = prompt.value.trim()
    if (!promptValue) return
    const worker = await ensureWorker()
    if (loadState.value !== 'ready' || loadedModelId.value !== selectedModelId.value) {
      error.value = _`Model is not ready yet. Select a model and install it first.`
      return
    }

    pendingPrompt.value = promptValue
    streamingText.value = ''
    isStreaming.value = true
    error.value = ''
    prompt.value = ''

    const transcriptPayload = transcript.value.map((entry) => ({ role: entry.role, content: entry.content }))

    worker.postMessage(
      {
        type: 'generate',
        modelId: selectedModelId.value,
        prompt: promptValue,
        transcript: transcriptPayload,
        capabilities
      } satisfies AiWorkerRequest
    )
  })

  const dismissDownloadWarning = $(() => {
    downloadWarningDismissed.value = true
    shouldShowDownloadWarning.value = false
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('ai-download-warning-dismissed', '1')
    }
  })

  const offlineReady = hasTransformersCache.value
  const selectedModel = getSelectedModel()
  const isAccelerationReady = accelerationReady !== false
  const isWebNn = deviceMode.value.startsWith('webnn')
  const isWebNnNpu = deviceMode.value === 'webnn-npu'
  const fallbackDeviceLabel = isWebNn ? '' : formatDeviceModeLabel(deviceMode.value)
  const webnnUnsupportedReason = selectedModel?.webnnUnsupportedReason
  const isLocalModel = selectedModelId.value.startsWith('/models/')
  const isSelectedModelLoaded = loadedModelId.value === selectedModelId.value
  const isSelectedModelReady = loadState.value === 'ready' && isSelectedModelLoaded
  const isCustomModelInvalid =
    isCustomModelSelected.value && (!customModelId.value || customModelError.value.length > 0)
  const shouldShowWebNnFallback = isAccelerationReady && loadState.value === 'ready' && !isWebNn
  const isInstallForSelected = installModelId.value === selectedModelId.value

  return (
    <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-lg text-slate-200">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div>
          <p class="text-cyan-200 text-xs uppercase tracking-wide">{_`On-device WebNN`}</p>
          <p class="font-semibold text-slate-50 text-lg">{_`Stream tokens locally over ONNX Runtime`}</p>
          <p class="mt-1 max-w-2xl text-slate-300 text-sm">
            {_`Select an ORT-optimized model, watch load progress, and chat without sending prompts to the server.`}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="px-3 py-2 border border-slate-700 rounded-md font-semibold text-slate-100 text-xs"
            onClick$={resetConversation}
          >
            {_`Reset conversation`}
          </button>
          <button
            type="button"
            class="border border-slate-700 px-3 py-2 rounded-md font-semibold text-slate-100 text-xs disabled:opacity-50"
            disabled={installState.value === 'installing' || isCustomModelInvalid || isStorageBlocked.value}
            onClick$={$(() => prefetchModel(selectedModelId.value))}
          >
            {_`Install (background)`}
          </button>
          <button
            type="button"
            class="bg-emerald-500 disabled:opacity-50 px-3 py-2 rounded-md font-semibold text-emerald-950 text-xs"
            disabled={
              loadState.value === 'loading' ||
              installState.value === 'installing' ||
              !isAccelerationReady ||
              isCustomModelInvalid ||
              isStorageBlocked.value
            }
            onClick$={$(() => loadModel(selectedModelId.value))}
          >
            {isSelectedModelLoaded ? _`Reload model` : _`Activate model`}
          </button>
          {storageCheckUnavailable.value && (
            <span class="rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-50">
              {_`Storage check unavailable`}
            </span>
          )}
        </div>
      </div>

      {shouldShowDownloadWarning.value && (
        <div class="flex flex-wrap items-start gap-3 bg-amber-500/10 mt-3 p-3 border border-amber-700/50 rounded-md text-amber-100 text-sm">
          <div class="space-y-1">
            <p class="font-semibold">{_`First download is large`}</p>
            <p>
              {_`Expect the initial model pull (hundreds of MB) to take time; keep this tab open until the cache finishes.`}
            </p>
          </div>
          <button
            type="button"
            class="px-3 py-2 border border-amber-400/60 rounded-md font-semibold text-amber-50 text-xs"
            onClick$={dismissDownloadWarning}
          >
            {_`Got it`}
          </button>
        </div>
      )}

      <div class="gap-3 grid lg:grid-cols-[2fr_1.3fr] mt-4">
        <div class="space-y-3">
          <label class="block font-semibold text-slate-400 text-xs uppercase tracking-wide">{_`Model`}</label>
          <select
            class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-md w-full text-sm"
            value={isCustomModelSelected.value ? customModelKey : selectedModelId.value}
            onChange$={handleModelChange}
          >
            {webNnModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
            <option value={customModelKey}>
              {customModelId.value ? _`Custom: ${customModelId.value}` : _`Custom (onnx-community/...)`}
            </option>
          </select>

          <div
            class={`space-y-2 rounded-md border border-slate-800 bg-slate-950/40 p-3 ${
              isCustomModelSelected.value ? '' : 'hidden'
            }`}
            aria-hidden={!isCustomModelSelected.value}
          >
            <label class="block font-semibold text-slate-400 text-xs uppercase tracking-wide">
              {_`Custom onnx-community model`}
            </label>
            <input
              type="text"
              class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-md w-full text-sm"
              placeholder={_`onnx-community/<model-id>`}
              value={customModelInput.value}
              onInput$={handleCustomModelInput}
              disabled={!isCustomModelSelected.value}
            />
            <label class="block font-semibold text-slate-400 text-xs uppercase tracking-wide">
              {_`Precision`}
            </label>
            <select
              class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-md w-full text-sm"
              value={customModelDtype.value}
              onChange$={handleCustomDtypeChange}
              disabled={!isCustomModelSelected.value}
            >
              <option value="q4f16">{_`q4f16 (smallest download)`}</option>
              <option value="fp16">{_`fp16`}</option>
              <option value="fp32">{_`fp32 (largest download)`}</option>
              <option value="auto">{_`Auto (try q4f16 -> fp16 -> fp32)`}</option>
            </select>
            <p class="text-slate-400 text-xs">
              {_`Paste a Hugging Face URL or repo id. Use text-generation ONNX models from onnx-community.`}
            </p>
            <p class="text-slate-400 text-xs">
              {_`Pick q4f16 when you have local files; fp16/fp32 will download larger shards.`}
            </p>
            {customModelError.value && <p class="text-rose-300 text-xs">{customModelError.value}</p>}
            {!customModelError.value && customModelId.value && (
              <a
                class="font-semibold text-cyan-200 text-xs underline underline-offset-4"
                href={`https://huggingface.co/${customModelId.value}`}
                target="_blank"
                rel="noreferrer"
              >
                {_`View on Hugging Face`}
              </a>
            )}
          </div>

          {webNnModels.map((model) => (
            <div key={model.id} class={model.id === selectedModelId.value ? 'block' : 'hidden'}>
              <p class="text-slate-300 text-sm">{model.description}</p>
              <div class="gap-2 grid sm:grid-cols-3 mt-2 text-slate-400 text-xs">
                <span class="px-2 py-1 border border-slate-800 rounded-md">{_`Format: ${model.format}`}</span>
                <span class="px-2 py-1 border border-slate-800 rounded-md">{_`Size: ${model.size}`}</span>
                <span class="px-2 py-1 border border-slate-800 rounded-md">
                  {_`Context: ${model.contextLength}`}
                </span>
                <span class="sm:col-span-3 px-2 py-1 border border-slate-800 rounded-md">
                  {_`Recommended tier: ${model.recommendedTier}`}
                </span>
              </div>
            </div>
          ))}
          {isCustomModelSelected.value && (
            <div class="bg-slate-950/40 p-3 border border-slate-800 rounded-md">
              <p class="text-slate-300 text-sm">
                {_`Custom ONNX model hosted on Hugging Face and loaded with Transformers.js.`}
              </p>
              <div class="gap-2 grid sm:grid-cols-3 mt-2 text-slate-400 text-xs">
                <span class="px-2 py-1 border border-slate-800 rounded-md">{_`Format: ONNX`}</span>
                <span class="px-2 py-1 border border-slate-800 rounded-md">{_`Size: varies`}</span>
                <span class="px-2 py-1 border border-slate-800 rounded-md">{_`Context: varies`}</span>
                <span class="sm:col-span-3 px-2 py-1 border border-slate-800 rounded-md">
                  {_`Recommended tier: depends on model size`}
                </span>
              </div>
            </div>
          )}

          <div class="flex items-center gap-2 mt-3 text-sm">
            <span
              class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                loadState.value === 'ready'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : loadState.value === 'loading'
                    ? 'bg-amber-500/20 text-amber-200'
                    : loadState.value === 'error'
                      ? 'bg-rose-500/20 text-rose-200'
                      : 'bg-slate-800 text-slate-200'
              }`}
            >
              {loadState.value === 'ready'
                ? _`Ready`
                : loadState.value === 'loading'
                  ? _`Loading...`
                  : loadState.value === 'error'
                    ? _`Error`
                    : _`Idle`}
            </span>
            {progress.value && <span class="text-slate-300">{progress.value}</span>}
            {isInstallForSelected && installState.value === 'installing' && installProgress.value && (
              <span class="text-slate-300">{_`Background install: ${installProgress.value}`}</span>
            )}
            {isInstallForSelected && installState.value === 'done' && (
              <span class="text-emerald-200">{_`Background install complete`}</span>
            )}
            {isInstallForSelected && installState.value === 'error' && installProgress.value && (
              <span class="text-rose-300">{_`Background install failed: ${installProgress.value}`}</span>
            )}
            {isAutoWarming.value && installState.value === 'installing' && (
              <span class="inline-flex items-center bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-400/50 text-[10px] font-semibold text-cyan-100">
                {_`Warming...`}
              </span>
            )}
            {runtime.value === 'transformers' && (
              <span class="inline-flex items-center bg-slate-800 px-3 py-1 rounded-full font-semibold text-slate-100 text-xs">
                {_`Transformers.js`}
              </span>
            )}
            {runtime.value === 'transformers' && wasmThreads.value !== null && (
              <span class="inline-flex items-center bg-slate-800 px-3 py-1 rounded-full font-semibold text-slate-100 text-xs">
                {_`Threads: ${wasmThreads.value}`}
              </span>
            )}
            {runtime.value === 'transformers' && dtype.value && (
              <span class="inline-flex items-center bg-slate-800 px-3 py-1 rounded-full font-semibold text-slate-100 text-xs">
                {_`Precision: ${dtype.value}`}
              </span>
            )}
            <span
              class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                isWebNn ? 'bg-cyan-500/20 text-cyan-100' : 'bg-slate-800 text-slate-200'
              }`}
            >
              {isWebNnNpu ? _`NPU / WebNN` : isWebNn ? _`WebNN` : _`Fallback`}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-slate-200 text-xs">
            <span
              class={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${
                cacheCheckComplete.value
                  ? offlineReady
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-slate-800 text-slate-200'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {cacheCheckComplete.value
                ? offlineReady
                  ? _`Cached / offline ready`
                  : _`No local cache yet`
                : _`Checking caches...`}
            </span>
            {hasTransformersCache.value && (
              <span class="inline-flex items-center bg-slate-800 px-3 py-1 rounded-full font-semibold text-emerald-100">
                {_`Transformers.js cache detected`}
              </span>
            )}
            {freeStorageBytes.value !== null && (
              <span class="inline-flex items-center bg-slate-800 px-3 py-1 rounded-full font-semibold text-slate-100">
                {_`Free storage: ${formatBytes(freeStorageBytes.value)}`}
              </span>
            )}
          </div>

          {error.value && <p class="text-rose-300 text-sm">{error.value}</p>}
          {shouldShowWebNnFallback && (
            <p class="text-amber-200 text-sm">
              {_`WebNN failed or was unavailable; using ${fallbackDeviceLabel || _`a fallback backend`}.`}
            </p>
          )}
          {webnnUnsupportedReason && (
            <p class="text-amber-200 text-sm">
              {_`WebNN NPU cannot load this model. ${webnnUnsupportedReason} We will attempt a fallback backend.`}
            </p>
          )}
          {loadedModelId.value && !isSelectedModelLoaded && (
            <p class="text-amber-200 text-sm">
              {_`Selected model is not installed yet. Click install to switch.`}
            </p>
          )}
          {isLocalModel && (
            <p class="text-slate-400 text-xs">
              {_`Local models must include config.json, tokenizer.json, and ONNX files in the model folder.`}
            </p>
          )}
          {storageWarning.value && <p class="text-amber-200 text-sm">{storageWarning.value}</p>}
          {selectedModel?.size && (
            <p class="text-slate-400 text-xs">
              {_`Offline cache target: ${selectedModel.size} (~${formatBytes(selectedModel.sizeBytes)})`}
            </p>
          )}
        </div>

        <div class="bg-slate-950/60 p-3 border border-slate-800 rounded-md">
          <p class="text-cyan-200 text-xs uppercase tracking-wide">{_`Chat transcript`}</p>
          <div class="space-y-3 bg-slate-950/40 mt-3 p-3 rounded-md max-h-72 overflow-y-auto text-sm">
            {transcript.value.length === 0 && (
              <p class="text-slate-400">{_`No messages yet. Ask a quick question to warm the model.`}</p>
            )}
            {transcript.value.map((entry, index) => (
              <div key={`${entry.role}-${index}`} class="space-y-1 bg-slate-900/60 p-2 border border-slate-800/70 rounded-md">
                <p class="font-semibold text-slate-400 text-xs uppercase tracking-wide">
                  {entry.role === 'user' ? _`You` : _`WebNN`}
                </p>
                <p class="text-slate-100 whitespace-pre-wrap">{entry.content}</p>
              </div>
            ))}
            {isStreaming.value && (
              <div class="space-y-1 bg-slate-900/60 p-2 border border-slate-800/70 rounded-md">
                <p class="font-semibold text-slate-400 text-xs uppercase tracking-wide">{_`WebNN`}</p>
                <p class="text-slate-100 whitespace-pre-wrap">{streamingText.value || _`...`}</p>
              </div>
            )}
          </div>

          <div class="space-y-2 mt-3">
            <textarea
              class="bg-slate-950 px-3 py-2 border border-slate-800 rounded-md w-full h-24 text-slate-100 text-sm"
              placeholder={_`Ask something on-device`}
              value={prompt.value}
              onInput$={$((event) => {
                prompt.value = (event.target as HTMLTextAreaElement).value
              })}
              disabled={!isSelectedModelReady || isStreaming.value}
            />
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="bg-emerald-500 disabled:opacity-50 px-3 py-2 rounded-md font-semibold text-emerald-950 text-sm"
                disabled={!isSelectedModelReady || isStreaming.value}
                onClick$={sendPrompt}
              >
                {isStreaming.value ? _`Streaming...` : _`Send to WebNN`}
              </button>
              <button
                type="button"
                class="disabled:opacity-50 px-3 py-2 border border-slate-700 rounded-md font-semibold text-slate-100 text-sm"
                disabled={!isStreaming.value}
                onClick$={stopStreaming}
              >
                {_`Stop`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
