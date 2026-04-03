/// <reference lib="webworker" />

import { encodeFragmentKnownVersions } from '@core/fragment/known-versions'
import { isFragmentHeartbeatFrame, parseFragmentFrames } from '@core/fragment/frames'
import {
  buildFragmentDecompressionReader,
  decompressFragmentBytesWithNativeStream,
  getFragmentResponseEncoding,
  getSupportedNativeFragmentDecompressionEncodings,
  type FragmentCompressionEncoding
} from '@core/fragment/compression'
import { canDecompressZstd, decompressZstd } from './zstd-runtime'
import {
  getFragmentHeightViewport,
  resolveFragmentHeightWidthBucket,
  resolveReservedFragmentHeight
} from '@prometheus/ui/fragment-height'
import {
  canReadWorkerStreamEncoding,
  shouldAdvertiseZstdForWorkerLiveStream,
  shouldUseCompressedWorkerBootStream
} from './worker-compression'
import type { FragmentPayload } from '../types'
import type {
  FragmentRuntimeCommitMessage,
  FragmentRuntimeErrorMessage,
  FragmentRuntimeInitMessage,
  FragmentRuntimeKnownVersions,
  FragmentRuntimePageMessage,
  FragmentRuntimePlanEntry,
  FragmentRuntimePriority,
  FragmentRuntimeSizingMap,
  FragmentRuntimeStatus,
  FragmentRuntimeStatusMessage,
  FragmentRuntimeBootstrapPrimedMessage,
  FragmentRuntimeWorkerMessage
} from './protocol'
import { decodeBootstrapFramesSerially } from './bootstrap-decode'
import { decodeRuntimeFragmentPayload } from './decode-payload'
import {
  buildLearnedHeightKey,
  buildPayloadCacheKey,
  buildPayloadVersion,
  createPersistentRuntimeCache
} from './persistent-cache'

const GRIDSTACK_CELL_HEIGHT = 8
const GRIDSTACK_MARGIN = 12
const MAX_NETWORK_CONCURRENCY = 4
const MAX_DECODE_WORKERS = 4
const INITIAL_DECODE_WORKERS = 1
const FRAME_HEADER_SIZE = 8
const idDecoder = new TextDecoder()

type DecodePoolRequest = {
  id: number
  fragmentId: string
  bytes: ArrayBuffer
}

type DecodePoolSuccess = {
  id: number
  ok: true
  payload: FragmentPayload
}

type DecodePoolFailure = {
  id: number
  ok: false
  error: string
}

type DecodePoolResponse = DecodePoolSuccess | DecodePoolFailure

type ClientState = {
  id: string
  apiBase: string
  path: string
  lang: string
  viewportWidth: number
  enableStreaming: boolean
  startupMode: NonNullable<FragmentRuntimeInitMessage['startupMode']>
  bootstrapHref: string | null
  paused: boolean
  planOrder: string[]
  entriesById: Map<string, FragmentRuntimePlanEntry>
  fetchGroups: string[][]
  visibleIds: Set<string>
  committedVersions: Map<string, string>
  knownVersions: Map<string, number>
  sizingSeeds: FragmentRuntimeSizingMap
  widthById: Map<string, number>
  lastSizingKeyById: Map<string, string>
  lastStatus: FragmentRuntimeStatus | null
  firstWorkerCommitSent: boolean
  stream: {
    key: string
    controller: AbortController
    pendingTasks: Set<Promise<void>>
  } | null
}

type ScheduledFetchJobBase = {
  key: string
  owner: string
  apiBase: string
  path: string
  lang: string
  refresh: boolean
  priority: number
  subscribers: Set<string>
  order: number
  skipClaimWait: boolean
  controller?: AbortController
}

type FragmentFetchJob = ScheduledFetchJobBase & {
  kind: 'fragment'
  payloadKey: string
  fragmentId: string
}

type BootstrapGroupFetchJob = ScheduledFetchJobBase & {
  kind: 'bootstrap-group'
  fragmentIds: string[]
  requestedIdsByClient: Map<string, Set<string>>
  href: string | null
}

type ScheduledFetchJob = FragmentFetchJob | BootstrapGroupFetchJob

const FETCH_CLAIM_WAIT_MS = 120
const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope
const clients = new Map<string, ClientState>()
const persistentCache = createPersistentRuntimeCache()
const payloadCache = persistentCache.payloads
const learnedHeights = persistentCache.learnedHeights
const activeFetchJobs = new Map<string, ScheduledFetchJob>()
const scheduledFetchJobs: ScheduledFetchJob[] = []
const primedBootstrapPayloads = new Map<string, Promise<FragmentPayload[]>>()
let jobOrder = 0
let warnedAboutNestedDecodeWorkerFallback = false
let configuredDecodeWorkerHref: string | null = null

const canSpawnNestedDecodeWorkers = () => typeof Worker === 'function'

class DecodePool {
  private readonly maxSize: number
  private readonly workerHref: string | null
  private workers: Array<{ worker: Worker; busy: boolean }> = []
  private pending = new Map<
    number,
    {
      workerIndex: number
      resolve: (payload: FragmentPayload) => void
      reject: (error: Error) => void
    }
  >()
  private queue: Array<{
    requestId: number
    fragmentId: string
    bytes: ArrayBuffer
    resolve: (payload: FragmentPayload) => void
    reject: (error: Error) => void
  }> = []
  private nextRequestId = 1

  constructor(size: number, workerHref?: string | null) {
    this.maxSize = Math.max(INITIAL_DECODE_WORKERS, size)
    this.workerHref = workerHref ?? null

    if (!canSpawnNestedDecodeWorkers()) {
      return
    }

    this.ensureWorkerCapacity(INITIAL_DECODE_WORKERS)
  }

  decode(fragmentId: string, bytes: Uint8Array) {
    if (!this.workers.length) {
      return Promise.resolve().then(() => decodeRuntimeFragmentPayload(fragmentId, bytes))
    }

    return new Promise<FragmentPayload>((resolve, reject) => {
      const requestId = this.nextRequestId
      this.nextRequestId += 1
      this.queue.push({
        requestId,
        fragmentId,
        bytes: bytes.slice().buffer,
        resolve,
        reject
      })
      this.ensureWorkerCapacity(this.workers.filter((entry) => entry.busy).length + this.queue.length)
      this.pump()
    })
  }

  terminate() {
    this.workers.forEach(({ worker }) => {
      worker.terminate()
    })
    this.workers = []
    this.pending.clear()
    this.queue = []
  }

