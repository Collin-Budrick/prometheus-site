import type { ChatCompletionChunk, ChatCompletionMessageParam, InitProgressReport, MLCEngine } from '@mlc-ai/web-llm'
import type * as TransformersTypes from '@huggingface/transformers'
import {
  getTransformersModel,
  isWebLlmModelId,
  onnxCommunityModelPrefix,
  webLlmModels,
  type AiModelId,
  type TransformersDtype,
  type WebLlmModelId
} from '../config/ai-models'
import type { AccelerationPreference } from '../config/ai-acceleration'
import { webLlmModelRecords } from './web-llm-records'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
export type Runtime = 'web-llm' | 'transformers'
export type DeviceMode = 'webgpu' | 'wasm' | 'webnn' | 'webnn-npu' | 'webnn-gpu' | 'webnn-cpu'

export type Role = 'user' | 'assistant'
export interface TranscriptEntry {
  role: Role
  content: string
}

type TextGenerationPipeline = ((prompt: string, options?: Record<string, unknown>) => Promise<any>) & {
  tokenizer: any
  model?: { generate: (options: Record<string, unknown>) => Promise<any> }
}

export type AiWorkerRequest =
  | { type: 'load-model'; modelId: AiModelId; acceleration: AccelerationPreference; dtype?: TransformersDtype }
  | { type: 'generate'; modelId: AiModelId; prompt: string; transcript: TranscriptEntry[] }
  | { type: 'stop' }
  | { type: 'reset' }

