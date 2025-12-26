import type { ChatCompletionChunk, ChatCompletionMessageParam, InitProgressReport, MLCEngine } from '@mlc-ai/web-llm'
import type * as TransformersTypes from '@huggingface/transformers'
import { webLlmModelRecords, webLlmModels, type WebLlmModelId } from '../config/ai-models'
import type { AccelerationPreference } from '../config/ai-acceleration'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
export type Runtime = 'web-llm' | 'transformers'
export type DeviceMode = 'webgpu' | 'wasm' | 'webnn' | 'webnn-npu' | 'webnn-gpu' | 'webnn-cpu'

export type Role = 'user' | 'assistant'
export interface TranscriptEntry {
  role: Role
  content: string
}

type TextGenerationPipeline = ((prompt: string, options?: Record<string, unknown>) => Promise<any>) & {
  tokenizer: unknown
}

export type AiWorkerRequest =
  | { type: 'load-model'; modelId: WebLlmModelId; acceleration: AccelerationPreference }
  | { type: 'generate'; modelId: WebLlmModelId; prompt: string; transcript: TranscriptEntry[] }
  | { type: 'stop' }
  | { type: 'reset' }

export type AiWorkerResponse =
  | {
      type: 'progress'
      message: string
      loadState?: LoadState
      runtime?: Runtime
      deviceMode?: DeviceMode
      modelId?: WebLlmModelId
      threads?: number
    }
  | {
      type: 'ready'
      message: string
      runtime: Runtime
      deviceMode: DeviceMode
      modelId: WebLlmModelId
      threads?: number
    }
  | { type: 'token'; chunk: string }
  | { type: 'complete'; content: string }
  | { type: 'error'; error: string; loadState?: LoadState }
  | { type: 'stopped' }

type WorkerScope = {
  postMessage: (message: AiWorkerResponse) => void
  addEventListener: (type: 'message', listener: (event: MessageEvent<AiWorkerRequest>) => void) => void
}

const ctx = self as unknown as WorkerScope
const mapChunkToText = (chunk: ChatCompletionChunk) => {
  const delta = chunk.choices?.[0]?.delta
  if (!delta) return ''

  const content = Array.isArray(delta.content) ? delta.content.map((item) => item.text).join(' ') : delta.content
  return content ?? ''
}

let loadState: LoadState = 'idle'
let runtime: Runtime = 'web-llm'
let deviceMode: DeviceMode = 'webgpu'
let loadedModelId: WebLlmModelId | null = null
let transformersAbortController: AbortController | null = null
let engineRef: MLCEngine | null = null
let pipelineRef: TextGenerationPipeline | null = null
let moduleRef: typeof import('@mlc-ai/web-llm') | null = null
let transformersRef: typeof TransformersTypes | null = null
const engineCache: Partial<Record<WebLlmModelId, MLCEngine>> = {}
const pipelineCache: Partial<Record<string, TextGenerationPipeline>> = {}
let wasmThreadCount: number | null = null

const hasWebGpu = () => typeof navigator !== 'undefined' && 'gpu' in navigator
const getHardwareThreadCount = () => {
  if (typeof navigator === 'undefined') return 1
  const cores = navigator.hardwareConcurrency ?? 1
  if (!Number.isFinite(cores)) return 1
  return Math.max(1, cores)
}
const resolveWasmThreadCount = () => {
  const isCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  if (!isCrossOriginIsolated) return 1
  const capped = Math.min(getHardwareThreadCount(), 4)
  return Math.max(1, capped)
}
const getWasmThreadCount = () => {
  if (wasmThreadCount !== null) return wasmThreadCount
  wasmThreadCount = resolveWasmThreadCount()
  return wasmThreadCount
}
const formatProgress = (report: InitProgressReport) => {
  const pct = Math.max(0, Math.min(100, Math.round(report.progress * 100)))
  const details = report.text ? ` · ${report.text}` : ''
  return `Loading: ${pct}%${details}`
}

const formatDeviceLabel = (device: DeviceMode) => {
  switch (device) {
    case 'webgpu':
      return 'WebGPU'
    case 'wasm':
      return 'WASM (CPU)'
    case 'webnn-npu':
      return 'WebNN NPU'
    case 'webnn-gpu':
      return 'WebNN GPU'
    case 'webnn-cpu':
      return 'WebNN CPU'
    case 'webnn':
      return 'WebNN'
    default:
      return device
  }
}

const uniqueDevices = (devices: DeviceMode[]) => Array.from(new Set(devices))