  private spawnWorker(index: number) {
    let worker: Worker
    try {
      worker = this.workerHref
        ? new Worker(this.workerHref, NESTED_DECODE_WORKER_OPTIONS)
        : new Worker(new URL('./decode-pool.worker.js', import.meta.url), NESTED_DECODE_WORKER_OPTIONS)
    } catch (error) {
      this.terminate()
      if (!warnedAboutNestedDecodeWorkerFallback) {
        warnedAboutNestedDecodeWorkerFallback = true
        console.warn('Nested fragment decode workers unavailable, falling back to in-worker decode.', error)
      }
      return false
    }

    const workerState = { worker, busy: false }
    worker.addEventListener('message', (event: MessageEvent<DecodePoolResponse>) => {
      const message = event.data
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      this.workers[pending.workerIndex].busy = false
      if (message.ok) {
        pending.resolve(message.payload)
      } else {
        pending.reject(new Error(message.error))
      }
      this.pump()
    })
    worker.addEventListener('error', (event) => {
      const error = event.error instanceof Error ? event.error : new Error('Fragment decode worker failed')
      const affected = Array.from(this.pending.entries()).filter(([, value]) => value.workerIndex === index)
      affected.forEach(([requestId, pending]) => {
        this.pending.delete(requestId)
        pending.reject(error)
      })
      workerState.busy = false
      this.pump()
    })
    this.workers.push(workerState)
    return true
  }

  private ensureWorkerCapacity(targetSize: number) {
    if (!canSpawnNestedDecodeWorkers()) {
      return
    }

    const desiredSize = Math.max(INITIAL_DECODE_WORKERS, Math.min(this.maxSize, targetSize))
    while (this.workers.length < desiredSize) {
      const nextIndex = this.workers.length
      if (!this.spawnWorker(nextIndex)) {
        return
      }
    }
  }

  private pump() {
    this.ensureWorkerCapacity(this.workers.filter((entry) => entry.busy).length + this.queue.length)
    const idleIndex = this.workers.findIndex((entry) => !entry.busy)
    if (idleIndex < 0) return
    const next = this.queue.shift()
    if (!next) return
    this.workers[idleIndex].busy = true
    this.pending.set(next.requestId, {
      workerIndex: idleIndex,
      resolve: next.resolve,
      reject: next.reject
    })
    const request: DecodePoolRequest = {
      id: next.requestId,
      fragmentId: next.fragmentId,
      bytes: next.bytes
    }
    this.workers[idleIndex].worker.postMessage(request, [next.bytes])
    this.pump()
  }
}

class FragmentFrameBuffer {
  private buffer = new Uint8Array(0)
  private length = 0

  append(chunk: Uint8Array) {
    const required = this.length + chunk.byteLength
    if (required > this.buffer.byteLength) {
      let nextSize = Math.max(required, this.buffer.byteLength || 1024)
      while (nextSize < required) {
        nextSize *= 2
      }
      const next = new Uint8Array(nextSize)
      if (this.length) {
        next.set(this.buffer.subarray(0, this.length), 0)
      }
      this.buffer = next
    }
    this.buffer.set(chunk, this.length)
    this.length += chunk.byteLength
  }

  drainFrames() {
    const frames: Array<{ id: string; payloadBytes: Uint8Array }> = []
    let offset = 0

    while (this.length - offset >= FRAME_HEADER_SIZE) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + offset, FRAME_HEADER_SIZE)
      const idLength = view.getUint32(0, true)
      const payloadLength = view.getUint32(4, true)
      const frameSize = FRAME_HEADER_SIZE + idLength + payloadLength
      if (this.length - offset < frameSize) {
        break
      }

      const idBytes = this.buffer.slice(offset + FRAME_HEADER_SIZE, offset + FRAME_HEADER_SIZE + idLength)
      const payloadBytes = this.buffer.slice(offset + FRAME_HEADER_SIZE + idLength, offset + frameSize)
      frames.push({
        id: idDecoder.decode(idBytes),
        payloadBytes
      })
      offset += frameSize
    }

    if (offset > 0) {
      this.buffer.copyWithin(0, offset, this.length)
      this.length -= offset
    }

    return frames
  }
}

const resolveDecodePoolMaxSize = () => {
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 2
  return Math.max(1, Math.min(MAX_DECODE_WORKERS, Math.floor(hardwareConcurrency / 2) || 1))
}

const NESTED_DECODE_WORKER_OPTIONS: WorkerOptions = {
  name: 'fragment-decode'
}

let decodePool: DecodePool | null = null

const getDecodePool = () => {
  decodePool ??= new DecodePool(resolveDecodePoolMaxSize(), configuredDecodeWorkerHref)
  return decodePool
}

const buildFetchKey = (apiBase: string, path: string, lang: string, fragmentId: string, refresh: boolean) =>
  `${apiBase}::${path}::${lang}::${fragmentId}::${refresh ? 'refresh' : 'cached'}`

const buildBootstrapGroupJobKey = (apiBase: string, path: string, lang: string, fragmentIds: string[]) =>
  `${apiBase}::${path}::${lang}::bootstrap::${[...fragmentIds].sort().join('|')}`

const buildBootstrapPayloadKey = (path: string, lang: string, fragmentIds: string[]) =>
  `${path}::${lang}::bootstrap::${[...fragmentIds].sort().join('|')}`

const decodeBootstrapPayloads = async (bytes: Uint8Array) => {
  const frames = parseFragmentFrames(bytes).filter((frame) => !isFragmentHeartbeatFrame(frame))
  return await decodeBootstrapFramesSerially(frames, (fragmentId, payloadBytes) =>
    decodeRuntimeFragmentPayload(fragmentId, payloadBytes)
  )
}

let supportedWorkerPayloadEncodingsPromise: Promise<FragmentCompressionEncoding[]> | null = null

const getSupportedWorkerPayloadEncodings = async () => {
  if (!supportedWorkerPayloadEncodingsPromise) {
    supportedWorkerPayloadEncodingsPromise = (async () => {
      const supported: FragmentCompressionEncoding[] = [...getSupportedNativeFragmentDecompressionEncodings()]
      if (await canDecompressZstd()) {
        supported.push('zstd')
      }
      return supported
    })()
  }
  return await supportedWorkerPayloadEncodingsPromise
}

const buildWorkerFragmentHeaders = async ({
  includeZstd
}: {
  includeZstd: boolean
}) => {
  const acceptedEncodings = includeZstd
    ? await getSupportedWorkerPayloadEncodings()
    : getSupportedNativeFragmentDecompressionEncodings()
  if (!acceptedEncodings.length) {
    return {
      acceptedEncodings,
      headers: undefined
    }
  }
  return {
    acceptedEncodings,
    headers: {
      'x-fragment-accept-encoding': acceptedEncodings.join(',')
    }
  }
}

type WorkerFragmentFetchOptions = {
  url: string
  signal: AbortSignal
  cache?: RequestCache
  includeZstd: boolean
  label: string
}

type WorkerFragmentFetchAttempt = {
  acceptedEncodings: FragmentCompressionEncoding[]
  encoding: FragmentCompressionEncoding | null
  response: Response
}

const fetchWorkerFragmentResponse = async ({
  url,
  signal,
  cache,
  includeZstd,
  label
}: WorkerFragmentFetchOptions) => {
  const runFetch = async (headers?: HeadersInit): Promise<WorkerFragmentFetchAttempt> => {
    const acceptedEncodings = headers
      ? includeZstd
        ? await getSupportedWorkerPayloadEncodings()
        : getSupportedNativeFragmentDecompressionEncodings()
      : getSupportedNativeFragmentDecompressionEncodings()
    const response = await fetch(url, {
      cache,
      signal,
      headers
    })
    if (!response.ok) {
      throw new Error(`${label} failed: ${response.status}`)
    }
    return {
      acceptedEncodings,
      encoding: getFragmentResponseEncoding(response.headers),
      response
    }
  }

  const { headers } = await buildWorkerFragmentHeaders({ includeZstd })
  const initialAttempt = await runFetch(headers)

  return {
    ...initialAttempt,
    retryWithoutCompression: async () => await runFetch(undefined)
  }
}

