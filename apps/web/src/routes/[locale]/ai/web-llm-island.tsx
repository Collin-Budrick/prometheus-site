import { $, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  InitProgressReport,
  MLCEngine
} from '@mlc-ai/web-llm'
import { _ } from 'compiled-i18n'
import type * as WebLlmTypes from '@mlc-ai/web-llm'
import type * as TransformersTypes from '@huggingface/transformers'
import {
  defaultWebLlmModelId,
  webLlmModels,
  webLlmModelRecords,
  type WebLlmModelId
} from '../../../config/ai-models'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type Runtime = 'web-llm' | 'transformers'
type DeviceMode = 'webgpu' | 'wasm'
type TextGenerationPipeline = ((prompt: string, options?: Record<string, unknown>) => Promise<any>) & {
  tokenizer: unknown
}

type Role = 'user' | 'assistant'
interface TranscriptEntry {
  role: Role
  content: string
}

const formatProgress = (report: InitProgressReport) => {
  const pct = Math.max(0, Math.min(100, Math.round(report.progress * 100)))
  const details = report.text ? ` · ${report.text}` : ''
  return _`Loading: ${pct}%${details}`
}

const mapChunkToText = (chunk: ChatCompletionChunk) => {
  const delta = chunk.choices?.[0]?.delta
  if (!delta) return ''

  const content = Array.isArray(delta.content) ? delta.content.map((item) => item.text).join(' ') : delta.content
  return content ?? ''
}