const getTransformersDeviceCandidates = (acceleration: AccelerationPreference): DeviceMode[] => {
  if (acceleration === 'npu') {
    const devices: DeviceMode[] = ['webnn-npu', 'webnn-gpu', 'webnn-cpu', 'webnn']
    if (hasWebGpu()) devices.push('webgpu')
    devices.push('wasm')
    return uniqueDevices(devices)
  }

  if (acceleration === 'auto') {
    const devices: DeviceMode[] = []
    if (hasWebGpu()) devices.push('webgpu')
    devices.push('webnn', 'webnn-gpu', 'webnn-cpu', 'wasm')
    return uniqueDevices(devices)
  }

  return hasWebGpu() ? ['webgpu', 'wasm'] : ['wasm']
}

const ensureModule = async () => {
  if (moduleRef) return moduleRef
  moduleRef = await import('@mlc-ai/web-llm')
  return moduleRef
}

const ensureTransformers = async () => {
  if (transformersRef) return transformersRef
  const mod = await import('@huggingface/transformers')
  mod.env.allowLocalModels = false
  mod.env.allowRemoteModels = true
  const threads = getWasmThreadCount()
  const ortWasmPath = '/ort/'
  const backends = mod.env.backends
  const onnxBackend = backends.onnx ?? {}
  const wasmBackend = {
    ...onnxBackend.wasm,
    wasmPaths: ortWasmPath,
    numThreads: threads
  }

  mod.env.backends = {
    ...backends,
    onnx: {
      ...onnxBackend,
      wasm: wasmBackend
    }
  }
  transformersRef = mod
  return mod
}

const send = (message: AiWorkerResponse) => ctx.postMessage(message)

const setLoadState = (next: LoadState) => {
  loadState = next
}

const loadWebLlmModel = async (modelId: WebLlmModelId, acceleration: AccelerationPreference) => {
  const canUseWebGpu = acceleration !== 'npu' && hasWebGpu()
  if (!canUseWebGpu) return false

  const mod = await ensureModule()

  try {
    const cachedEngine = engineCache[modelId]
    if (cachedEngine) {
      cachedEngine.setInitProgressCallback((report) => send({ type: 'progress', message: formatProgress(report) }))
      engineRef = cachedEngine
    } else {
      const engine = await mod.CreateMLCEngine(modelId, {
        appConfig: { model_list: webLlmModelRecords },
        initProgressCallback: (report) => send({ type: 'progress', message: formatProgress(report) })
      })
      engineRef = engine
      engineCache[modelId] = engine
    }

    loadedModelId = modelId
    runtime = 'web-llm'
    deviceMode = 'webgpu'
    setLoadState('ready')
    const loadedLabel = webLlmModels.find((model) => model.id === modelId)?.label ?? modelId
    send({
      type: 'ready',
      message: `Ready: ${loadedLabel}`,
      runtime,
      deviceMode,
      modelId
    })
    return true
  } catch (err) {
    console.error(err)
    setLoadState('error')
    send({ type: 'error', error: (err as Error)?.message ?? 'Unable to load WebLLM.', loadState })
    return false
  }
}

const loadTransformersModel = async (modelId: WebLlmModelId, acceleration: AccelerationPreference) => {
  const mod = await ensureTransformers()
  const modelInfo = webLlmModels.find((model) => model.id === modelId)
  const transformersSpec = modelInfo?.transformers
  if (!transformersSpec) {
    setLoadState('error')
    send({ type: 'error', error: 'Selected model is not available for Transformers.js.', loadState })
    return
  }
  const devices = getTransformersDeviceCandidates(acceleration)
  let lastError: Error | null = null

  for (const device of devices) {
    try {
      const cacheKey = `${transformersSpec.id}:${device}`
      const cachedPipeline = pipelineCache[cacheKey]
      if (cachedPipeline) {
        pipelineRef = cachedPipeline
      } else {
        const pipeline = (await mod.pipeline(transformersSpec.task, transformersSpec.id, { device })) as TextGenerationPipeline
        pipelineRef = pipeline
        pipelineCache[cacheKey] = pipeline
      }

      engineRef = null
      loadedModelId = modelId
      runtime = 'transformers'
      deviceMode = device
      setLoadState('ready')
      const loadedLabel = transformersSpec.label || transformersSpec.id
      const deviceLabel = formatDeviceLabel(device)
      send({
        type: 'ready',
        message: `Ready via Transformers.js: ${loadedLabel} (${deviceLabel})`,
        runtime,
        deviceMode,
        modelId,
        threads: getWasmThreadCount()
      })
      return
    } catch (err) {
      lastError = err as Error
    }
  }

  if (lastError) {
    console.error(lastError)
  }
  setLoadState('error')
  send({ type: 'error', error: lastError?.message ?? 'Unable to load the fallback pipeline.', loadState })
}