const decompressWorkerFragmentBytes = async (
  bytes: Uint8Array,
  encoding: FragmentCompressionEncoding | null,
  acceptedEncodings: FragmentCompressionEncoding[]
) => {
  if (!encoding) return bytes
  if (!acceptedEncodings.includes(encoding)) {
    throw new Error(`Fragment response encoding '${encoding}' is not supported by the worker runtime`)
  }
  if (encoding === 'zstd') {
    const decoded = await decompressZstd(bytes)
    if (decoded) {
      return decoded
    }
    throw new Error('Fragment response zstd decompression failed')
  }
  const decoded = await decompressFragmentBytesWithNativeStream(bytes, encoding)
  if (decoded) {
    return decoded
  }
  throw new Error(`Fragment response ${encoding} decompression failed`)
}

const readWorkerFragmentResponseBytes = async (
  attempt: WorkerFragmentFetchAttempt,
  retryWithoutCompression: () => Promise<WorkerFragmentFetchAttempt>
) => {
  try {
    return await decompressWorkerFragmentBytes(
      new Uint8Array(await attempt.response.arrayBuffer()),
      attempt.encoding,
      attempt.acceptedEncodings
    )
  } catch (error) {
    if (!attempt.encoding) {
      throw error
    }
    const fallback = await retryWithoutCompression()
    return await decompressWorkerFragmentBytes(
      new Uint8Array(await fallback.response.arrayBuffer()),
      fallback.encoding,
      fallback.acceptedEncodings
    )
  }
}