export type AiWorkerResponse =
  | {
      type: 'progress'
      message: string
      loadState?: LoadState
      runtime?: Runtime
      deviceMode?: DeviceMode
      modelId?: AiModelId
      threads?: number
    }
  | {
      type: 'ready'
      message: string
      runtime: Runtime
      deviceMode: DeviceMode
      modelId: AiModelId
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
let loadedModelId: AiModelId | null = null
let transformersAbortController: AbortController | null = null
let engineRef: MLCEngine | null = null
let pipelineRef: TextGenerationPipeline | null = null
let moduleRef: typeof import('@mlc-ai/web-llm') | null = null
let transformersRef: typeof TransformersTypes | null = null
let lastLoadDtype: TransformersDtype | undefined
const engineCache: Partial<Record<WebLlmModelId, MLCEngine>> = {}
const pipelineCache: Partial<Record<string, TextGenerationPipeline>> = {}
const fixedInputLengths = new Map<AiModelId, number>()
const forcedTransformersDevices = new Map<AiModelId, DeviceMode>()
const onnxTreeCache = new Map<AiModelId, Array<{ path: string; size: number }>>()
const webGpuSkipCache = new Map<AiModelId, boolean>()
const onnxConfigCache = new Map<AiModelId, { sequenceLength: number }>()
type TransformersConversationCache = {
  modelId: AiModelId
  tokenIds: BigInt64Array
  pastKeyValues: unknown
}
let transformersConversationCache: TransformersConversationCache | null = null
let wasmThreadCount: number | null = null
const ortLocalWasmPath = '/ort/'
const ortCdnWasmPath = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'
let ortWasmPath = ortLocalWasmPath
const allowWebNnNpu = false
const webGpuMaxStorageBufferBytes = 256 * 1024 * 1024
const defaultWebNnSequenceLength = 1024
const maxWasmThreads = 8

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
  const capped = Math.min(getHardwareThreadCount(), maxWasmThreads)
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

const resolveInputMetadata = (session: any, inputName: string) => {
  const inputNames = session?.inputNames
  const inputMetadata = session?.inputMetadata
  if (!Array.isArray(inputNames) || !Array.isArray(inputMetadata)) return null
  const index = inputNames.findIndex((name) => name === inputName || name.includes(inputName))
  if (index < 0) return null
  return inputMetadata[index] ?? null
}

const resolveFixedSequenceLength = (pipeline: TextGenerationPipeline) => {
  const sessions = (pipeline as any)?.model?.sessions
  if (!sessions || typeof sessions !== 'object') return null
  for (const session of Object.values(sessions)) {
    const metadata = resolveInputMetadata(session, 'input_ids')
    const shape = metadata?.shape
    if (Array.isArray(shape) && shape.length > 1) {
      const lastDim = shape[shape.length - 1]
      if (typeof lastDim === 'number' && Number.isFinite(lastDim) && lastDim > 0) {
        return lastDim
      }
    }
  }
  return null
}

const updateFixedInputLength = (modelId: AiModelId, pipeline: TextGenerationPipeline) => {
  const fixedLength = resolveFixedSequenceLength(pipeline)
  if (fixedLength) {
    fixedInputLengths.set(modelId, fixedLength)
  } else {
    fixedInputLengths.delete(modelId)
  }
  return fixedLength
}

const configureOnnxWasmBackend = (mod: typeof TransformersTypes, wasmPaths: string, threads: number) => {
  const backends = mod.env.backends
  const onnxBackend = backends.onnx ?? {}
  const wasmBackend = {
    ...onnxBackend.wasm,
    wasmPaths,
    numThreads: threads
  }

  mod.env.backends = {
    ...backends,
    onnx: {
      ...onnxBackend,
      wasm: wasmBackend
    }
  }
}

const shouldRetryWithCdn = (err: unknown) => {
  if (ortWasmPath === ortCdnWasmPath) return false
  const message = typeof err === 'string' ? err : (err as Error)?.message ?? ''
  const normalized = message.toLowerCase()
  if (!normalized) return false
  if (normalized.includes('/ort/')) return true
  if (normalized.includes('ort-wasm')) return true
  return normalized.includes('wasm') && normalized.includes('fetch')
}

const coercePositiveInt = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

const isOnnxFilePath = (path: string) => path.endsWith('.onnx') || path.includes('.onnx_data')

const fetchOnnxCommunityTree = async (modelId: AiModelId) => {
  const cached = onnxTreeCache.get(modelId)
  if (cached) return cached
  const response = await fetch(`https://huggingface.co/api/models/${modelId}/tree/main?recursive=1`)
  if (!response.ok) {
    throw new Error(`Unable to fetch model manifest (${response.status}).`)
  }
  const data = await response.json()
  const files = Array.isArray(data) ? data : []
  const parsed = files
    .map((file) => {
      const path = typeof file?.path === 'string' ? file.path : ''
      const size = typeof file?.size === 'number' ? file.size : 0
      return { path, size }
    })
    .filter((file) => file.path)
  onnxTreeCache.set(modelId, parsed)
  return parsed
}

const fetchOnnxCommunityConfig = async (modelId: AiModelId) => {
  const cached = onnxConfigCache.get(modelId)
  if (cached) return cached
  if (!modelId.startsWith(onnxCommunityModelPrefix)) return null

  let sequenceLength = defaultWebNnSequenceLength
  try {
    const response = await fetch(`https://huggingface.co/${modelId}/raw/main/config.json`)
    if (response.ok) {
      const config = await response.json()
      const candidates = [
        config?.max_position_embeddings,
        config?.max_seq_len,
        config?.max_sequence_length,
        config?.seq_length,
        config?.n_ctx,
        config?.context_length
      ]
      const resolved = candidates.map(coercePositiveInt).find((value) => typeof value === 'number' && value > 0)
      if (resolved) {
        sequenceLength = Math.max(1, Math.min(resolved, defaultWebNnSequenceLength))
      }
    }
  } catch (err) {
    // Fall back to a safe default when config.json is unavailable.
  }

  const resolved = { sequenceLength }
  onnxConfigCache.set(modelId, resolved)
  return resolved
}

const resolveMaxOnnxFileSize = (files: Array<{ path: string; size: number }>, prefixes: string[]) => {
  const sizes = files
    .filter(
      (file) =>
        prefixes.some((prefix) => file.path.startsWith(prefix) && file.path.charAt(prefix.length) === '.') &&
        isOnnxFilePath(file.path)
    )
    .map((file) => file.size)
    .filter((size) => size > 0)
  return sizes.length ? Math.max(...sizes) : null
}

const resolveOnnxCommunityWebGpuSkip = async (modelId: AiModelId) => {
  const cached = webGpuSkipCache.get(modelId)
  if (typeof cached === 'boolean') return cached
  if (!modelId.startsWith(onnxCommunityModelPrefix)) return false

  try {
    const files = await fetchOnnxCommunityTree(modelId)
    const prefixGroups = [
      ['onnx/model_q4f16', 'model_q4f16'],
      ['onnx/model_fp16', 'model_fp16'],
      ['onnx/model', 'model']
    ]
    const maxSizes = prefixGroups
      .map((prefixes) => resolveMaxOnnxFileSize(files, prefixes))
      .filter((value): value is number => typeof value === 'number')

    if (!maxSizes.length) {
      webGpuSkipCache.set(modelId, false)
      return false
    }

    const smallestMax = Math.min(...maxSizes)
    const shouldSkip = smallestMax > webGpuMaxStorageBufferBytes
    webGpuSkipCache.set(modelId, shouldSkip)
    return shouldSkip
  } catch (err) {
    webGpuSkipCache.set(modelId, false)
    return false
  }
}

const buildWebNnFreeDims = (sequenceLength: number) => ({
  batch_size: 1,
  sequence_length: sequenceLength,
  total_sequence_length: sequenceLength,
  past_sequence_length: sequenceLength,
  max_length: sequenceLength
})

const resolveOnnxCommunityWebNnOverrides = async (modelId: AiModelId) => {
  const config = await fetchOnnxCommunityConfig(modelId)
  if (!config) return null
  return {
    freeDims: buildWebNnFreeDims(config.sequenceLength),
    sequenceLength: config.sequenceLength
  }
}

const resolveTokenData = (inputIds: any) => {
  const data = inputIds?.data
  if (data instanceof BigInt64Array) return data
  if (Array.isArray(data)) {
    return BigInt64Array.from(data as Array<bigint | number>)
  }
  return null
}

const hasTokenPrefix = (prefix: BigInt64Array, tokens: BigInt64Array) => {
  if (prefix.length > tokens.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix[i] !== tokens[i]) return false
  }
  return true
}

