import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import type { AccelerationTarget } from '../../../config/ai-acceleration'
import {
  defaultWebLlmModelId,
  onnxCommunityModelPrefix,
  webLlmModels,
  webNnModels,
  type AiModelId,
  type TransformersDtype,
  type WebLlmModelId
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

const customModelKey = '__custom-onnx-community__'
const defaultOnnxCommunityModelId =
  webNnModels.find((model) => model.id.startsWith(onnxCommunityModelPrefix))?.id ??
  `onnx-community/gemma-3-270m-it-ONNX`

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

interface WebLlmIslandProps {
  preferredAcceleration?: AccelerationTarget
  accelerationReady?: boolean
  capabilities?: AiDeviceCapabilities
  manualOverride?: boolean
}

export const WebLlmIsland = component$<WebLlmIslandProps>(
  ({ preferredAcceleration, accelerationReady, capabilities, manualOverride }) => {
  const workerRef = useSignal<Worker | null>(null)
  const workerListenerRef = useSignal<((event: MessageEvent<AiWorkerResponse>) => void) | null>(null)
  const selectedModelId = useSignal<AiModelId>(defaultWebLlmModelId)
  const isCustomModelSelected = useSignal(false)
  const customModelInput = useSignal(defaultOnnxCommunityModelId)
  const customModelId = useSignal<AiModelId>(defaultOnnxCommunityModelId)
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
  const hasWebGpu = useSignal<boolean | null>(null)
  const transcript = useSignal<TranscriptEntry[]>([])
  const runtime = useSignal<Runtime>('web-llm')
  const deviceMode = useSignal<DeviceMode>('webgpu')
  const wasmThreads = useSignal<number | null>(null)
  const dtype = useSignal<TransformersDtype | 'auto' | null>(null)
  const hasWebLlmCache = useSignal(false)
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

  const hasCustomModelError = () => isCustomModelSelected.value && (!customModelId.value || customModelError.value.length > 0)
  const resolveCustomModelDtype = () => (customModelDtype.value === 'auto' ? undefined : customModelDtype.value)

  const checkCaches = async () => {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      try {
        const databases = await indexedDB.databases()
        const names = databases.map((db) => db?.name?.toLowerCase() ?? '')
        hasWebLlmCache.value = names.some((name) => name?.includes('webllm/model') || name?.includes('webllm'))
        hasTransformersCache.value = names.some(
          (name) => name?.includes('transformers') || name?.includes('huggingface')
        )
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
      const cached = hasWebLlmCache.value || hasTransformersCache.value
      shouldShowDownloadWarning.value = !cached
    }
  }

  const ensureWorker$ = $(async () => {
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
          wasmThreads.value =
            typeof data.threads === 'number' ? data.threads : data.runtime === 'web-llm' ? null : wasmThreads.value
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
          runtime.value = 'web-llm'
          deviceMode.value = 'webgpu'
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

  const getSelectedModel = () => webLlmModels.find((model) => model.id === selectedModelId.value)

  const updateStorageEstimate$ = $(async (modelId: AiModelId) => {
    storageCheckComplete.value = false
    try {
      const model = webLlmModels.find((item) => item.id === modelId)
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

  const resetConversation$ = $(() => {
    streamingText.value = ''
    transcript.value = []
    error.value = ''
    workerRef.value?.postMessage({ type: 'reset' } satisfies AiWorkerRequest)
  })

  const loadModel$ = $(async (modelId: AiModelId, acceleration?: AccelerationTarget) => {
    if (hasCustomModelError()) {
      error.value = customModelError.value || _`Enter a valid onnx-community model id to continue.`
      return
    }
    if (isStorageBlocked.value) {
      error.value = storageWarning.value || _`Not enough free storage for the selected model.`
      installState.value = 'error'
      return
    }
    const resolvedAcceleration = acceleration ?? preferredAcceleration ?? 'gpu'
    const worker = await ensureWorker$()
    loadState.value = 'loading'
    loadedModelId.value = null
    error.value = ''
    wasmThreads.value = null
    dtype.value = null
    progress.value =
      isCustomModelSelected.value
        ? _`Loading Transformers.js...`
        : resolvedAcceleration === 'npu'
          ? _`Starting WebNN inference...`
          : hasWebGpu.value
            ? _`Starting WebLLM...`
            : _`Loading Transformers.js fallback...`

    const dtypeOverride = isCustomModelSelected.value ? resolveCustomModelDtype() : undefined
    worker.postMessage({
      type: 'load-model',
      modelId,
      acceleration: resolvedAcceleration,
      dtype: dtypeOverride,
      capabilities
    } satisfies AiWorkerRequest)
  })

  const prefetchModel$ = $(async (modelId: AiModelId) => {
    if (hasCustomModelError()) {
      error.value = customModelError.value || _`Enter a valid onnx-community model id to continue.`
      return
    }
    if (isStorageBlocked.value) {
      error.value = storageWarning.value || _`Not enough free storage for the selected model.`
      installState.value = 'error'
      return
    }
    const worker = await ensureWorker$()
    installState.value = 'installing'
    installProgress.value = _`Starting background download...`
    installModelId.value = modelId
    const dtypeOverride = isCustomModelSelected.value ? resolveCustomModelDtype() : undefined
    worker.postMessage({ type: 'prefetch-model', modelId, dtype: dtypeOverride, capabilities } satisfies AiWorkerRequest)
  })

  useVisibleTask$(() => {
    const restoreDownloadWarning = () => {
      if (typeof sessionStorage === 'undefined') return
      const dismissed = sessionStorage.getItem('ai-download-warning-dismissed') === '1'
      downloadWarningDismissed.value = dismissed
      shouldShowDownloadWarning.value = !dismissed
    }

    hasWebGpu.value = typeof navigator !== 'undefined' && 'gpu' in navigator
    restoreDownloadWarning()
    void checkCaches()
    void updateStorageEstimate$(selectedModelId.value)

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
    void updateStorageEstimate$(selectedModelId.value)
  })

  useVisibleTask$(({ track }) => {
    track(() => cacheCheckComplete.value)
    track(() => hasWebLlmCache.value)
    track(() => hasTransformersCache.value)
    track(() => installState.value)
    track(() => loadState.value)
    track(() => selectedModelId.value)
    track(() => isStorageBlocked.value)
    track(() => storageCheckComplete.value)
    track(() => manualOverride)
    track(() => accelerationReady)
    track(() => capabilities?.probe?.gpu?.bestBandwidthGBps)
    track(() => capabilities?.gpuTier)

    const connection =
      typeof navigator === 'undefined'
        ? null
        : (navigator as Navigator & { connection?: { downlink?: number; saveData?: boolean } }).connection ?? null

    const hasCache = hasWebLlmCache.value || hasTransformersCache.value
    const saveData = connection?.saveData ?? false
    const downlink = connection?.downlink ?? 0
    const gpuBandwidth = capabilities?.probe?.gpu?.bestBandwidthGBps ?? 0
    const connectionHealthy = downlink >= 40
    const probeHealthy = gpuBandwidth >= 35 || capabilities?.gpuTier === 'high'

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
      selectedModelId.value !== defaultWebLlmModelId ||
      installState.value === 'installing' ||
      loadState.value === 'loading' ||
      saveData ||
      (!connectionHealthy && !probeHealthy)
    ) {
      return
    }

    autoWarmQueued.value = true
    isAutoWarming.value = true
    void prefetchModel$(selectedModelId.value)
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
    selectedModelId.value = nextModel as WebLlmModelId
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
    const worker = await ensureWorker$()
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

  const offlineReady = hasWebLlmCache.value || hasTransformersCache.value
  const selectedModel = getSelectedModel()
  const isAccelerationReady = accelerationReady !== false
  const isWebNn = deviceMode.value.startsWith('webnn')
  const isWebNnNpu = deviceMode.value === 'webnn-npu'
  const isSelectedModelLoaded = loadedModelId.value === selectedModelId.value
  const isSelectedModelReady = loadState.value === 'ready' && isSelectedModelLoaded
  const isWebNnSelected = preferredAcceleration === 'npu'
  const isCustomModelInvalid = hasCustomModelError()
  const isInstallForSelected = installModelId.value === selectedModelId.value

  return (
    <div class="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-slate-200">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-wide text-emerald-300">{_`On-device WebLLM`}</p>
          <p class="text-lg font-semibold text-slate-50">
            {_`Stream tokens locally over WebGPU`}
          </p>
          <p class="mt-1 max-w-2xl text-sm text-slate-300">
            {_`Pick a quantized model, watch load progress, and chat without shipping prompts to the server.`}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100"
            onClick$={resetConversation$}
          >
            {_`Reset conversation`}
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 disabled:opacity-50"
            disabled={installState.value === 'installing' || isCustomModelInvalid || isStorageBlocked.value}
            onClick$={$(() => prefetchModel$(selectedModelId.value))}
          >
            {_`Install (background)`}
          </button>
          <button
            type="button"
            class="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 disabled:opacity-50"
            disabled={
              loadState.value === 'loading' ||
              installState.value === 'installing' ||
              !isAccelerationReady ||
              isCustomModelInvalid ||
              isStorageBlocked.value
            }
            onClick$={$(() => loadModel$(selectedModelId.value, preferredAcceleration ?? 'gpu'))}
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
        <div class="mt-3 flex flex-wrap items-start gap-3 rounded-md border border-amber-700/50 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div class="space-y-1">
            <p class="font-semibold">{_`First download is large`}</p>
            <p>
              {_`Expect the initial model pull (2–5 GB) to take time; keep this tab open until the cache finishes so offline reloads are instant.`}
            </p>
          </div>
          <button
            type="button"
            class="rounded-md border border-amber-400/60 px-3 py-2 text-xs font-semibold text-amber-50"
            onClick$={dismissDownloadWarning}
          >
            {_`Got it`}
          </button>
        </div>
      )}

      <div class="mt-4 grid gap-3 lg:grid-cols-[2fr_1.3fr]">
        <div class="space-y-3">
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            {_`Model`}
          </label>
          <select
            class="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            value={isCustomModelSelected.value ? customModelKey : selectedModelId.value}
            onChange$={handleModelChange}
          >
            {webLlmModels.map((model) => (
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
            <label class="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {_`Custom onnx-community model`}
            </label>
            <input
              type="text"
              class="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              placeholder={_`onnx-community/<model-id>`}
              value={customModelInput.value}
              onInput$={handleCustomModelInput}
              disabled={!isCustomModelSelected.value}
            />
            <label class="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {_`Precision`}
            </label>
            <select
              class="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              value={customModelDtype.value}
              onChange$={handleCustomDtypeChange}
              disabled={!isCustomModelSelected.value}
            >
              <option value="q4f16">{_`q4f16 (smallest download)`}</option>
              <option value="fp16">{_`fp16`}</option>
              <option value="fp32">{_`fp32 (largest download)`}</option>
              <option value="auto">{_`Auto (try q4f16 -> fp16 -> fp32)`}</option>
            </select>
            <p class="text-xs text-slate-400">
              {_`Paste a Hugging Face URL or repo id. Use text-generation ONNX models from onnx-community.`}
            </p>
            <p class="text-xs text-slate-400">
              {_`Pick q4f16 when you have local files; fp16/fp32 will download larger shards.`}
            </p>
            {customModelError.value && <p class="text-xs text-rose-300">{customModelError.value}</p>}
            {!customModelError.value && customModelId.value && (
              <a
                class="text-xs font-semibold text-emerald-200 underline underline-offset-4"
                href={`https://huggingface.co/${customModelId.value}`}
                target="_blank"
                rel="noreferrer"
              >
                {_`View on Hugging Face`}
              </a>
            )}
          </div>

          {webLlmModels.map((model) => (
            <div key={model.id} class={model.id === selectedModelId.value ? 'block' : 'hidden'}>
              <p class="text-sm text-slate-300">{model.description}</p>
              {isWebNnSelected && (
                <p class="mt-2 text-xs text-cyan-200">
                  {_`WebNN uses ${model.transformers.label} via Transformers.js.`}
                </p>
              )}
              <div class="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                <span class="rounded-md border border-slate-800 px-2 py-1">
                  {_`Quantization: ${model.quantization}`}
                </span>
                <span class="rounded-md border border-slate-800 px-2 py-1">{_`Size: ${model.size}`}</span>
                <span class="rounded-md border border-slate-800 px-2 py-1">
                  {_`Context: ${model.contextLength}`}
                </span>
                <span class="rounded-md border border-slate-800 px-2 py-1 sm:col-span-3">
                  {_`Recommended VRAM: ${model.recommendedTier}`}
                </span>
              </div>
            </div>
          ))}
          {isCustomModelSelected.value && (
            <div class="rounded-md border border-slate-800 bg-slate-950/40 p-3">
              <p class="text-sm text-slate-300">
                {_`Custom ONNX model hosted on Hugging Face and loaded with Transformers.js.`}
              </p>
              <div class="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                <span class="rounded-md border border-slate-800 px-2 py-1">{_`Format: ONNX`}</span>
                <span class="rounded-md border border-slate-800 px-2 py-1">{_`Size: varies`}</span>
                <span class="rounded-md border border-slate-800 px-2 py-1">{_`Context: varies`}</span>
                <span class="rounded-md border border-slate-800 px-2 py-1 sm:col-span-3">
                  {_`Recommended tier: depends on model size`}
                </span>
              </div>
            </div>
          )}

          <div class="mt-3 flex items-center gap-2 text-sm">
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
              <span class="inline-flex items-center rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-100">
                {_`Warming...`}
              </span>
            )}
            {runtime.value === 'transformers' && (
              <span class="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100">
                {_`Transformers.js`}
              </span>
            )}
            {runtime.value === 'transformers' && wasmThreads.value !== null && (
              <span class="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100">
                {_`Threads: ${wasmThreads.value}`}
              </span>
            )}
            {runtime.value === 'transformers' && dtype.value && (
              <span class="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100">
                {_`Precision: ${dtype.value}`}
              </span>
            )}
            <span
              class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                deviceMode.value === 'webgpu'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : isWebNn
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'bg-slate-800 text-slate-200'
              }`}
            >
              {deviceMode.value === 'webgpu'
                ? _`GPU`
                : isWebNnNpu
                  ? _`NPU / WebNN`
                  : isWebNn
                    ? _`WebNN`
                    : _`CPU / WASM`}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-200">
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
            {hasWebLlmCache.value && (
              <span class="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 font-semibold text-emerald-100">
                {_`WebLLM cache detected`}
              </span>
            )}
            {hasTransformersCache.value && (
              <span class="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 font-semibold text-emerald-100">
                {_`Transformers.js cache detected`}
              </span>
            )}
            {freeStorageBytes.value !== null && (
              <span class="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 font-semibold text-slate-100">
                {_`Free storage: ${formatBytes(freeStorageBytes.value)}`}
              </span>
            )}
          </div>

          {error.value && <p class="text-sm text-rose-300">{error.value}</p>}
          {hasWebGpu.value === false && (
            <p class="text-sm text-amber-200">
              {_`WebGPU is not detected; using a non-WebGPU fallback.`}
            </p>
          )}
          {loadedModelId.value && !isSelectedModelLoaded && (
            <p class="text-sm text-amber-200">
              {_`Selected model is not installed yet. Click install to switch.`}
            </p>
          )}
          {storageWarning.value && <p class="text-sm text-amber-200">{storageWarning.value}</p>}
          {selectedModel?.size && (
            <p class="text-xs text-slate-400">
              {_`Offline cache target: ${selectedModel.size} (~${formatBytes(selectedModel.sizeBytes)})`}
            </p>
          )}
        </div>

        <div class="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <p class="text-xs uppercase tracking-wide text-emerald-300">{_`Chat transcript`}</p>
          <div class="mt-3 space-y-3 overflow-y-auto rounded-md bg-slate-950/40 p-3 text-sm max-h-72">
            {transcript.value.length === 0 && (
              <p class="text-slate-400">{_`No messages yet. Ask a quick question to warm the model.`}</p>
            )}
            {transcript.value.map((entry, index) => (
              <div key={`${entry.role}-${index}`} class="space-y-1 rounded-md border border-slate-800/70 bg-slate-900/60 p-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {entry.role === 'user' ? _`You` : _`WebLLM`}
                </p>
                <p class="whitespace-pre-wrap text-slate-100">{entry.content}</p>
              </div>
            ))}
            {isStreaming.value && (
              <div class="space-y-1 rounded-md border border-slate-800/70 bg-slate-900/60 p-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">{_`WebLLM`}</p>
                <p class="whitespace-pre-wrap text-slate-100">{streamingText.value || _`...`}</p>
              </div>
            )}
          </div>

          <div class="mt-3 space-y-2">
            <textarea
              class="h-24 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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
                class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-50"
                disabled={!isSelectedModelReady || isStreaming.value}
                onClick$={sendPrompt}
              >
                {isStreaming.value ? _`Streaming...` : _`Send to WebLLM`}
              </button>
              <button
                type="button"
                class="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50"
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