const parseBootstrapHrefSelection = (href: string | null | undefined) => {
  if (!href) return null
  try {
    const url = new URL(href, workerScope.location.origin)
    const ids = Array.from(
      new Set(
        (url.searchParams.get('ids') ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    )
    return {
      href: url.toString(),
      ids,
      lang: url.searchParams.get('lang') ?? ''
    }
  } catch {
    return null
  }
}

const buildBootstrapPromiseKeys = (
  client: Pick<ClientState, 'path' | 'lang'>,
  fragmentIds: string[],
  href?: string | null
) => {
  const normalizedIds = [...fragmentIds].sort()
  const keys = [buildBootstrapPayloadKey(client.path, client.lang, normalizedIds)]
  const parsedHref = parseBootstrapHrefSelection(href)
  if (parsedHref && normalizedIds.every((fragmentId) => parsedHref.ids.includes(fragmentId))) {
    keys.unshift(parsedHref.href)
  }
  return keys
}

const readPrimedBootstrapPayloads = (
  client: Pick<ClientState, 'path' | 'lang' | 'bootstrapHref'>,
  fragmentIds: string[]
) => {
  const keys = buildBootstrapPromiseKeys(client, fragmentIds, client.bootstrapHref)
  for (const key of keys) {
    const pending = primedBootstrapPayloads.get(key)
    if (pending) {
      return pending
    }
  }
  return null
}

void persistentCache.hydrate().catch(() => undefined)

const normalizeApiBase = (apiBase: string) => {
  if (!apiBase) return ''
  return new URL(apiBase, workerScope.location.origin).toString().replace(/\/+$/, '')
}

const getClient = (clientId: string) => clients.get(clientId) ?? null

const postToClient = (client: ClientState, message: FragmentRuntimeWorkerMessage) => {
  workerScope.postMessage(message)
}

const setClientStatus = (client: ClientState, nextStatus: FragmentRuntimeStatus) => {
  if (client.lastStatus === nextStatus) return
  client.lastStatus = nextStatus
  const message: FragmentRuntimeStatusMessage = {
    type: 'status',
    clientId: client.id,
    status: nextStatus
  }
  postToClient(client, message)
}

const refreshClientStatus = (client: ClientState) => {
  if (client.stream) {
    setClientStatus(client, 'streaming')
    return
  }
  const hasActiveFetch = Array.from(activeFetchJobs.values()).some((job) => job.subscribers.has(client.id))
  setClientStatus(client, hasActiveFetch ? 'fetching' : 'idle')
}

const resolveCardWidthFromBucket = (widthBucket: string | null | undefined) => {
  if (!widthBucket) {
    return null
  }
  const separatorIndex = widthBucket.indexOf(':')
  if (separatorIndex < 0) {
    return null
  }
  const parsed = Number.parseInt(widthBucket.slice(separatorIndex + 1), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const buildClientSizing = (client: ClientState, fragmentId: string) => {
  const entry = client.entriesById.get(fragmentId)
  if (!entry) return null

  const seed = client.sizingSeeds[fragmentId]
  const cardWidth = client.widthById.get(fragmentId) ?? seed?.cardWidth ?? null
  const viewport = getFragmentHeightViewport(cardWidth ?? client.viewportWidth)
  const seedWidthBucket = seed?.widthBucket ?? null
  const widthBucket =
    resolveFragmentHeightWidthBucket({
      layout: entry.layout,
      viewport,
      cardWidth
    }) ??
    seedWidthBucket
  const sizingCardWidth = cardWidth ?? resolveCardWidthFromBucket(widthBucket)
  const learnedHeight = learnedHeights.get(buildLearnedHeightKey(client.path, client.lang, fragmentId, widthBucket))?.height ?? null
  const reservedHeight = resolveReservedFragmentHeight({
    layout: entry.layout,
    viewport,
    cardWidth: sizingCardWidth,
    cookieHeight: seed?.cookieHeight ?? null,
    stableHeight: learnedHeight ?? seed?.stableHeight ?? null
  })
  const gridRows = Math.max(1, Math.ceil((reservedHeight + GRIDSTACK_MARGIN * 2) / GRIDSTACK_CELL_HEIGHT))

  return {
    fragmentId,
    reservedHeight,
    widthBucket,
    gridRows
  }
}

const maybePublishSizing = (client: ClientState, fragmentId: string) => {
  const sizing = buildClientSizing(client, fragmentId)
  if (!sizing) return
  const nextSizingKey = `${sizing.reservedHeight}:${sizing.widthBucket ?? ''}:${sizing.gridRows}`
  if (client.lastSizingKeyById.get(fragmentId) === nextSizingKey) {
    return
  }
  client.lastSizingKeyById.set(fragmentId, nextSizingKey)
  postToClient(client, {
    type: 'card-sizing',
    clientId: client.id,
    sizing
  })
}

const publishSizingSnapshot = (client: ClientState, fragmentIds = client.planOrder) => {
  fragmentIds.forEach((fragmentId) => {
    maybePublishSizing(client, fragmentId)
  })
}

const seedPayloadCache = (payloads: FragmentPayload[], path: string, lang: string) => {
  if (!payloads.length) return
  payloads.forEach((payload) => {
    payloadCache.set(buildPayloadCacheKey(path, lang, payload.id), {
      payload,
      version: buildPayloadVersion(payload)
    })
  })
  void persistentCache.seedPayloads(path, lang, payloads)
}

const seedKnownVersions = (client: ClientState, knownVersions?: FragmentRuntimeKnownVersions) => {
  client.knownVersions.clear()
  Object.entries(knownVersions ?? {}).forEach(([fragmentId, cacheUpdatedAt]) => {
    if (Number.isFinite(cacheUpdatedAt)) {
      client.knownVersions.set(fragmentId, cacheUpdatedAt)
    }
  })
}

const expandDependencies = (client: ClientState, ids: string[]) => {
  const required = new Set<string>()
  const stack = [...ids]

  while (stack.length) {
    const fragmentId = stack.pop()
    if (!fragmentId || required.has(fragmentId)) continue
    const entry = client.entriesById.get(fragmentId)
    if (!entry) continue
    required.add(fragmentId)
    ;(entry.dependsOn ?? []).forEach((dependencyId) => {
      if (!required.has(dependencyId)) {
        stack.push(dependencyId)
      }
    })
  }

  return client.planOrder.filter((fragmentId) => required.has(fragmentId))
}

const partitionMatchingFetchGroups = (client: ClientState, ids: string[]) => {
  if (!ids.length || !client.fetchGroups.length) {
    return {
      groups: [] as Array<{ fragmentIds: string[]; requestedIds: string[] }>,
      leftovers: ids
    }
  }

  const remaining = new Set(ids)
  const groups: Array<{ fragmentIds: string[]; requestedIds: string[] }> = []

  client.fetchGroups.forEach((group) => {
    const fragmentIds = group.filter((fragmentId) => client.entriesById.has(fragmentId))
    if (!fragmentIds.length) return
    const requestedIds = fragmentIds.filter((fragmentId) => remaining.has(fragmentId))
    if (!requestedIds.length) return
    groups.push({
      fragmentIds,
      requestedIds
    })
    requestedIds.forEach((fragmentId) => remaining.delete(fragmentId))
  })

  return {
    groups,
    leftovers: ids.filter((fragmentId) => remaining.has(fragmentId))
  }
}

const priorityToValue = (priority: FragmentRuntimePriority, critical: boolean) => {
  if (critical) return 200
  switch (priority) {
    case 'refresh':
      return 150
    case 'visible':
      return 100
    default:
      return 50
  }
}

const commitPayloadToClient = (
  client: ClientState,
  payload: FragmentPayload,
  priority: FragmentRuntimePriority,
  source: FragmentRuntimeCommitMessage['source']
) => {
  const sizing = buildClientSizing(client, payload.id)
  if (!sizing) return
  const version = buildPayloadVersion(payload)
  if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
    client.knownVersions.set(payload.id, payload.cacheUpdatedAt)
  }
  if (client.committedVersions.get(payload.id) === version) {
    maybePublishSizing(client, payload.id)
    return
  }

  client.committedVersions.set(payload.id, version)
  client.firstWorkerCommitSent = true
  postToClient(client, {
    type: 'fragment-commit',
    clientId: client.id,
    payload,
    sizing,
    priority,
    source
  })
}

const notifyError = (clientIds: Iterable<string>, message: string, fragmentIds?: string[]) => {
  for (const clientId of clientIds) {
    const client = clients.get(clientId)
    if (!client) continue
    const errorMessage: FragmentRuntimeErrorMessage = {
      type: 'error',
      clientId,
      message,
      fragmentIds
    }
    postToClient(client, errorMessage)
    setClientStatus(client, 'idle')
  }
}

const fetchFragmentPayload = async (
  apiBase: string,
  fragmentId: string,
  lang: string,
  refresh: boolean,
  signal: AbortSignal
) => {
  const params = new URLSearchParams({
    id: fragmentId,
    protocol: '2'
  })
  if (lang) {
    params.set('lang', lang)
  }
  if (refresh) {
    params.set('refresh', '1')
  }

  const attempt = await fetchWorkerFragmentResponse({
    url: `${normalizeApiBase(apiBase)}/fragments?${params.toString()}`,
    cache: refresh ? 'no-store' : 'default',
    signal,
    includeZstd: true,
    label: 'Fragment fetch'
  })
  const bytes = await readWorkerFragmentResponseBytes(attempt, attempt.retryWithoutCompression)
  const payload = await getDecodePool().decode(fragmentId, bytes)
  const cacheUpdatedAtRaw = attempt.response.headers.get('x-fragment-cache-updated')
  const cacheUpdatedAt = cacheUpdatedAtRaw ? Number(cacheUpdatedAtRaw) : Number.NaN
  return {
    ...payload,
    cacheUpdatedAt: Number.isFinite(cacheUpdatedAt) ? cacheUpdatedAt : payload.cacheUpdatedAt
  }
}

const fetchBootstrapPayloadGroup = async (
  apiBase: string,
  fragmentIds: string[],
  lang: string,
  signal: AbortSignal
) => {
  const params = new URLSearchParams({
    protocol: '2',
    ids: [...fragmentIds].join(',')
  })
  if (lang) {
    params.set('lang', lang)
  }

  const attempt = await fetchWorkerFragmentResponse({
    url: `${normalizeApiBase(apiBase)}/fragments/bootstrap?${params.toString()}`,
    cache: 'default',
    signal,
    includeZstd: true,
    label: 'Fragment bootstrap fetch'
  })
  const bytes = await readWorkerFragmentResponseBytes(attempt, attempt.retryWithoutCompression)
  return decodeBootstrapPayloads(bytes)
}

const removeClientFromJobs = (clientId: string) => {
  for (let index = scheduledFetchJobs.length - 1; index >= 0; index -= 1) {
    const job = scheduledFetchJobs[index]
    job.subscribers.delete(clientId)
    if (!job.subscribers.size) {
      scheduledFetchJobs.splice(index, 1)
    }
  }

  activeFetchJobs.forEach((job, key) => {
    job.subscribers.delete(clientId)
    if (!job.subscribers.size) {
      job.controller?.abort()
      activeFetchJobs.delete(key)
    }
  })
}

const stopClientStream = (client: ClientState) => {
  if (!client.stream) return
  client.stream.controller.abort()
  client.stream = null
  refreshClientStatus(client)
}

const commitFragmentJobPayloadToSubscribers = (
  job: FragmentFetchJob,
  payload: FragmentPayload,
  source: 'cache' | 'network'
) => {
  job.subscribers.forEach((clientId) => {
    const client = clients.get(clientId)
    if (!client || client.lang !== job.lang) return
    commitPayloadToClient(client, payload, job.priority >= 200 ? 'critical' : job.refresh ? 'refresh' : 'visible', source)
  })
}

const commitBootstrapJobPayloadsToSubscribers = (
  job: BootstrapGroupFetchJob,
  payloads: FragmentPayload[],
  source: 'cache' | 'network'
) => {
  const payloadsById = new Map(payloads.map((payload) => [payload.id, payload]))
  job.subscribers.forEach((clientId) => {
    const client = clients.get(clientId)
    if (!client || client.lang !== job.lang) return
    const requestedIds = job.requestedIdsByClient.get(clientId)
    if (!requestedIds?.size) return
    client.planOrder.forEach((fragmentId) => {
      if (!requestedIds.has(fragmentId)) return
      const payload = payloadsById.get(fragmentId)
      if (!payload) return
      commitPayloadToClient(
        client,
        payload,
        client.entriesById.get(fragmentId)?.critical ? 'critical' : 'visible',
        source
      )
    })
  })
}

const readReusableCachedPayload = (client: ClientState, fragmentId: string) => {
  const payloadKey = buildPayloadCacheKey(client.path, client.lang, fragmentId)
  const cached = payloadCache.get(payloadKey)
  if (!cached) {
    return null
  }

  const knownVersion =
    client.knownVersions.get(fragmentId) ?? client.entriesById.get(fragmentId)?.cacheUpdatedAt ?? null
  if (
    typeof knownVersion === 'number' &&
    Number.isFinite(knownVersion) &&
    cached.payload.cacheUpdatedAt !== knownVersion
  ) {
    void persistentCache.invalidatePayload(client.path, client.lang, fragmentId, cached.version)
    payloadCache.delete(payloadKey)
    return null
  }

  return cached
}

const seedFetchedPayloads = (path: string, lang: string, payloads: FragmentPayload[]) => {
  if (!payloads.length) return
  payloads.forEach((payload) => {
    const payloadKey = buildPayloadCacheKey(path, lang, payload.id)
    const previousVersion = payloadCache.get(payloadKey)?.version
    if (previousVersion && previousVersion !== buildPayloadVersion(payload)) {
      void persistentCache.invalidatePayload(path, lang, payload.id, previousVersion)
    }
    payloadCache.set(payloadKey, {
      payload,
      version: buildPayloadVersion(payload),
      savedAt: Date.now()
    })
  })
  void persistentCache.seedPayloads(path, lang, payloads)
}

const shouldUseStartupFastPath = (client: ClientState, priority: FragmentRuntimePriority) =>
  priority === 'critical' || (priority === 'visible' && !client.firstWorkerCommitSent)

const canUseClaimWaitBypass = (job: ScheduledFetchJob) => job.skipClaimWait && !persistentCache.isHydrated()

const readBootstrapJobCachedPayloads = (job: BootstrapGroupFetchJob) => {
  const payloads = job.fragmentIds
    .map((fragmentId) => payloadCache.get(buildPayloadCacheKey(job.path, job.lang, fragmentId))?.payload ?? null)
    .filter((payload): payload is FragmentPayload => Boolean(payload))
  return payloads.length === job.fragmentIds.length ? payloads : null
}

const pumpFetchQueue = () => {
  while (activeFetchJobs.size < MAX_NETWORK_CONCURRENCY && scheduledFetchJobs.length) {
    scheduledFetchJobs.sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority
      }
      return left.order - right.order
    })

    const job = scheduledFetchJobs.shift()
    if (!job || !job.subscribers.size) {
      continue
    }

    const controller = new AbortController()
    job.controller = controller
    activeFetchJobs.set(job.key, job)
    job.subscribers.forEach((clientId) => {
      const client = clients.get(clientId)
      if (client) {
        refreshClientStatus(client)
      }
    })

    let claimedByJob = false
    void (async () => {
      if (job.kind === 'fragment') {
        if (!job.refresh && !canUseClaimWaitBypass(job)) {
          const claimed = await persistentCache.claimFetch(job.key, job.owner)
          claimedByJob = claimed
          if (!claimed) {
            const wrote = await persistentCache.waitForPayloadWrite(job.payloadKey, FETCH_CLAIM_WAIT_MS)
            if (wrote) {
              const cached = payloadCache.get(job.payloadKey)
              if (cached) {
                commitFragmentJobPayloadToSubscribers(job, cached.payload, 'cache')
                return
              }
            }
          }
        } else if (job.refresh) {
          const cachedVersion = payloadCache.get(job.payloadKey)?.version
          if (cachedVersion) {
            void persistentCache.invalidatePayload(job.path, job.lang, job.fragmentId, cachedVersion)
          }
        }

        const payload = await fetchFragmentPayload(job.apiBase, job.fragmentId, job.lang, job.refresh, controller.signal)
        seedFetchedPayloads(job.path, job.lang, [payload])
        commitFragmentJobPayloadToSubscribers(job, payload, 'network')
        return
      }

      const primedPayloads = readPrimedBootstrapPayloads(
        {
          path: job.path,
          lang: job.lang,
          bootstrapHref: job.href
        },
        job.fragmentIds
      )
      if (primedPayloads) {
        const payloads = await primedPayloads
        seedFetchedPayloads(job.path, job.lang, payloads)
        commitBootstrapJobPayloadsToSubscribers(job, payloads, 'cache')
        return
      }

      if (!canUseClaimWaitBypass(job)) {
        const claimed = await persistentCache.claimFetch(job.key, job.owner)
        claimedByJob = claimed
        if (!claimed) {
          const wrote = await persistentCache.waitForPayloadWrite(job.key, FETCH_CLAIM_WAIT_MS)
          if (wrote) {
            const cachedPayloads = readBootstrapJobCachedPayloads(job)
            if (cachedPayloads) {
              commitBootstrapJobPayloadsToSubscribers(job, cachedPayloads, 'cache')
              return
            }
          }
        }
      }

      const payloads = await fetchBootstrapPayloadGroup(job.apiBase, job.fragmentIds, job.lang, controller.signal)
      seedFetchedPayloads(job.path, job.lang, payloads)
      commitBootstrapJobPayloadsToSubscribers(job, payloads, 'network')
    })()
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        const fragmentIds = job.kind === 'fragment' ? [job.fragmentId] : [...job.fragmentIds]
        notifyError(job.subscribers, error instanceof Error ? error.message : 'Fragment fetch failed', fragmentIds)
      })
      .finally(() => {
        if (claimedByJob) {
          persistentCache.releaseFetch(job.key, job.owner)
        }
        activeFetchJobs.delete(job.key)
        job.subscribers.forEach((clientId) => {
          const client = clients.get(clientId)
          if (client) {
            refreshClientStatus(client)
          }
        })
        pumpFetchQueue()
      })
  }
}

