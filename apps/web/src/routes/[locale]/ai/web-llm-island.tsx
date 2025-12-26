import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { _ } from 'compiled-i18n'
import type { AccelerationTarget } from '../../../config/ai-acceleration'
import { defaultWebLlmModelId, webLlmModels, type WebLlmModelId } from '../../../config/ai-models'
import type {
  AiWorkerRequest,
  AiWorkerResponse,
  DeviceMode,
  LoadState,
  Runtime,
  TranscriptEntry
} from '../../../workers/ai-inference.worker'
import workerUrl from '../../../workers/ai-inference.worker?worker&url'

const formatBytes = (bytes: number) => {
  const gb = bytes / 1024 ** 3
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`
  }

  const mb = bytes / 1024 ** 2
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

interface WebLlmIslandProps {
  preferredAcceleration?: AccelerationTarget
  accelerationReady?: boolean
}

export const WebLlmIsland = component$<WebLlmIslandProps>(({ preferredAcceleration, accelerationReady }) => {
  const workerRef = useSignal<Worker | null>(null)
  const selectedModelId = useSignal<WebLlmModelId>(defaultWebLlmModelId)
  const loadedModelId = useSignal<WebLlmModelId | null>(null)
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
  const hasWebLlmCache = useSignal(false)
  const hasTransformersCache = useSignal(false)
  const cacheCheckComplete = useSignal(false)
  const shouldShowDownloadWarning = useSignal(false)
  const downloadWarningDismissed = useSignal(false)
  const storageWarning = useSignal('')
  const freeStorageBytes = useSignal<number | null>(null)

  const ensureWorker = async () => {
    if (workerRef.value) return workerRef.value
    const worker = new Worker(workerUrl, { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<AiWorkerResponse>) => {
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
          break
        case 'ready':
          loadState.value = 'ready'
          progress.value = data.message
          runtime.value = data.runtime
          deviceMode.value = data.deviceMode
          loadedModelId.value = data.modelId
          wasmThreads.value =
            typeof data.threads === 'number' ? data.threads : data.runtime === 'web-llm' ? null : wasmThreads.value
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
      }
    })

    workerRef.value = worker
    return worker
  }

  const getSelectedModel = () => webLlmModels.find((model) => model.id === selectedModelId.value)

  const updateStorageEstimate = async (modelId: WebLlmModelId) => {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return

    try {
      const { quota, usage } = await navigator.storage.estimate()
      if (!quota || typeof usage !== 'number') return
      const free = quota - usage
      freeStorageBytes.value = free
      const model = webLlmModels.find((item) => item.id === modelId)
      if (model?.sizeBytes && free < model.sizeBytes) {
        storageWarning.value = _`Only ${formatBytes(free)} free; ${model.label} needs about ${model.size}.`
      } else {
        storageWarning.value = ''
      }
    } catch (err) {
      console.error(err)
    }
  }

  const resetConversation = () => {
    streamingText.value = ''
    transcript.value = []
    error.value = ''
    workerRef.value?.postMessage({ type: 'reset' } satisfies AiWorkerRequest)
  }

  const resolveAcceleration = () => preferredAcceleration ?? 'gpu'

  const loadModel = async (modelId: WebLlmModelId, acceleration: AccelerationTarget = resolveAcceleration()) => {
    const worker = await ensureWorker()
    loadState.value = 'loading'
    loadedModelId.value = null
    error.value = ''
    wasmThreads.value = null
    progress.value =
      acceleration === 'npu'
        ? _`Starting WebNN inference...`
        : hasWebGpu.value
          ? _`Starting WebLLM...`
          : _`Loading Transformers.js fallback...`

    worker.postMessage({ type: 'load-model', modelId, acceleration } satisfies AiWorkerRequest)
  }

  useVisibleTask$(() => {
    const restoreDownloadWarning = () => {
      if (typeof sessionStorage === 'undefined') return
      const dismissed = sessionStorage.getItem('ai-download-warning-dismissed') === '1'
      downloadWarningDismissed.value = dismissed
      shouldShowDownloadWarning.value = !dismissed
    }

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

    hasWebGpu.value = typeof navigator !== 'undefined' && 'gpu' in navigator
    restoreDownloadWarning()
    void checkCaches()
    void updateStorageEstimate(selectedModelId.value)

    return () => {
      workerRef.value?.terminate()
      workerRef.value = null
    }
  })

  useVisibleTask$(({ track }) => {
    track(() => selectedModelId.value)
    void updateStorageEstimate(selectedModelId.value)
  })

  const handleModelChange = $(async (event: Event) => {
    const target = event.target as HTMLSelectElement
    const nextModel = target.value as WebLlmModelId
    selectedModelId.value = nextModel
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
        transcript: transcriptPayload
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
            onClick$={$(() => resetConversation())}
          >
            {_`Reset conversation`}
          </button>
          <button
            type="button"
            class="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 disabled:opacity-50"
            disabled={loadState.value === 'loading' || !isAccelerationReady}
            onClick$={$(() => loadModel(selectedModelId.value, resolveAcceleration()))}
          >
            {isSelectedModelLoaded ? _`Reload model` : _`Install model`}
          </button>
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
            value={selectedModelId.value}
            onChange$={handleModelChange}
          >
            {webLlmModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>

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
