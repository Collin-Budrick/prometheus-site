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
import type { GpuTier } from '../components/gpu/capability-probe'
import type { NpuTier } from '../components/gpu/npu-probe'
import { webLlmModelRecords } from './web-llm-records'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
export type Runtime = 'web-llm' | 'transformers'
export type DeviceMode = 'webgpu' | 'wasm' | 'webnn' | 'webnn-npu' | 'webnn-gpu' | 'webnn-cpu'

export type Role = 'user' | 'assistant'
export interface TranscriptEntry {
  role: Role
  content: string
}

export interface AiDeviceCapabilities {
  gpuTier?: GpuTier
  npuTier?: NpuTier
  adapter?: {
    maxBufferSize?: number | null
    maxStorageBufferBindingSize?: number | null
  }
  deviceMemory?: number | null
}

type TextGenerationPipeline = ((prompt: string, options?: Record<string, unknown>) => Promise<any>) & {
  tokenizer: any
  model?: { generate: (options: Record<string, unknown>) => Promise<any> }
}

type AiWorkerRequestBase = { capabilities?: AiDeviceCapabilities }

export type AiWorkerRequest =
  | (AiWorkerRequestBase & { type: 'load-model'; modelId: AiModelId; acceleration: AccelerationPreference; dtype?: TransformersDtype })
  | (AiWorkerRequestBase & { type: 'prefetch-model'; modelId: AiModelId; dtype?: TransformersDtype })
  | (AiWorkerRequestBase & { type: 'generate'; modelId: AiModelId; prompt: string; transcript: TranscriptEntry[] })
  | (AiWorkerRequestBase & { type: 'stop' })
  | (AiWorkerRequestBase & { type: 'reset' })
  | (AiWorkerRequestBase & { type: 'clear-cache' })
  | (AiWorkerRequestBase & { type: 'shutdown' })

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
      type: 'prefetch-progress'
      modelId: AiModelId
      message: string
      completed?: number
      total?: number
      runtime?: Runtime
      deviceMode?: DeviceMode
    }
  | {
      type: 'prefetch-complete'
      modelId: AiModelId
      runtime: Runtime
    }
  | {
      type: 'prefetch-error'
      modelId: AiModelId
      error: string
      runtime: Runtime
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
  | { type: 'terminated' }

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
type PipelineCacheEntry = { pipeline: TextGenerationPipeline; modelId: AiModelId }
const engineCache = new Map<WebLlmModelId, MLCEngine>()
const pipelineCache = new Map<string, PipelineCacheEntry>()
const engineCacheLimit = 2
const pipelineCacheLimit = 2
const fixedInputLengths = new Map<AiModelId, number>()
const forcedTransformersDevices = new Map<AiModelId, DeviceMode>()
const onnxTreeCache = new Map<AiModelId, Array<{ path: string; size: number }>>()
const webGpuSkipCache = new Map<AiModelId, boolean>()
const onnxConfigCache = new Map<AiModelId, { sequenceLength: number }>()
const hfTreeCache = new Map<AiModelId, Array<{ path: string; size: number }>>()
let latestCapabilities: AiDeviceCapabilities | null = null
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
const MB = 1024 * 1024
let allowWebNnNpu = false
const defaultWebGpuMaxStorageBufferBytes = 256 * MB
const minWebGpuMaxStorageBufferBytes = 128 * MB
const maxWebGpuMaxStorageBufferBytes = 512 * MB
let webGpuMaxStorageBufferBytes = defaultWebGpuMaxStorageBufferBytes
const defaultWebNnSequenceLength = 1024
const transformersCacheName = 'transformers-cache'
const webLlmCacheScopes = {
  config: 'webllm/config',
  model: 'webllm/model',
  wasm: 'webllm/wasm'
}
const fetchTimeoutMs = 15_000
const fetchRetryAttempts = 3
const fetchBackoffBaseMs = 500
const transformersConfigFiles = new Set([
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer.model',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'added_tokens.json',
  'vocab.json',
  'merges.txt',
  'preprocessor_config.json'
])

let prefetchQueue = Promise.resolve()
let prefetchQueueDepth = 0

const resolveWebGpuBufferLimit = (capabilities?: AiDeviceCapabilities | null) => {
  let limit = defaultWebGpuMaxStorageBufferBytes
  const adapterLimit =
    typeof capabilities?.adapter?.maxStorageBufferBindingSize === 'number'
      ? capabilities.adapter.maxStorageBufferBindingSize
      : capabilities?.adapter?.maxBufferSize ?? null
  if (adapterLimit && Number.isFinite(adapterLimit)) {
    limit = Math.min(limit, adapterLimit)
  }

  if (capabilities?.gpuTier === 'high') {
    limit = Math.max(limit, 384 * MB)
  } else if (capabilities?.gpuTier === 'mid') {
    limit = Math.max(limit, 320 * MB)
  } else if (capabilities?.gpuTier === 'low') {
    limit = Math.min(limit, 192 * MB)
  } else if (capabilities?.gpuTier === 'unavailable') {
    limit = Math.min(limit, 160 * MB)
  }

  if (typeof capabilities?.deviceMemory === 'number' && Number.isFinite(capabilities.deviceMemory)) {
    const memoryBytes = capabilities.deviceMemory * 1024 * 1024 * 1024
    const memoryBudget = memoryBytes * 0.35
    if (memoryBudget > 0) {
      limit = Math.min(limit, memoryBudget)
    }
  }

  return Math.max(minWebGpuMaxStorageBufferBytes, Math.min(limit, maxWebGpuMaxStorageBufferBytes))
}

const applyCapabilities = (capabilities?: AiDeviceCapabilities) => {
  if (capabilities) {
    latestCapabilities = capabilities
  }
  const active = capabilities ?? latestCapabilities ?? null
  allowWebNnNpu = Boolean(active?.npuTier && active.npuTier !== 'unavailable')
  webGpuMaxStorageBufferBytes = resolveWebGpuBufferLimit(active)
}

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
  const detected = getHardwareThreadCount()
  return Math.max(1, detected)
}
const getWasmThreadCount = () => {
  if (wasmThreadCount !== null) return wasmThreadCount
  wasmThreadCount = resolveWasmThreadCount()
  return wasmThreadCount
}
const buildWasmSessionOptions = () => ({
  graphOptimizationLevel: 'all',
  enableCpuMemArena: true,
  enableMemPattern: true,
  executionMode: getWasmThreadCount() > 1 ? 'parallel' : 'sequential'
})
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
const ensureCache = async (cacheName: string) => {
  if (typeof caches === 'undefined') {
    throw new Error('Cache API is not available in this environment.')
  }
  return caches.open(cacheName)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

type FetchWithRetryOptions = RequestInit & { timeoutMs?: number }
const fetchWithRetry = async (url: string, options: FetchWithRetryOptions = {}) => {
  if (isOffline()) {
    throw new Error('Network offline; cannot reach model repository.')
  }

  let lastError: unknown = null
  const timeoutMs = options.timeoutMs ?? fetchTimeoutMs
  for (let attempt = 1; attempt <= fetchRetryAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      if (!response.ok) {
        lastError = new Error(`Request failed (${response.status}).`)
      } else {
        return response
      }
    } catch (err) {
      lastError = err
      const isAbort = (err as DOMException)?.name === 'AbortError'
      if (attempt >= fetchRetryAttempts) {
        throw isAbort ? new Error(`Request timed out after ${timeoutMs}ms.`) : (err as Error)
      }
      const backoff = fetchBackoffBaseMs * 2 ** (attempt - 1) + Math.random() * fetchBackoffBaseMs
      await sleep(backoff)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError ?? new Error('Request failed.')
}

const cacheUrl = async (cache: Cache, url: string) => {
  const cached = await cache.match(url)
  if (cached) return
  const response = await fetchWithRetry(url)
  if (!response.ok) {
    throw new Error(`Unable to fetch ${url} (${response.status}).`)
  }
  await cache.put(url, response.clone())
}

const fetchJsonWithCache = async <T>(cache: Cache, url: string): Promise<T> => {
  const cached = await cache.match(url)
  if (cached) {
    return (await cached.json()) as T
  }
  const response = await fetchWithRetry(url)
  if (!response.ok) {
    throw new Error(`Unable to fetch ${url} (${response.status}).`)
  }
  await cache.put(url, response.clone())
  return (await response.json()) as T
}

const fetchHuggingFaceTree = async (modelId: AiModelId) => {
  const cached = hfTreeCache.get(modelId)
  if (cached) return cached
  const response = await fetchWithRetry(`https://huggingface.co/api/models/${modelId}/tree/main?recursive=1`)
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
  hfTreeCache.set(modelId, parsed)
  return parsed
}

const fetchOnnxCommunityTree = async (modelId: AiModelId) => {
  const cached = onnxTreeCache.get(modelId)
  if (cached) return cached
  const response = await fetchWithRetry(`https://huggingface.co/api/models/${modelId}/tree/main?recursive=1`)
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
    const response = await fetchWithRetry(`https://huggingface.co/${modelId}/raw/main/config.json`)
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
  } catch {
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
  } catch {
    webGpuSkipCache.set(modelId, false)
    return false
  }
}

const shouldSkipWebLlmWithCapabilities = (capabilities: AiDeviceCapabilities | null) => {
  if (!capabilities) return false
  const tier = capabilities.gpuTier
  if (tier === 'unavailable' || tier === 'low') return true
  if (webGpuMaxStorageBufferBytes <= 192 * MB) return true
  const adapterLimit =
    typeof capabilities.adapter?.maxStorageBufferBindingSize === 'number'
      ? capabilities.adapter.maxStorageBufferBindingSize
      : capabilities.adapter?.maxBufferSize ?? null
  if (adapterLimit && adapterLimit < 192 * MB) return true
  return false
}

const shouldPreferNpuFromCapabilities = (capabilities: AiDeviceCapabilities | null, webnnUnsupportedReason?: string) => {
  if (!capabilities) return false
  if (webnnUnsupportedReason) return false
  return capabilities.npuTier === 'mid' || capabilities.npuTier === 'high' || capabilities.npuTier === 'low'
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

const resolveTransformersPrefetchDtype = (modelId: AiModelId, dtypeOverride?: TransformersDtype) => {
  if (dtypeOverride) return dtypeOverride
  const modelInfo = getTransformersModel(modelId)
  const modelDtype = modelInfo?.transformers?.dtype
  if (modelDtype) return modelDtype
  if (modelId.startsWith(onnxCommunityModelPrefix)) return 'q4f16'
  return undefined
}

const isTransformersConfigFile = (path: string) => {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  return transformersConfigFiles.has(name)
}

const filterOnnxCommunityFiles = (paths: string[], dtype?: TransformersDtype) => {
  const normalized = dtype ?? ''
  const variantTags =
    normalized === 'q4f16'
      ? ['q4f16']
      : normalized === 'q4'
        ? ['q4', 'q4f16']
        : normalized === 'fp16'
          ? ['fp16']
          : normalized === 'fp32'
            ? []
            : []
  if (variantTags.length) {
    const filtered = paths.filter((path) =>
      variantTags.some((tag) => path.includes(`model_${tag}.onnx`))
    )
    if (filtered.length) return filtered
  }
  const base = paths.filter((path) => /model\.onnx(_data.*)?$/i.test(path) && !/model_[^/]+\.onnx/i.test(path))
  return base.length ? base : paths
}

const selectTransformersFiles = (modelId: AiModelId, files: Array<{ path: string }>, dtype?: TransformersDtype) => {
  const configPaths = files.filter((file) => isTransformersConfigFile(file.path)).map((file) => file.path)
  let onnxPaths = files.filter((file) => isOnnxFilePath(file.path)).map((file) => file.path)
  if (modelId.startsWith(onnxCommunityModelPrefix)) {
    onnxPaths = filterOnnxCommunityFiles(onnxPaths, dtype)
  }
  const merged = [...configPaths, ...onnxPaths]
  return Array.from(new Set(merged))
}

const buildHuggingFaceFileUrl = (modelId: AiModelId, filePath: string) =>
  `https://huggingface.co/${modelId}/resolve/main/${filePath}`

const normalizeWebLlmModelUrl = (modelUrl: string) => {
  let normalized = modelUrl.endsWith('/') ? modelUrl : `${modelUrl}/`
  if (!normalized.match(/.+\/resolve\/.+\//)) {
    normalized += 'resolve/main/'
  }
  const baseUrl = typeof location !== 'undefined' ? location.origin : ''
  if (!normalized.startsWith('http')) {
    return new URL(normalized, baseUrl).href
  }
  return new URL(normalized).href
}

const sendPrefetchProgress = (payload: {
  modelId: AiModelId
  message: string
  runtime: Runtime
  deviceMode?: DeviceMode
  completed?: number
  total?: number
}) => {
  send({
    type: 'prefetch-progress',
    modelId: payload.modelId,
    message: payload.message,
    completed: payload.completed,
    total: payload.total,
    runtime: payload.runtime,
    deviceMode: payload.deviceMode
  })
}

const enqueuePrefetch = (modelId: AiModelId, runtime: Runtime, task: () => Promise<void>) => {
  prefetchQueueDepth += 1
  const position = prefetchQueueDepth
  if (position > 1) {
    sendPrefetchProgress({
      modelId,
      runtime,
      message: `Queued (${position - 1} ahead)`
    })
  }
  const run = async () => {
    try {
      await task()
    } finally {
      prefetchQueueDepth = Math.max(0, prefetchQueueDepth - 1)
    }
  }
  prefetchQueue = prefetchQueue.then(run, run)
  return prefetchQueue
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

const disposeEngine = async (engine: MLCEngine | null | undefined) => {
  if (!engine) return
  try {
    await engine.unload()
  } catch {
    // Ignore unload failures during shutdown.
  }
}

const disposePipelineEntry = async (entry: PipelineCacheEntry | null | undefined) => {
  if (!entry) return
  const pipeline = entry.pipeline
  const pipelineDispose = (pipeline as { dispose?: () => Promise<void> | void }).dispose
  try {
    if (typeof pipelineDispose === 'function') {
      await pipelineDispose.call(pipeline)
    }
  } catch {
    // Ignore dispose failures.
  }
  const model = (pipeline as { model?: { dispose?: () => Promise<void> | void } }).model
  try {
    if (model && typeof model.dispose === 'function') {
      await model.dispose.call(model)
    }
  } catch {
    // Ignore model dispose failures.
  }
  const tokenizer = (pipeline as { tokenizer?: { dispose?: () => void } }).tokenizer
  try {
    if (tokenizer && typeof tokenizer.dispose === 'function') {
      tokenizer.dispose.call(tokenizer)
    }
  } catch {
    // Ignore tokenizer dispose failures.
  }
  if (transformersConversationCache?.modelId === entry.modelId) {
    resetTransformersConversationCache()
  }
}

const touchEngineCache = (modelId: WebLlmModelId) => {
  const cached = engineCache.get(modelId)
  if (!cached) return null
  engineCache.delete(modelId)
  engineCache.set(modelId, cached)
  return cached
}

const touchPipelineCache = (cacheKey: string) => {
  const cached = pipelineCache.get(cacheKey)
  if (!cached) return null
  pipelineCache.delete(cacheKey)
  pipelineCache.set(cacheKey, cached)
  return cached
}

const enforceEngineCacheBudget = async () => {
  while (engineCache.size > engineCacheLimit) {
    const [evictedId, evictedEngine] = engineCache.entries().next().value as [WebLlmModelId, MLCEngine]
    engineCache.delete(evictedId)
    await disposeEngine(evictedEngine)
  }
}

const enforcePipelineCacheBudget = async () => {
  while (pipelineCache.size > pipelineCacheLimit) {
    const [evictedKey, evictedEntry] = pipelineCache.entries().next().value as [string, PipelineCacheEntry]
    pipelineCache.delete(evictedKey)
    await disposePipelineEntry(evictedEntry)
  }
}

const clearAllCaches = async () => {
  const engines = Array.from(engineCache.values())
  engineCache.clear()
  await Promise.all(engines.map((engine) => disposeEngine(engine)))

  const pipelines = Array.from(pipelineCache.values())
  pipelineCache.clear()
  await Promise.all(pipelines.map((entry) => disposePipelineEntry(entry)))

  await disposeEngine(engineRef)
  engineRef = null
  await disposePipelineEntry(pipelineRef ? { pipeline: pipelineRef, modelId: loadedModelId ?? '' } : null)
  pipelineRef = null
  resetTransformersConversationCache()
  loadedModelId = null
  runtime = 'web-llm'
  deviceMode = 'webgpu'
  lastLoadDtype = undefined
  setLoadState('idle')
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

const isWebLlmDeviceLost = (err: unknown) => {
  const cause = (err as { cause?: unknown })?.cause
  const normalized = `${getErrorText(err)} ${getErrorText(cause)}`.toLowerCase()
  if (!normalized.trim()) return false
  const markers = [
    'device was lost',
    'device lost',
    'gpudevicelostinfo',
    'instance reference no longer exists',
    'poperrorscope',
    'operationerror'
  ]
  return markers.some((marker) => normalized.includes(marker))
}

const unloadWebLlmEngine = async (modelId: AiModelId | null) => {
  const engine = engineRef
  engineRef = null
  if (modelId) {
    const cached = engineCache.get(modelId as WebLlmModelId)
    if (cached === engine) {
      engineCache.delete(modelId as WebLlmModelId)
    }
  }
  await disposeEngine(engine)
}

const getTransformersDeviceCandidates = (
  acceleration: AccelerationPreference,
  webnnUnsupportedReason?: string,
  options?: { skipWebGpu?: boolean; preferNpu?: boolean }
): DeviceMode[] => {
  const webnnAllowed = !webnnUnsupportedReason
  const skipWebGpu = options?.skipWebGpu ?? false
  const preferNpu = Boolean(options?.preferNpu && webnnAllowed && allowWebNnNpu)
  const fallbackDevices: DeviceMode[] = hasWebGpu() && !skipWebGpu ? ['webgpu', 'wasm'] : ['wasm']
  const prioritizedDevices: DeviceMode[] = []

  if ((acceleration === 'npu' || preferNpu) && webnnAllowed && allowWebNnNpu) {
    prioritizedDevices.push('webnn-npu')
  }

  if (acceleration === 'npu') {
    if (webnnAllowed) {
      prioritizedDevices.push('webnn-gpu', 'webnn-cpu')
    }
    prioritizedDevices.push(...fallbackDevices)
    return uniqueDevices(prioritizedDevices)
  }

  if (acceleration === 'auto') {
    if (hasWebGpu() && !skipWebGpu) prioritizedDevices.push('webgpu')
    if (webnnAllowed) {
      prioritizedDevices.push('webnn-gpu', 'webnn-cpu')
    }
    prioritizedDevices.push('wasm')
    return uniqueDevices(prioritizedDevices)
  }

  if (webnnAllowed) prioritizedDevices.push('webnn-gpu')
  if (hasWebGpu() && !skipWebGpu) prioritizedDevices.push('webgpu')
  prioritizedDevices.push('wasm')
  return uniqueDevices(prioritizedDevices)
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

const prefetchTransformersModel = async (modelId: AiModelId, dtypeOverride?: TransformersDtype) => {
  if (modelId.startsWith('/models/')) {
    sendPrefetchProgress({
      modelId,
      runtime: 'transformers',
      message: 'Local model path detected; no remote download needed.'
    })
    return
  }
  if (isOffline()) {
    throw new Error('Offline: connect to the internet to prefetch model assets.')
  }
  const dtype = resolveTransformersPrefetchDtype(modelId, dtypeOverride)
  sendPrefetchProgress({
    modelId,
    runtime: 'transformers',
    message: 'Building download list...'
  })
  const files = modelId.startsWith(onnxCommunityModelPrefix)
    ? await fetchOnnxCommunityTree(modelId)
    : await fetchHuggingFaceTree(modelId)
  const filePaths = selectTransformersFiles(modelId, files, dtype)
  if (!filePaths.length) {
    throw new Error('No ONNX assets found to cache for this model.')
  }
  const urls = filePaths.map((filePath) => buildHuggingFaceFileUrl(modelId, filePath))
  const cache = await ensureCache(transformersCacheName)
  let completed = 0
  const total = urls.length
  for (const url of urls) {
    await cacheUrl(cache, url)
    completed += 1
    sendPrefetchProgress({
      modelId,
      runtime: 'transformers',
      completed,
      total,
      message: `Cached ${completed}/${total}: ${url.split('/').pop() ?? 'file'}`
    })
  }
}

const prefetchWebLlmModel = async (modelId: WebLlmModelId) => {
  const record = webLlmModelRecords.find((item) => item.model_id === modelId)
  if (!record) {
    throw new Error(`Missing WebLLM model record for ${modelId}.`)
  }
  if (isOffline()) {
    throw new Error('Offline: connect to the internet to prefetch model assets.')
  }
  const modelUrl = normalizeWebLlmModelUrl(record.model)
  sendPrefetchProgress({
    modelId,
    runtime: 'web-llm',
    message: 'Building download list...'
  })
  const configCache = await ensureCache(webLlmCacheScopes.config)
  const modelCache = await ensureCache(webLlmCacheScopes.model)
  const wasmCache = await ensureCache(webLlmCacheScopes.wasm)
  const configUrl = new URL('mlc-chat-config.json', modelUrl).href
  const config = await fetchJsonWithCache<{ tokenizer_files?: string[] }>(configCache, configUrl)
  const tokenizerFiles = Array.isArray(config?.tokenizer_files)
    ? config.tokenizer_files.filter((file) => typeof file === 'string' && file.length > 0)
    : []
  const tokenizerUrls = tokenizerFiles.map((file) => new URL(file, modelUrl).href)
  const tensorCacheUrl = new URL('tensor-cache.json', modelUrl).href
  const tensorCache = await fetchJsonWithCache<{ records?: Array<{ dataPath?: string }> }>(modelCache, tensorCacheUrl)
  const dataUrls = Array.isArray(tensorCache?.records)
    ? tensorCache.records
        .map((record) => (typeof record?.dataPath === 'string' ? record.dataPath : ''))
        .filter((path) => path)
        .map((path) => new URL(path, modelUrl).href)
    : []
  const shouldCacheWasm = record.model_lib?.startsWith('http') && !record.model_lib.includes('localhost')
  const tasks: Array<{ cache: Cache; url: string }> = [
    { cache: configCache, url: configUrl },
    ...tokenizerUrls.map((url) => ({ cache: modelCache, url })),
    { cache: modelCache, url: tensorCacheUrl },
    ...dataUrls.map((url) => ({ cache: modelCache, url })),
    ...(shouldCacheWasm && record.model_lib ? [{ cache: wasmCache, url: record.model_lib }] : [])
  ]
  let completed = 0
  const total = tasks.length
  for (const task of tasks) {
    await cacheUrl(task.cache, task.url)
    completed += 1
    sendPrefetchProgress({
      modelId,
      runtime: 'web-llm',
      completed,
      total,
      message: `Cached ${completed}/${total}: ${task.url.split('/').pop() ?? 'file'}`
    })
  }
}

const setLoadState = (next: LoadState) => {
  loadState = next
}

const loadWebLlmModel = async (modelId: WebLlmModelId, acceleration: AccelerationPreference) => {
  const canUseWebGpu = acceleration !== 'npu' && hasWebGpu()
  if (!canUseWebGpu) return false

  const mod = await ensureModule()

  try {
    const cachedEngine = touchEngineCache(modelId)
    if (cachedEngine) {
      cachedEngine.setInitProgressCallback((report) => send({ type: 'progress', message: formatProgress(report) }))
      engineRef = cachedEngine
    } else {
      const engine = await mod.CreateMLCEngine(modelId, {
        appConfig: { model_list: webLlmModelRecords },
        initProgressCallback: (report) => send({ type: 'progress', message: formatProgress(report) })
      })
      engineRef = engine
      engineCache.set(modelId, engine)
      await enforceEngineCacheBudget()
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
  dtypeOverride?: TransformersDtype,
  options?: { preferNpu?: boolean }
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
    : getTransformersDeviceCandidates(acceleration, webnnUnsupportedReason, {
        skipWebGpu,
        preferNpu: options?.preferNpu
      })
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
      const cachedPipeline = touchPipelineCache(cacheKey)
      if (cachedPipeline) {
        pipelineRef = cachedPipeline.pipeline
        const fixedLength = updateFixedInputLength(modelId, cachedPipeline.pipeline)
        if (!fixedLength && webnnOverrides?.sequenceLength) {
          fixedInputLengths.set(modelId, webnnOverrides.sequenceLength)
        }
        return
      }
      const pipelineOptions: Record<string, unknown> = { device }
      const sessionOptions = webnnOverrides
        ? { freeDimensionOverrides: webnnOverrides.freeDims }
        : device === 'wasm'
          ? buildWasmSessionOptions()
          : null
      if (sessionOptions) {
        pipelineOptions.session_options = sessionOptions
      }
      if (dtype) {
        pipelineOptions.dtype = dtype
      } else if (device.startsWith('webnn')) {
        pipelineOptions.dtype = 'auto'
      }
      try {
        const pipeline = (await mod.pipeline(transformersSpec.task, transformersSpec.id, pipelineOptions)) as TextGenerationPipeline
        pipelineRef = pipeline
        pipelineCache.set(cacheKey, { pipeline, modelId })
        await enforcePipelineCacheBudget()
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
  applyCapabilities(message.capabilities)
  transformersAbortController?.abort()
  transformersAbortController = null
  lastLoadDtype = message.dtype
  resetTransformersConversationCache()
  setLoadState('loading')
  const modelInfo = getTransformersModel(message.modelId)
  const webnnUnsupportedReason = modelInfo?.webnnUnsupportedReason
  const preferNpu = shouldPreferNpuFromCapabilities(latestCapabilities, webnnUnsupportedReason)
  const requestedAcceleration: AccelerationPreference =
    preferNpu && message.acceleration !== 'npu' ? 'npu' : message.acceleration
  const npuDisabled = requestedAcceleration === 'npu' && !allowWebNnNpu
  const effectiveAcceleration: AccelerationPreference = npuDisabled ? 'gpu' : requestedAcceleration
  const skipWebLlm = shouldSkipWebLlmWithCapabilities(latestCapabilities)
  send({
    type: 'progress',
    message:
      npuDisabled
        ? 'WebNN NPU disabled; loading Transformers.js fallback...'
        : effectiveAcceleration === 'npu'
          ? 'Starting Transformers.js with WebNN...'
          : preferNpu
            ? 'Detected NPU tier; preferring WebNN before WebGPU...'
            : hasWebGpu() && !skipWebLlm
              ? 'Starting WebLLM...'
              : 'Loading Transformers.js fallback...',
    loadState
  })

  const webLlmModelId =
    effectiveAcceleration !== 'npu' && hasWebGpu() && !skipWebLlm && isWebLlmModelId(message.modelId)
      ? message.modelId
      : null
  const shouldTryWebLlm = webLlmModelId !== null
  if (!shouldTryWebLlm && skipWebLlm && isWebLlmModelId(message.modelId) && hasWebGpu()) {
    send({
      type: 'progress',
      message: 'WebGPU buffer budget looks low; skipping WebLLM and preferring Transformers.js.',
      loadState: 'loading',
      runtime: 'transformers',
      deviceMode: effectiveAcceleration === 'npu' ? 'webnn-npu' : hasWebGpu() ? 'webgpu' : 'wasm',
      modelId: message.modelId,
      threads: getWasmThreadCount()
    })
  }
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

  const transformersLoaded = await loadTransformersModel(message.modelId, effectiveAcceleration, message.dtype, {
    preferNpu
  })
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

    await loadTransformersModel(message.modelId, 'gpu', message.dtype, { preferNpu: false })
  }
}

const handlePrefetchModel = (message: Extract<AiWorkerRequest, { type: 'prefetch-model' }>) => {
  applyCapabilities(message.capabilities)
  const modelId = message.modelId
  const runtime: Runtime = isWebLlmModelId(modelId) ? 'web-llm' : 'transformers'
  const task = async () => {
    try {
      if (runtime === 'web-llm') {
        await prefetchWebLlmModel(modelId as WebLlmModelId)
      } else {
        await prefetchTransformersModel(modelId, message.dtype)
      }
      send({ type: 'prefetch-complete', modelId, runtime })
    } catch (err) {
      console.error(err)
      send({
        type: 'prefetch-error',
        modelId,
        runtime,
        error: getErrorText(err) || 'Unable to prefetch model assets.'
      })
    }
  }
  enqueuePrefetch(modelId, runtime, task)
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
    if (runtime === 'web-llm' && isWebLlmDeviceLost(err)) {
      await unloadWebLlmEngine(modelId)
      resetTransformersConversationCache()
      setLoadState('loading')
      send({
        type: 'progress',
        message: 'WebGPU device lost; switching to Transformers.js fallback...',
        loadState,
        runtime: 'transformers',
        deviceMode: 'wasm',
        modelId: modelId ?? undefined,
        threads: getWasmThreadCount()
      })
      if (modelId) {
        await loadTransformersModel(modelId, 'gpu', lastLoadDtype)
      }
      send({
        type: 'error',
        error: 'WebLLM lost the GPU device. A fallback backend is ready; please retry your prompt.'
      })
      return
    }
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

ctx.addEventListener('close', () => {
  void clearAllCaches()
})

ctx.addEventListener('message', (event: MessageEvent<AiWorkerRequest>) => {
  const data = event.data
  if (!data) return

  switch (data.type) {
    case 'load-model':
      handleLoadModel(data)
      break
    case 'prefetch-model':
      handlePrefetchModel(data)
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
    case 'clear-cache':
      transformersAbortController?.abort()
      transformersAbortController = null
      void clearAllCaches()
      break
    case 'shutdown':
      transformersAbortController?.abort()
      transformersAbortController = null
      void (async () => {
        await clearAllCaches()
        send({ type: 'terminated' })
        ctx.close()
      })()
      break
  }
})