const scheduleFragmentFetch = (
  client: ClientState,
  fragmentId: string,
  priority: FragmentRuntimePriority,
  refresh = false
) => {
  if (!refresh) {
    const cached = readReusableCachedPayload(client, fragmentId)
    if (cached) {
      commitPayloadToClient(client, cached.payload, priority, 'cache')
      return
    }
  }

  const fetchKey = buildFetchKey(client.apiBase, client.path, client.lang, fragmentId, refresh)
  const nextPriority = priorityToValue(priority, client.entriesById.get(fragmentId)?.critical === true)
  const skipClaimWait = shouldUseStartupFastPath(client, priority)
  const existingActive = activeFetchJobs.get(fetchKey)
  if (existingActive && existingActive.kind === 'fragment') {
    existingActive.subscribers.add(client.id)
    existingActive.priority = Math.max(existingActive.priority, nextPriority)
    existingActive.skipClaimWait ||= skipClaimWait
    refreshClientStatus(client)
    return
  }

  const existingQueued = scheduledFetchJobs.find((job) => job.key === fetchKey)
  if (existingQueued && existingQueued.kind === 'fragment') {
    existingQueued.subscribers.add(client.id)
    existingQueued.priority = Math.max(existingQueued.priority, nextPriority)
    existingQueued.skipClaimWait ||= skipClaimWait
    refreshClientStatus(client)
    return
  }

  scheduledFetchJobs.push({
    kind: 'fragment',
    key: fetchKey,
    payloadKey: buildPayloadCacheKey(client.path, client.lang, fragmentId),
    owner: `${client.id}:${fragmentId}:${jobOrder}`,
    apiBase: client.apiBase,
    path: client.path,
    lang: client.lang,
    fragmentId,
    refresh,
    priority: nextPriority,
    subscribers: new Set([client.id]),
    order: jobOrder++,
    skipClaimWait
  })
  refreshClientStatus(client)
  pumpFetchQueue()
}