const handleLoadModel = async (message: Extract<AiWorkerRequest, { type: 'load-model' }>) => {
  transformersAbortController?.abort()
  transformersAbortController = null
  setLoadState('loading')
  send({
    type: 'progress',
    message:
      message.acceleration === 'npu'
        ? 'Starting Transformers.js with WebNN...'
        : hasWebGpu()
          ? 'Starting WebLLM...'
          : 'Loading Transformers.js fallback...',
    loadState
  })

  const shouldTryWebLlm = message.acceleration !== 'npu' && hasWebGpu()
  const webLlmLoaded = shouldTryWebLlm ? await loadWebLlmModel(message.modelId, message.acceleration) : false
  if (webLlmLoaded) return

  send({
    type: 'progress',
    message:
      message.acceleration === 'npu'
        ? 'WebNN requested; loading Transformers.js.'
        : shouldTryWebLlm
          ? 'WebLLM failed; switching to Transformers.js.'
          : 'WebGPU unavailable; using Transformers.js.',
    loadState: 'loading',
    runtime: 'transformers',
    deviceMode: message.acceleration === 'npu' ? 'webnn-npu' : hasWebGpu() ? 'webgpu' : 'wasm',
    modelId: message.modelId,
    threads: getWasmThreadCount()
  })

  await loadTransformersModel(message.modelId, message.acceleration)
}

const handleWebLlmGeneration = async (prompt: string, transcript: TranscriptEntry[]) => {
  if (!engineRef) throw new Error('WebLLM engine is not ready yet.')

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'Keep responses concise and explicitly note that tokens are streaming from the browser.'
    },
    ...transcript.map((entry) => ({ role: entry.role, content: entry.content } as ChatCompletionMessageParam)),
    { role: 'user', content: prompt }
  ]

  let buffer = ''
  const iterator = await engineRef.chat.completions.create({
    model: loadedModelId ?? undefined,
    messages,
    stream: true
  })

  for await (const chunk of iterator) {
    const text = mapChunkToText(chunk)
    if (!text) continue
    buffer += text
    send({ type: 'token', chunk: text })
  }

  return buffer
}

const handleTransformersGeneration = async (prompt: string, transcript: TranscriptEntry[]) => {
  if (!pipelineRef || !transformersRef) throw new Error('Transformers.js pipeline is not ready yet.')

  const mod = transformersRef
  const streamer = new mod.TextStreamer(pipelineRef.tokenizer as any, {
    callback_function: (chunk: string) => {
      send({ type: 'token', chunk })
    }
  })

  const abortController = new AbortController()
  transformersAbortController = abortController

  const conversation = transcript
    .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
    .join('\n')

  const composedPrompt = conversation
    ? `${conversation}\nUser: ${prompt}\nAssistant:`
    : `User: ${prompt}\nAssistant:`

  const outputs = await pipelineRef(composedPrompt, {
    max_new_tokens: 200,
    temperature: 0.6,
    streamer,
    signal: abortController.signal
  })

  const generated = Array.isArray(outputs)
    ? outputs[0]?.generated_text ?? ''
    : typeof outputs === 'string'
      ? outputs
      : ''

  return generated.replace(composedPrompt, '').trim()
}

const handleGenerate = async (message: Extract<AiWorkerRequest, { type: 'generate' }>) => {
  if (loadState !== 'ready') {
    send({ type: 'error', error: 'Model is not ready yet.', loadState })
    return
  }

  try {
    const assistantText =
      runtime === 'web-llm'
        ? await handleWebLlmGeneration(message.prompt, message.transcript)
        : await handleTransformersGeneration(message.prompt, message.transcript)

    send({ type: 'complete', content: assistantText })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      send({ type: 'stopped' })
      return
    }
    console.error(err)
    send({ type: 'error', error: (err as Error)?.message ?? 'Unable to complete the request.' })
  } finally {
    transformersAbortController = null
  }
}

const stopStreaming = async () => {
  if (runtime === 'web-llm' && engineRef) {
    await engineRef.interruptGenerate()
  }

  if (runtime === 'transformers' && transformersAbortController) {
    transformersAbortController.abort()
  }

  transformersAbortController = null
  send({ type: 'stopped' })
}

ctx.addEventListener('message', (event: MessageEvent<AiWorkerRequest>) => {
  const data = event.data
  if (!data) return

  switch (data.type) {
    case 'load-model':
      handleLoadModel(data)
      break
    case 'generate':
      handleGenerate(data)
      break
    case 'stop':
      stopStreaming()
      break
    case 'reset':
      transformersAbortController?.abort()
      transformersAbortController = null
      send({ type: 'stopped' })
      break
  }
})