const disposeTensor = (tensor: unknown) => {
  if (!tensor || typeof tensor !== 'object') return
  const maybeDispose = (tensor as { dispose?: () => void }).dispose
  if (typeof maybeDispose === 'function') {
    maybeDispose.call(tensor)
  }
}

const disposePastKeyValues = (pastKeyValues: unknown) => {
  if (!pastKeyValues) return
  if (typeof (pastKeyValues as { dispose?: () => void }).dispose === 'function') {
    disposeTensor(pastKeyValues)
    return
  }
  for (const value of Object.values(pastKeyValues as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      value.forEach((item) => disposeTensor(item))
    } else {
      disposeTensor(value)
    }
  }
}

const resetTransformersConversationCache = () => {
  if (transformersConversationCache?.pastKeyValues) {
    disposePastKeyValues(transformersConversationCache.pastKeyValues)
  }
  transformersConversationCache = null
}

const updateTransformersConversationCache = (modelId: AiModelId, tokenIds: BigInt64Array, pastKeyValues: unknown) => {
  if (!pastKeyValues) return
  if (transformersConversationCache?.pastKeyValues) {
    disposePastKeyValues(transformersConversationCache.pastKeyValues)
  }
  transformersConversationCache = {
    modelId,
    tokenIds,
    pastKeyValues
  }
}