const scheduleBootstrapGroupFetch = (
  client: ClientState,
  fragmentIds: string[],
  requestedIds: string[],
  priority: FragmentRuntimePriority
) => {
  const fetchKey = buildBootstrapGroupJobKey(client.apiBase, client.path, client.lang, fragmentIds)
  const skipClaimWait = shouldUseStartupFastPath(client, priority)
  const nextPriority = priorityToValue(
    priority,
    requestedIds.some((fragmentId) => client.entriesById.get(fragmentId)?.critical === true)
  )

  const existingActive = activeFetchJobs.get(fetchKey)
  if (existingActive && existingActive.kind === 'bootstrap-group') {
    existingActive.subscribers.add(client.id)
    existingActive.priority = Math.max(existingActive.priority, nextPriority)
    existingActive.skipClaimWait ||= skipClaimWait
    const requested = existingActive.requestedIdsByClient.get(client.id) ?? new Set<string>()
    requestedIds.forEach((fragmentId) => requested.add(fragmentId))
    existingActive.requestedIdsByClient.set(client.id, requested)
    refreshClientStatus(client)
    return
  }

  const existingQueued = scheduledFetchJobs.find((job) => job.key === fetchKey)
  if (existingQueued && existingQueued.kind === 'bootstrap-group') {
    existingQueued.subscribers.add(client.id)
    existingQueued.priority = Math.max(existingQueued.priority, nextPriority)
    existingQueued.skipClaimWait ||= skipClaimWait
    const requested = existingQueued.requestedIdsByClient.get(client.id) ?? new Set<string>()
    requestedIds.forEach((fragmentId) => requested.add(fragmentId))
    existingQueued.requestedIdsByClient.set(client.id, requested)
    refreshClientStatus(client)
    return
  }

  scheduledFetchJobs.push({
    kind: 'bootstrap-group',
    key: fetchKey,
    owner: `${client.id}:bootstrap:${jobOrder}`,
    apiBase: client.apiBase,
    path: client.path,
    lang: client.lang,
    fragmentIds: [...fragmentIds],
    requestedIdsByClient: new Map([[client.id, new Set(requestedIds)]]),
    href: client.bootstrapHref,
    refresh: false,
    priority: nextPriority,
    subscribers: new Set([client.id]),
    order: jobOrder++,
    skipClaimWait
  })
  refreshClientStatus(client)
  pumpFetchQueue()
}

const requestClientFragments = (
  client: ClientState,
  ids: string[],
  priority: FragmentRuntimePriority,
  refreshIds: string[] = []
) => {
  const orderedIds = expandDependencies(client, ids)
  const refreshIdSet = new Set(refreshIds)
  const uncachedIds: string[] = []

  orderedIds.forEach((fragmentId) => {
    if (refreshIdSet.has(fragmentId)) {
      scheduleFragmentFetch(client, fragmentId, priority, true)
      return
    }
    const cached = readReusableCachedPayload(client, fragmentId)
    if (cached) {
      commitPayloadToClient(client, cached.payload, priority, 'cache')
      return
    }
    uncachedIds.push(fragmentId)
  })

  if (!uncachedIds.length) {
    return
  }

  const { groups: matchingFetchGroups, leftovers } = partitionMatchingFetchGroups(client, uncachedIds)
  matchingFetchGroups.forEach(({ fragmentIds, requestedIds }) => {
    scheduleBootstrapGroupFetch(client, fragmentIds, requestedIds, priority)
  })

  leftovers.forEach((fragmentId) => {
    scheduleFragmentFetch(client, fragmentId, priority, false)
  })
}

const buildKnownVersions = (client: ClientState, ids: string[]) =>
  ids.reduce<Record<string, number>>((acc, fragmentId) => {
    const payload = payloadCache.get(buildPayloadCacheKey(client.path, client.lang, fragmentId))?.payload
    if (typeof payload?.cacheUpdatedAt === 'number') {
      acc[fragmentId] = payload.cacheUpdatedAt
      return acc
    }
    const knownVersion = client.knownVersions.get(fragmentId)
    if (typeof knownVersion === 'number' && Number.isFinite(knownVersion)) {
      acc[fragmentId] = knownVersion
    }
    return acc
  }, {})

const buildStreamParams = (client: ClientState, ids: string[], live: boolean) => {
  const params = new URLSearchParams({
    path: client.path,
    protocol: '2'
  })
  if (!live) {
    params.set('live', '0')
  }
  if (client.lang) {
    params.set('lang', client.lang)
  }
  if (ids.length) {
    params.set('ids', ids.join(','))
  }
  const knownVersions = encodeFragmentKnownVersions(buildKnownVersions(client, ids))
  if (knownVersions) {
    params.set('known', knownVersions)
  }
  return params
}

const queueStreamFrameCommit = (client: ClientState, frame: { id: string; payloadBytes: Uint8Array }) => {
  const pendingTask = getDecodePool()
    .decode(frame.id, frame.payloadBytes)
    .then((payload) => {
      const nextPayload = {
        ...payload,
        cacheUpdatedAt:
          payloadCache.get(buildPayloadCacheKey(client.path, client.lang, payload.id))?.payload.cacheUpdatedAt ??
          payload.cacheUpdatedAt
      }
      const payloadKey = buildPayloadCacheKey(client.path, client.lang, nextPayload.id)
      const previousVersion = payloadCache.get(payloadKey)?.version
      if (previousVersion && previousVersion !== buildPayloadVersion(nextPayload)) {
        void persistentCache.invalidatePayload(client.path, client.lang, nextPayload.id, previousVersion)
      }
      payloadCache.set(payloadKey, {
        payload: nextPayload,
        version: buildPayloadVersion(nextPayload)
      })
      void persistentCache.seedPayload(client.path, client.lang, nextPayload)
      const currentClient = clients.get(client.id)
      if (!currentClient || currentClient.lang !== client.lang) return
      commitPayloadToClient(
        currentClient,
        nextPayload,
        currentClient.entriesById.get(nextPayload.id)?.critical ? 'critical' : 'visible',
        'stream'
      )
    })
    .catch((error) => {
      notifyError([client.id], error instanceof Error ? error.message : 'Fragment stream decode failed', [frame.id])
    })
    .finally(() => {
      client.stream?.pendingTasks.delete(pendingTask)
    })
  client.stream?.pendingTasks.add(pendingTask)
}