export const WebLlmIsland = component$(() => {
  const moduleRef = useSignal<typeof WebLlmTypes | null>(null)
  const transformersRef = useSignal<typeof TransformersTypes | null>(null)
  const engineRef = useSignal<MLCEngine | null>(null)
  const engineCache = useSignal<Partial<Record<WebLlmModelId, MLCEngine>>>({})
  const pipelineCache = useSignal<Partial<Record<WebLlmModelId, TextGenerationPipeline>>>({})
  const transformersAbortRef = useSignal<AbortController | null>(null)
  const pipelineRef = useSignal<TextGenerationPipeline | null>(null)
  const selectedModelId = useSignal<WebLlmModelId>(defaultWebLlmModelId)
  const loadedModelId = useSignal<WebLlmModelId | null>(null)
  const loadState = useSignal<LoadState>('idle')
  const progress = useSignal('')
  const error = useSignal('')
  const prompt = useSignal('')
  const streamingText = useSignal('')
  const isStreaming = useSignal(false)
  const hasWebGpu = useSignal<boolean | null>(null)
  const transcript = useSignal<TranscriptEntry[]>([])
  const runtime = useSignal<Runtime>('web-llm')
  const deviceMode = useSignal<DeviceMode>('webgpu')

  const ensureModule = async () => {
    if (moduleRef.value) return moduleRef.value
    const mod = await import('@mlc-ai/web-llm')
    moduleRef.value = mod
    return mod
  }

  const ensureTransformers = async () => {
    if (transformersRef.value) return transformersRef.value
    const mod = await import('@huggingface/transformers')
    mod.env.allowLocalModels = false
    mod.env.allowRemoteModels = true
    transformersRef.value = mod
    return mod
  }

  const applyProgress = (report: InitProgressReport) => {
    progress.value = formatProgress(report)
  }

  const resetConversation = () => {
    streamingText.value = ''
    transcript.value = []
  }

  const loadModel = async (modelId: WebLlmModelId) => {
    const canUseWebGpu = hasWebGpu.value === true
    loadState.value = 'loading'
    error.value = ''
    progress.value = canUseWebGpu ? _`Starting WebLLM...` : _`Loading Transformers.js fallback...`

    if (canUseWebGpu) {
      const webLlmLoaded = await loadWebLlmModel(modelId)
      if (webLlmLoaded) return
      progress.value = _`WebLLM failed; switching to Transformers.js.`
    }

    await loadTransformersModel(modelId, canUseWebGpu ? 'webgpu' : 'wasm')
  }

  const loadWebLlmModel = async (modelId: WebLlmModelId) => {
    const mod = await ensureModule()

    try {
      const cachedEngine = engineCache.value[modelId]
      if (cachedEngine) {
        cachedEngine.setInitProgressCallback(applyProgress)
        engineRef.value = cachedEngine
      } else {
        const engine = await mod.CreateMLCEngine(modelId, {
          appConfig: { model_list: webLlmModelRecords },
          initProgressCallback: applyProgress
        })
        engineRef.value = engine
        engineCache.value = { ...engineCache.value, [modelId]: engine }
      }

      loadedModelId.value = modelId
      runtime.value = 'web-llm'
      deviceMode.value = 'webgpu'
      loadState.value = 'ready'
      const loadedLabel = webLlmModels.find((model) => model.id === modelId)?.label ?? modelId
      progress.value = _`Ready: ${loadedLabel}`
      return true
    } catch (err) {
      console.error(err)
      loadState.value = 'error'
      error.value = (err as Error)?.message ?? _`Unable to load the selected model.`
      return false
    }
  }

  const loadTransformersModel = async (modelId: WebLlmModelId, device: DeviceMode) => {
    const mod = await ensureTransformers()

    try {
      const cachedPipeline = pipelineCache.value[modelId]
      if (cachedPipeline) {
        pipelineRef.value = cachedPipeline
      } else {
        const pipeline = (await mod.pipeline('text-generation', modelId, { device })) as TextGenerationPipeline
        pipelineRef.value = pipeline
        pipelineCache.value = { ...pipelineCache.value, [modelId]: pipeline }
      }

      engineRef.value = null
      loadedModelId.value = modelId
      runtime.value = 'transformers'
      deviceMode.value = device
      loadState.value = 'ready'
      error.value = ''
      const loadedLabel = webLlmModels.find((model) => model.id === modelId)?.label ?? modelId
      const deviceLabel = device === 'webgpu' ? _`WebGPU` : _`WASM (CPU)`
      progress.value = _`Ready via Transformers.js: ${loadedLabel} (${deviceLabel})`
    } catch (err) {
      console.error(err)
      loadState.value = 'error'
      error.value = (err as Error)?.message ?? _`Unable to load the fallback pipeline.`
    }
  }

  useVisibleTask$(async () => {
    hasWebGpu.value = typeof navigator !== 'undefined' && 'gpu' in navigator
    await loadModel(selectedModelId.value)
  })

  const handleModelChange = $(async (event: Event) => {
    const target = event.target as HTMLSelectElement
    const nextModel = target.value as WebLlmModelId
    selectedModelId.value = nextModel
    await loadModel(nextModel)
  })

  const stopStreaming = $(async () => {
    if (!isStreaming.value) return

    if (runtime.value === 'web-llm' && engineRef.value) {
      await engineRef.value.interruptGenerate()
    }

    if (runtime.value === 'transformers' && transformersAbortRef.value) {
      transformersAbortRef.value.abort()
    }

    isStreaming.value = false
  })

  const sendPrompt = $(async () => {
    const promptValue = prompt.value.trim()
    if (!promptValue) return
    if (runtime.value === 'web-llm' && !engineRef.value) return
    if (runtime.value === 'transformers' && !pipelineRef.value) {
      error.value = _`Fallback pipeline is not ready yet. Try reloading the model.`
      return
    }

    streamingText.value = ''
    isStreaming.value = true
    error.value = ''
    prompt.value = ''

    const handleWebLlm = async () => {
      if (!engineRef.value) return

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: _`Keep responses concise and explicitly note that tokens are streaming from the browser.`
        },
        ...transcript.value.map(
          (entry) => ({ role: entry.role, content: entry.content } as ChatCompletionMessageParam)
        ),
        { role: 'user', content: promptValue }
      ]

      const iterator = await engineRef.value.chat.completions.create({
        model: selectedModelId.value,
        messages,
        stream: true
      })

      for await (const chunk of iterator) {
        streamingText.value = `${streamingText.value}${mapChunkToText(chunk)}`
      }

      return streamingText.value
    }

    const handleTransformers = async () => {
      if (!pipelineRef.value || !transformersRef.value) return ''

      const mod = transformersRef.value
      const streamer = new mod.TextStreamer(pipelineRef.value.tokenizer as any, {
        onTextChunk: (chunk) => {
          streamingText.value = `${streamingText.value}${chunk}`
        }
      })

      const abortController = new AbortController()
      transformersAbortRef.value = abortController

      const conversation = transcript.value
        .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
        .join('\n')

      const composedPrompt = conversation
        ? `${conversation}\nUser: ${promptValue}\nAssistant:`
        : `User: ${promptValue}\nAssistant:`

      const outputs = await pipelineRef.value(composedPrompt, {
        max_new_tokens: 200,
        temperature: 0.6,
        streamer,
        signal: abortController.signal
      })

      const generated = Array.isArray(outputs)
        ? outputs[0]?.generated_text ?? streamingText.value
        : streamingText.value
      return generated.replace(composedPrompt, '').trim() || streamingText.value
    }

    try {
      const assistantText =
        runtime.value === 'web-llm' ? await handleWebLlm() : await handleTransformers()

      transcript.value = [
        ...transcript.value,
        { role: 'user', content: promptValue },
        { role: 'assistant', content: assistantText ?? streamingText.value }
      ]
    } catch (err) {
      console.error(err)
      error.value = (err as Error)?.message ?? _`Unable to complete the request.`
    } finally {
      isStreaming.value = false
      streamingText.value = ''
      transformersAbortRef.value = null
    }
  })

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
            disabled={loadState.value === 'loading'}
            onClick$={$(() => loadModel(selectedModelId.value))}
          >
            {loadedModelId.value ? _`Reload model` : _`Load model`}
          </button>
        </div>
      </div>

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
            <span
              class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                deviceMode.value === 'webgpu'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {deviceMode.value === 'webgpu' ? _`GPU` : _`CPU / WASM`}
            </span>
          </div>

          {error.value && <p class="text-sm text-rose-300">{error.value}</p>}
          {hasWebGpu.value === false && (
            <p class="text-sm text-amber-200">
              {_`WebGPU is not detected; falling back to Transformers.js WASM mode.`}
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
              disabled={loadState.value !== 'ready' || isStreaming.value}
            />
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-50"
                disabled={loadState.value !== 'ready' || isStreaming.value}
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