const getErrorText = (err: unknown) => {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message ?? ''
  if (typeof err === 'object') {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

const isWebGpuRuntimeFailure = (err: unknown) => {
  const cause = (err as { cause?: unknown })?.cause
  const normalized = `${getErrorText(err)} ${getErrorText(cause)}`.toLowerCase()
  if (!normalized.trim()) return false
  const markers = ['webgpu', 'bindgroup', 'commandbuffer', 'shaderstage', 'storage buffer', 'binding size']
  return markers.some((marker) => normalized.includes(marker))
}

const getTransformersDeviceCandidates = (
  acceleration: AccelerationPreference,
  webnnUnsupportedReason?: string,
  options?: { skipWebGpu?: boolean }
): DeviceMode[] => {
  const webnnAllowed = !webnnUnsupportedReason
  const skipWebGpu = options?.skipWebGpu ?? false
  const fallbackDevices: DeviceMode[] =
    hasWebGpu() && !skipWebGpu ? ['webgpu', 'wasm'] : ['wasm']
  if (acceleration === 'npu') {
    const devices: DeviceMode[] = []
    if (webnnAllowed && allowWebNnNpu) {
      devices.push('webnn-npu')
    }
    devices.push(...fallbackDevices)
    return uniqueDevices(devices)
  }

  if (acceleration === 'auto') {
    const devices: DeviceMode[] = []
    if (hasWebGpu() && !skipWebGpu) devices.push('webgpu')
    if (webnnAllowed) {
      devices.push('webnn-gpu', 'webnn-cpu')
    }
    devices.push('wasm')
    return uniqueDevices(devices)
  }

  const devices: DeviceMode[] = []
  if (webnnAllowed) devices.push('webnn-gpu')
  if (hasWebGpu() && !skipWebGpu) devices.push('webgpu')
  devices.push('wasm')
  return uniqueDevices(devices)
}

const ensureModule = async () => {
  if (moduleRef) return moduleRef
  moduleRef = await import('@mlc-ai/web-llm')
  return moduleRef
}

const ensureTransformers = async () => {
  if (transformersRef) return transformersRef
  const mod = await import('@huggingface/transformers')
  mod.env.allowLocalModels = true
  mod.env.allowRemoteModels = true
  const threads = getWasmThreadCount()
  configureOnnxWasmBackend(mod, ortWasmPath, threads)
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

const loadTransformersModel = async (
  modelId: AiModelId,
  acceleration: AccelerationPreference,
  dtypeOverride?: TransformersDtype
): Promise<boolean> => {
  const mod = await ensureTransformers()
  const modelInfo = getTransformersModel(modelId)
  const transformersSpec = modelInfo?.transformers
  if (!transformersSpec) {
    setLoadState('error')
    send({ type: 'error', error: 'Selected model is not available for Transformers.js.', loadState })
    return false
  }
  const webnnUnsupportedReason =
    modelInfo && 'webnnUnsupportedReason' in modelInfo ? modelInfo.webnnUnsupportedReason : undefined
  const webnnFreeDims = modelInfo && 'webnnFreeDims' in modelInfo ? modelInfo.webnnFreeDims : undefined
  const isOnnxCommunityModel = modelId.startsWith(onnxCommunityModelPrefix)
  const skipWebGpu = isOnnxCommunityModel ? await resolveOnnxCommunityWebGpuSkip(modelId) : false
  const forcedDevice = forcedTransformersDevices.get(modelId)
  const devices = forcedDevice
    ? [forcedDevice]
    : getTransformersDeviceCandidates(acceleration, webnnUnsupportedReason, { skipWebGpu })
  const attemptedWebnn = devices.some((device) => device.startsWith('webnn'))

  if (skipWebGpu && hasWebGpu()) {
    const fallbackDevice =
      acceleration === 'gpu' || acceleration === 'npu' || webnnUnsupportedReason ? 'wasm' : 'webnn'
    send({
      type: 'progress',
      message: 'Skipping WebGPU for this model due to buffer limits; using a fallback backend...',
      loadState: 'loading',
      runtime: 'transformers',
      deviceMode: fallbackDevice,
      modelId,
      threads: getWasmThreadCount()
    })
  }

  if (acceleration === 'npu' && webnnUnsupportedReason) {
    send({
      type: 'progress',
      message: `WebNN NPU is unavailable for this model. ${webnnUnsupportedReason} Falling back...`,
      loadState: 'loading',
      runtime: 'transformers',
      deviceMode: hasWebGpu() ? 'webgpu' : 'wasm',
      modelId,
      threads: getWasmThreadCount()
    })
  }
  let lastError: Error | null = null

  const resolveDtypeCandidates = (device: DeviceMode): Array<TransformersDtype | undefined> => {
    if (dtypeOverride) return [dtypeOverride]
    if (transformersSpec.dtype) return [transformersSpec.dtype]
    if (isOnnxCommunityModel) return ['q4f16', 'fp16', 'fp32']
    if (device.startsWith('webnn')) return ['auto']
    return [undefined]
  }

  const loadPipelineForDevice = async (device: DeviceMode) => {
    const webnnOverrides = device.startsWith('webnn')
      ? webnnFreeDims
        ? {
            freeDims: webnnFreeDims,
            sequenceLength:
              webnnFreeDims['sequence_length'] ??
              webnnFreeDims['total_sequence_length'] ??
              webnnFreeDims['past_sequence_length']
          }
        : isOnnxCommunityModel
          ? await resolveOnnxCommunityWebNnOverrides(modelId)
          : null
      : null
    if (webnnOverrides && isOnnxCommunityModel && !webnnFreeDims) {
      send({
        type: 'progress',
        message: `WebNN requires fixed shapes; using sequence length ${webnnOverrides.sequenceLength}.`,
        loadState: 'loading',
        runtime: 'transformers',
        deviceMode: device,
        modelId,
        threads: getWasmThreadCount()
      })
    }

    const dtypeCandidates = resolveDtypeCandidates(device)
    let lastError: Error | null = null

    for (const [index, dtype] of dtypeCandidates.entries()) {
      const dtypeKey = dtype ?? 'default'
      const cacheKey = `${transformersSpec.id}:${device}:${dtypeKey}`
      const cachedPipeline = pipelineCache[cacheKey]
      if (cachedPipeline) {
        pipelineRef = cachedPipeline
        const fixedLength = updateFixedInputLength(modelId, cachedPipeline)
        if (!fixedLength && webnnOverrides?.sequenceLength) {
          fixedInputLengths.set(modelId, webnnOverrides.sequenceLength)
        }
        return
      }
      const pipelineOptions: Record<string, unknown> = { device }
      if (webnnOverrides) {
        pipelineOptions.session_options = {
          freeDimensionOverrides: webnnOverrides.freeDims
        }
      }
      if (dtype) {
        pipelineOptions.dtype = dtype
      } else if (device.startsWith('webnn')) {
        pipelineOptions.dtype = 'auto'
      }
      try {
        const pipeline = (await mod.pipeline(transformersSpec.task, transformersSpec.id, pipelineOptions)) as TextGenerationPipeline
        pipelineRef = pipeline
        pipelineCache[cacheKey] = pipeline
        const fixedLength = updateFixedInputLength(modelId, pipeline)
        if (!fixedLength && webnnOverrides?.sequenceLength) {
          fixedInputLengths.set(modelId, webnnOverrides.sequenceLength)
        }
        return
      } catch (err) {
        lastError = err as Error
        const nextDtype = dtypeCandidates[index + 1]
        if (nextDtype) {
          const deviceLabel = formatDeviceLabel(device)
          send({
            type: 'progress',
            message: `${deviceLabel} (${dtypeKey}) failed; trying ${nextDtype}...`,
            loadState: 'loading',
            runtime: 'transformers',
            deviceMode: device,
            modelId,
            threads: getWasmThreadCount()
          })
        }
      }
    }

    if (lastError) {
      throw lastError
    }
  }

  for (const [index, device] of devices.entries()) {
    try {
      await loadPipelineForDevice(device)

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
      return true
    } catch (err) {
      if (shouldRetryWithCdn(err)) {
        ortWasmPath = ortCdnWasmPath
        configureOnnxWasmBackend(mod, ortWasmPath, getWasmThreadCount())
        send({
          type: 'progress',
          message: 'Local /ort/ assets missing; retrying with CDN fallback...',
          loadState: 'loading',
          runtime: 'transformers',
          deviceMode: device,
          modelId,
          threads: getWasmThreadCount()
        })
        try {
          await loadPipelineForDevice(device)
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
          return true
        } catch (retryErr) {
          lastError = retryErr as Error
          continue
        }
      }
      const nextDevice = devices[index + 1]
      if (nextDevice) {
        const nextDeviceLabel = formatDeviceLabel(nextDevice)
        const currentDeviceLabel = formatDeviceLabel(device)
        send({
          type: 'progress',
          message: `${currentDeviceLabel} failed; switching to ${nextDeviceLabel}...`,
          loadState: 'loading',
          runtime: 'transformers',
          deviceMode: nextDevice,
          modelId,
          threads: getWasmThreadCount()
        })
      }
      lastError = err as Error
    }
  }

  if (lastError) {
    console.error(lastError)
  }
  setLoadState('error')
  const errorMessage =
    acceleration === 'npu'
      ? attemptedWebnn
        ? `WebNN NPU failed: ${lastError?.message ?? 'Unable to initialize the selected device.'}`
        : webnnUnsupportedReason
          ? `WebNN NPU is not supported for this model. ${webnnUnsupportedReason} ${lastError?.message ?? ''}`.trim()
          : lastError?.message ?? 'Unable to load the fallback pipeline.'
      : lastError?.message ?? 'Unable to load the fallback pipeline.'
  send({ type: 'error', error: errorMessage, loadState })
  return false
}

const handleLoadModel = async (message: Extract<AiWorkerRequest, { type: 'load-model' }>) => {
  transformersAbortController?.abort()
  transformersAbortController = null
  lastLoadDtype = message.dtype
  resetTransformersConversationCache()
  setLoadState('loading')
  const npuDisabled = message.acceleration === 'npu' && !allowWebNnNpu
  const effectiveAcceleration: AccelerationPreference = npuDisabled ? 'gpu' : message.acceleration
  send({
    type: 'progress',
    message:
      npuDisabled
        ? 'WebNN NPU disabled; loading Transformers.js fallback...'
        : effectiveAcceleration === 'npu'
          ? 'Starting Transformers.js with WebNN...'
          : hasWebGpu()
            ? 'Starting WebLLM...'
            : 'Loading Transformers.js fallback...',
    loadState
  })

  const webLlmModelId =
    effectiveAcceleration !== 'npu' && hasWebGpu() && isWebLlmModelId(message.modelId) ? message.modelId : null
  const shouldTryWebLlm = webLlmModelId !== null
  if (webLlmModelId) {
    const webLlmLoaded = await loadWebLlmModel(webLlmModelId, effectiveAcceleration)
    if (webLlmLoaded) return
  }

  send({
    type: 'progress',
    message:
      npuDisabled
        ? 'WebNN NPU disabled; loading Transformers.js.'
        : effectiveAcceleration === 'npu'
          ? 'WebNN requested; loading Transformers.js.'
          : shouldTryWebLlm
            ? 'WebLLM failed; switching to Transformers.js.'
            : 'WebGPU unavailable; using Transformers.js.',
    loadState: 'loading',
    runtime: 'transformers',
    deviceMode: effectiveAcceleration === 'npu' ? 'webnn-npu' : hasWebGpu() ? 'webgpu' : 'wasm',
    modelId: message.modelId,
    threads: getWasmThreadCount()
  })

  const transformersLoaded = await loadTransformersModel(message.modelId, effectiveAcceleration, message.dtype)
  if (transformersLoaded) return

  if (effectiveAcceleration === 'npu' && hasWebGpu()) {
    send({
      type: 'progress',
      message: 'WebNN failed; switching to WebGPU/WebLLM...',
      loadState: 'loading',
      runtime: 'web-llm',
      deviceMode: 'webgpu',
      modelId: message.modelId
    })

    if (webLlmModelId) {
      const webLlmLoaded = await loadWebLlmModel(webLlmModelId, 'gpu')
      if (webLlmLoaded) return
    }

    await loadTransformersModel(message.modelId, 'gpu', message.dtype)
  }
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

  const tokenizer = pipelineRef.tokenizer as any
  const model = pipelineRef.model
  const fixedInputLength = loadedModelId ? fixedInputLengths.get(loadedModelId) : undefined
  const canRunFixedInput = Boolean(
    typeof fixedInputLength === 'number' && fixedInputLength > 0 && pipelineRef.model?.generate
  )
  const resolveTokenCount = (mask: any) => {
    const data = mask?.data
    if (!data) return null
    let total = 0
    for (const value of data) {
      total += typeof value === 'bigint' ? Number(value) : Number(value)
    }
    return total
  }

  if (canRunFixedInput && model && typeof fixedInputLength === 'number') {
    const fixedLength = fixedInputLength
    const addSpecialTokens = (tokenizer?.add_bos_token || tokenizer?.add_eos_token) ?? false
    tokenizer.padding_side = 'left'
    const tokenized = tokenizer([composedPrompt], {
      add_special_tokens: addSpecialTokens,
      padding: 'max_length',
      truncation: true,
      max_length: fixedLength
    })
    const promptTokenCount = resolveTokenCount(tokenized.attention_mask) ?? 0
    const maxNewTokens = Math.max(1, Math.min(200, fixedLength - promptTokenCount))
    const outputTokenIds = await model.generate({
      ...tokenized,
      max_new_tokens: maxNewTokens,
      temperature: 0.6,
      streamer,
      signal: abortController.signal
    })
    const decoded = tokenizer.batch_decode(outputTokenIds, { skip_special_tokens: true })
    const promptLengths = tokenizer
      .batch_decode(tokenized.input_ids, { skip_special_tokens: true })
      .map((text: string) => text.length)
    const generatedText = decoded[0]?.slice(promptLengths[0] ?? 0) ?? ''
    return generatedText.trim()
  }

  if (model?.generate) {
    const addSpecialTokens = (tokenizer?.add_bos_token || tokenizer?.add_eos_token) ?? false
    const tokenized = tokenizer([composedPrompt], {
      add_special_tokens: addSpecialTokens,
      truncation: false
    })
    const tokenData = resolveTokenData(tokenized.input_ids)
    let inputIds = tokenized.input_ids
    let pastKeyValues: unknown
    if (
      loadedModelId &&
      transformersConversationCache?.modelId === loadedModelId &&
      transformersConversationCache.pastKeyValues &&
      tokenData &&
      hasTokenPrefix(transformersConversationCache.tokenIds, tokenData)
    ) {
      const delta = tokenData.slice(transformersConversationCache.tokenIds.length)
      if (delta.length > 0) {
        inputIds = new mod.Tensor('int64', delta, [1, delta.length])
        pastKeyValues = transformersConversationCache.pastKeyValues
      }
    } else if (transformersConversationCache && loadedModelId === transformersConversationCache.modelId) {
      resetTransformersConversationCache()
    }

    const output = await model.generate({
      input_ids: inputIds,
      attention_mask: tokenized.attention_mask,
      past_key_values: pastKeyValues,
      max_new_tokens: 200,
      temperature: 0.6,
      streamer,
      signal: abortController.signal,
      return_dict_in_generate: true
    })

    const sequences = (output as { sequences?: any })?.sequences ?? output
    const decoded = tokenizer.batch_decode(sequences, { skip_special_tokens: true })
    const promptLengths = tokenizer
      .batch_decode(tokenized.input_ids, { skip_special_tokens: true })
      .map((text: string) => text.length)
    const generatedText = decoded[0]?.slice(promptLengths[0] ?? 0) ?? ''
    const sequenceData = resolveTokenData(sequences)
    const outputPastKeyValues = (output as { past_key_values?: Record<string, unknown> })?.past_key_values
    if (loadedModelId && sequenceData && outputPastKeyValues) {
      updateTransformersConversationCache(loadedModelId, sequenceData.slice(), outputPastKeyValues)
    }
    return generatedText.trim()
  }

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
    const modelId = loadedModelId
    const shouldFallbackToWasm =
      runtime === 'transformers' &&
      deviceMode === 'webgpu' &&
      modelId &&
      isWebGpuRuntimeFailure(err) &&
      forcedTransformersDevices.get(modelId) !== 'wasm'
    if (shouldFallbackToWasm && modelId) {
      transformersAbortController?.abort()
      transformersAbortController = null
      forcedTransformersDevices.set(modelId, 'wasm')
      setLoadState('loading')
      send({
        type: 'progress',
        message: 'WebGPU execution failed; switching to WASM fallback...',
        loadState,
        runtime: 'transformers',
        deviceMode: 'wasm',
        modelId,
        threads: getWasmThreadCount()
      })
      const fallbackReady = await loadTransformersModel(modelId, 'gpu', lastLoadDtype)
      if (fallbackReady) {
        const assistantText = await handleTransformersGeneration(message.prompt, message.transcript)
        send({ type: 'complete', content: assistantText })
      }
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
      resetTransformersConversationCache()
      send({ type: 'stopped' })
      break
  }
})