const processBufferedStreamBytes = async (client: ClientState, bytes: Uint8Array) => {
  const frameBuffer = new FragmentFrameBuffer()
  frameBuffer.append(bytes)
  for (const frame of frameBuffer.drainFrames()) {
    if (isFragmentHeartbeatFrame(frame)) {
      continue
    }
    queueStreamFrameCommit(client, frame)
  }
  await Promise.allSettled(Array.from(client.stream?.pendingTasks ?? []))
}

const streamVisibleFragments = async (client: ClientState, ids: string[], controller: AbortController) => {
  const apiBase = normalizeApiBase(client.apiBase)
  const readStreamingResponse = async (attempt: WorkerFragmentFetchAttempt) => {
    let activeAttempt = attempt
    if (!canReadWorkerStreamEncoding(activeAttempt.encoding, activeAttempt.acceptedEncodings)) {
      const retryAttempt = await fetchWorkerFragmentResponse({
        url: `${apiBase}/fragments/stream?${buildStreamParams(client, ids, true).toString()}`,
        signal: controller.signal,
        includeZstd: false,
        label: 'Fragment stream'
      })
      activeAttempt = canReadWorkerStreamEncoding(retryAttempt.encoding, retryAttempt.acceptedEncodings)
        ? retryAttempt
        : await retryAttempt.retryWithoutCompression()
    }

    if (!activeAttempt.response.body) {
      throw new Error('Fragment stream failed: missing response body')
    }

    const reader = buildFragmentDecompressionReader(
      activeAttempt.response.body,
      activeAttempt.encoding,
      canReadWorkerStreamEncoding(activeAttempt.encoding, activeAttempt.acceptedEncodings)
    )
    const frameBuffer = new FragmentFrameBuffer()

    try {
      while (true) {
        if (controller.signal.aborted) {
          await reader.cancel()
          return
        }
        const chunk = await reader.read()
        if (chunk.done) {
          await Promise.allSettled(Array.from(client.stream?.pendingTasks ?? []))
          return
        }
        if (!chunk.value) continue

        frameBuffer.append(chunk.value)
        for (const frame of frameBuffer.drainFrames()) {
          if (isFragmentHeartbeatFrame(frame)) {
            continue
          }
          queueStreamFrameCommit(client, frame)
        }
      }
    } finally {
      await Promise.allSettled(Array.from(client.stream?.pendingTasks ?? []))
    }
  }

  const shouldUseCompressedBootStream = shouldUseCompressedWorkerBootStream({
    firstWorkerCommitSent: client.firstWorkerCommitSent,
    supportedEncodingCount: (await getSupportedWorkerPayloadEncodings()).length
  })
  if (shouldUseCompressedBootStream) {
    const bootAttempt = await fetchWorkerFragmentResponse({
      url: `${apiBase}/fragments/stream?${buildStreamParams(client, ids, false).toString()}`,
      signal: controller.signal,
      includeZstd: true,
      label: 'Fragment stream'
    })
    const bootBytes = await readWorkerFragmentResponseBytes(bootAttempt, bootAttempt.retryWithoutCompression)
    await processBufferedStreamBytes(client, bootBytes)
    if (controller.signal.aborted) {
      return
    }
  }

  const liveAttempt = await fetchWorkerFragmentResponse({
    url: `${apiBase}/fragments/stream?${buildStreamParams(client, ids, true).toString()}`,
    signal: controller.signal,
    includeZstd: shouldAdvertiseZstdForWorkerLiveStream(),
    label: 'Fragment stream'
  })
  await readStreamingResponse(liveAttempt)
}

const restartClientStream = (client: ClientState) => {
  if (!client.enableStreaming || client.paused) {
    stopClientStream(client)
    return
  }

  const nextIds = client.planOrder.filter((fragmentId) => client.visibleIds.has(fragmentId))
  const nextKey = `${client.lang}::${nextIds.join('|')}`
  if (!nextIds.length) {
    stopClientStream(client)
    return
  }
  if (client.stream?.key === nextKey) {
    return
  }

  stopClientStream(client)

  const controller = new AbortController()
  client.stream = {
    key: nextKey,
    controller,
    pendingTasks: new Set()
  }
  setClientStatus(client, 'streaming')

  void streamVisibleFragments(client, nextIds, controller)
    .catch((error) => {
      if (controller.signal.aborted) {
        return
      }
      notifyError([client.id], error instanceof Error ? error.message : 'Fragment stream failed', nextIds)
    })
    .finally(() => {
      const currentClient = clients.get(client.id)
      if (!currentClient || currentClient.stream?.controller !== controller) {
        return
      }
      currentClient.stream = null
      refreshClientStatus(currentClient)
    })
}

const startClientEagerFetch = (client: ClientState) => {
  if (client.startupMode !== 'eager-visible-first') {
    return
  }

  const criticalIds = client.planOrder.filter((fragmentId) => client.entriesById.get(fragmentId)?.critical)

  if (criticalIds.length) {
    requestClientFragments(client, criticalIds, 'critical')
  }
}

const createClientState = (message: FragmentRuntimeInitMessage): ClientState => {
  const entriesById = new Map(message.planEntries.map((entry) => [entry.id, entry]))
  if (!decodePool && message.decodeWorkerHref) {
    configuredDecodeWorkerHref = message.decodeWorkerHref
  }
  const client: ClientState = {
    id: message.clientId,
    apiBase: message.apiBase,
    path: message.path,
    lang: message.lang,
    viewportWidth: message.viewportWidth,
    enableStreaming: message.enableStreaming,
    startupMode: message.startupMode ?? 'visible-only',
    bootstrapHref: message.bootstrapHref ?? null,
    paused: false,
    planOrder: message.planEntries.map((entry) => entry.id),
    entriesById,
    fetchGroups: message.fetchGroups?.map((group) => [...group]) ?? [],
    visibleIds: new Set(message.visibleIds),
    committedVersions: new Map(),
    knownVersions: new Map(),
    sizingSeeds: { ...message.initialSizing },
    widthById: new Map(),
    lastSizingKeyById: new Map(),
    lastStatus: null,
    firstWorkerCommitSent: false,
    stream: null
  }

  seedPayloadCache(message.initialFragments, message.path, message.lang)
  seedKnownVersions(client, message.knownVersions)
  message.initialFragments.forEach((payload) => {
    client.committedVersions.set(payload.id, buildPayloadVersion(payload))
    if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
      client.knownVersions.set(payload.id, payload.cacheUpdatedAt)
    }
  })
  Object.entries(message.initialSizing).forEach(([fragmentId, seed]) => {
    if (typeof seed.cardWidth === 'number' && Number.isFinite(seed.cardWidth) && seed.cardWidth > 0) {
      client.widthById.set(fragmentId, seed.cardWidth)
    } else {
      const bucketWidth = resolveCardWidthFromBucket(seed.widthBucket)
      if (bucketWidth) {
        client.widthById.set(fragmentId, bucketWidth)
      }
    }
  })

  return client
}

const handleInit = (message: FragmentRuntimeInitMessage) => {
  const existing = clients.get(message.clientId)
  if (existing) {
    stopClientStream(existing)
    removeClientFromJobs(existing.id)
  }
  const client = createClientState(message)
  clients.set(client.id, client)
  publishSizingSnapshot(client)
  startClientEagerFetch(client)
  refreshClientStatus(client)
  restartClientStream(client)
}

const handleUpdateLang = (client: ClientState, message: Extract<FragmentRuntimePageMessage, { type: 'update-lang' }>) => {
  client.lang = message.lang
  client.sizingSeeds = { ...message.initialSizing }
  client.widthById.clear()
  client.lastSizingKeyById.clear()
  client.committedVersions.clear()
  seedKnownVersions(client, message.knownVersions)
  seedPayloadCache(message.initialFragments, client.path, message.lang)
  message.initialFragments.forEach((payload) => {
    client.committedVersions.set(payload.id, buildPayloadVersion(payload))
    if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
      client.knownVersions.set(payload.id, payload.cacheUpdatedAt)
    }
  })
  Object.entries(message.initialSizing).forEach(([fragmentId, seed]) => {
    if (typeof seed.cardWidth === 'number' && Number.isFinite(seed.cardWidth) && seed.cardWidth > 0) {
      client.widthById.set(fragmentId, seed.cardWidth)
    } else {
      const bucketWidth = resolveCardWidthFromBucket(seed.widthBucket)
      if (bucketWidth) {
        client.widthById.set(fragmentId, bucketWidth)
      }
    }
  })
  publishSizingSnapshot(client)
  startClientEagerFetch(client)
  restartClientStream(client)
}

const handleMeasureCard = (client: ClientState, message: Extract<FragmentRuntimePageMessage, { type: 'measure-card' }>) => {
  if (typeof message.width === 'number' && Number.isFinite(message.width) && message.width > 0) {
    client.widthById.set(message.fragmentId, Math.round(message.width))
  }
  if (message.ready !== false && Number.isFinite(message.height) && message.height > 0) {
    const sizing = buildClientSizing(client, message.fragmentId)
    if (sizing) {
      const learnedHeightKey = buildLearnedHeightKey(client.path, client.lang, message.fragmentId, sizing.widthBucket)
      learnedHeights.set(learnedHeightKey, { height: Math.round(message.height) })
      void persistentCache.writeLearnedHeight(learnedHeightKey, Math.round(message.height))
      const seed = client.sizingSeeds[message.fragmentId] ?? {}
      client.sizingSeeds[message.fragmentId] = {
        ...seed,
        stableHeight: Math.round(message.height),
        cardWidth:
          typeof message.width === 'number' && Number.isFinite(message.width) && message.width > 0
            ? Math.round(message.width)
            : seed.cardWidth,
        widthBucket: sizing.widthBucket
      }
    }
  }
  maybePublishSizing(client, message.fragmentId)
}

const handleReportCardWidth = (
  client: ClientState,
  message: Extract<FragmentRuntimePageMessage, { type: 'report-card-width' }>
) => {
  if (!Number.isFinite(message.width) || message.width <= 0) return
  client.widthById.set(message.fragmentId, Math.round(message.width))
  maybePublishSizing(client, message.fragmentId)
}

const handlePrimeBootstrap = async (
  client: ClientState,
  message: Extract<FragmentRuntimePageMessage, { type: 'prime-bootstrap' }>
) => {
  const initialKeys = buildBootstrapPromiseKeys(client, [], message.href ?? client.bootstrapHref)
  const existing = initialKeys
    .map((key) => primedBootstrapPayloads.get(key))
    .find((value): value is Promise<FragmentPayload[]> => Boolean(value))
  const pending =
    existing ??
    decodeBootstrapPayloads(new Uint8Array(message.bytes)).then((payloads) => {
      const hydratedPayloads = payloads.map((payload) => {
        if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
          return payload
        }
        const knownVersion = client.knownVersions.get(payload.id)
        return typeof knownVersion === 'number' && Number.isFinite(knownVersion)
          ? { ...payload, cacheUpdatedAt: knownVersion }
          : payload
      })
      seedFetchedPayloads(client.path, client.lang, hydratedPayloads)
      hydratedPayloads.forEach((payload) => {
        if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
          client.knownVersions.set(payload.id, payload.cacheUpdatedAt)
        }
      })
      const resolvedKeys = buildBootstrapPromiseKeys(
        client,
        hydratedPayloads.map((payload) => payload.id),
        message.href ?? client.bootstrapHref
      )
      resolvedKeys.forEach((key) => {
        primedBootstrapPayloads.set(key, Promise.resolve(hydratedPayloads))
      })
      return hydratedPayloads
    })

  initialKeys.forEach((key) => {
    primedBootstrapPayloads.set(key, pending)
  })

  const payloads = await pending
  postToClient(client, {
    type: 'bootstrap-primed',
    clientId: client.id,
    requestId: message.requestId,
    href: message.href ?? client.bootstrapHref ?? undefined,
    fragmentIds: payloads.map((payload) => payload.id)
  } satisfies FragmentRuntimeBootstrapPrimedMessage)
}

const handleMessage = (message: FragmentRuntimePageMessage) => {
  switch (message.type) {
    case 'init':
      handleInit(message)
      return
  }

  const client = getClient(message.clientId)
  if (!client) return

  switch (message.type) {
    case 'request-fragments':
      requestClientFragments(client, message.ids, message.priority, message.refreshIds)
      return
    case 'set-visible-ids':
      client.visibleIds = new Set(message.ids.filter((fragmentId) => client.entriesById.has(fragmentId)))
      restartClientStream(client)
      return
    case 'update-lang':
      handleUpdateLang(client, message)
      return
    case 'pause':
      client.paused = true
      stopClientStream(client)
      refreshClientStatus(client)
      return
    case 'resume':
      client.paused = false
      restartClientStream(client)
      refreshClientStatus(client)
      return
    case 'refresh':
      requestClientFragments(client, message.ids ?? client.planOrder, 'refresh', message.ids ?? client.planOrder)
      restartClientStream(client)
      return
    case 'dispose':
      stopClientStream(client)
      removeClientFromJobs(client.id)
      clients.delete(client.id)
      return
    case 'measure-card':
      handleMeasureCard(client, message)
      return
    case 'report-card-width':
      handleReportCardWidth(client, message)
      return
    case 'prime-bootstrap':
      void handlePrimeBootstrap(client, message).catch((error) => {
        notifyError(
          [client.id],
          error instanceof Error ? error.message : 'Failed to prime fragment bootstrap payloads'
        )
      })
      return
  }
}

workerScope.addEventListener('message', (messageEvent: MessageEvent<FragmentRuntimePageMessage>) => {
  handleMessage(messageEvent.data)
})
