/// <reference lib="webworker" />

import { encodeFragmentKnownVersions } from '@core/fragment/known-versions'
import { isFragmentHeartbeatFrame, parseFragmentFrames } from '@core/fragment/frames'
import {
  getFragmentHeightViewport,
  resolveFragmentHeightWidthBucket,
  resolveReservedFragmentHeight
} from '@prometheus/ui/fragment-height'
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
  bootstrapHref: string | null
  paused: boolean
  planOrder: string[]
  entriesById: Map<string, FragmentRuntimePlanEntry>
  visibleIds: Set<string>
  committedVersions: Map<string, string>
  knownVersions: Map<string, number>
  sizingSeeds: FragmentRuntimeSizingMap
  widthById: Map<string, number>
  lastSizingKeyById: Map<string, string>
  lastStatus: FragmentRuntimeStatus | null
  stream: {
    key: string
    controller: AbortController
    pendingTasks: Set<Promise<void>>
  } | null
}

type ScheduledFetchJob = {
  key: string
  payloadKey: string
  owner: string
  apiBase: string
  path: string
  lang: string
  fragmentId: string
  refresh: boolean
  priority: number
  subscribers: Set<string>
  order: number
  controller?: AbortController
}

const FETCH_CLAIM_WAIT_MS = 120
const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope
const clients = new Map<string, ClientState>()
const persistentCache = createPersistentRuntimeCache()
const persistentCacheReady = persistentCache.hydrate()
const payloadCache = persistentCache.payloads
const learnedHeights = persistentCache.learnedHeights
const activeFetchJobs = new Map<string, ScheduledFetchJob>()
const scheduledFetchJobs: ScheduledFetchJob[] = []
let jobOrder = 0
let warnedAboutNestedDecodeWorkerFallback = false

const canSpawnNestedDecodeWorkers = () => typeof Worker === 'function'

class DecodePool {
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

  constructor(size: number) {
    if (!canSpawnNestedDecodeWorkers()) {
      return
    }

    for (let index = 0; index < size; index += 1) {
      let worker: Worker
      try {
        worker = new Worker(new URL('./decode-pool.worker.js', import.meta.url), { type: 'module' })
      } catch (error) {
        this.terminate()
        if (!warnedAboutNestedDecodeWorkerFallback) {
          warnedAboutNestedDecodeWorkerFallback = true
          console.warn('Nested fragment decode workers unavailable, falling back to in-worker decode.', error)
        }
        return
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
    }
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

  private pump() {
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

const resolveDecodePoolSize = () => {
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 2
  return Math.max(1, Math.min(MAX_DECODE_WORKERS, Math.floor(hardwareConcurrency / 2) || 1))
}

const decodePool = new DecodePool(resolveDecodePoolSize())

const buildFetchKey = (apiBase: string, path: string, lang: string, fragmentId: string, refresh: boolean) =>
  `${apiBase}::${path}::${lang}::${fragmentId}::${refresh ? 'refresh' : 'cached'}`

const decodeBootstrapPayloads = async (bytes: Uint8Array) => {
  const frames = parseFragmentFrames(bytes).filter((frame) => !isFragmentHeartbeatFrame(frame))
  const payloads = await Promise.all(
    frames.map(async (frame) => decodePool.decode(frame.id, frame.payloadBytes))
  )
  return payloads
}

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

  const response = await fetch(`${normalizeApiBase(apiBase)}/fragments?${params.toString()}`, {
    cache: refresh ? 'no-store' : 'default',
    signal
  })

  if (!response.ok) {
    throw new Error(`Fragment fetch failed: ${response.status}`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  const payload = await decodePool.decode(fragmentId, bytes)
  const cacheUpdatedAtRaw = response.headers.get('x-fragment-cache-updated')
  const cacheUpdatedAt = cacheUpdatedAtRaw ? Number(cacheUpdatedAtRaw) : Number.NaN
  return {
    ...payload,
    cacheUpdatedAt: Number.isFinite(cacheUpdatedAt) ? cacheUpdatedAt : payload.cacheUpdatedAt
  }
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

const commitJobPayloadToSubscribers = (
  job: ScheduledFetchJob,
  payload: FragmentPayload,
  source: 'cache' | 'network'
) => {
  job.subscribers.forEach((clientId) => {
    const client = clients.get(clientId)
    if (!client || client.lang !== job.lang) return
    commitPayloadToClient(client, payload, job.priority >= 200 ? 'critical' : job.refresh ? 'refresh' : 'visible', source)
  })
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
      if (!job.refresh) {
        const claimed = await persistentCache.claimFetch(job.key, job.owner)
        claimedByJob = claimed
        if (!claimed) {
          const wrote = await persistentCache.waitForPayloadWrite(job.payloadKey, FETCH_CLAIM_WAIT_MS)
          if (wrote) {
            const cached = payloadCache.get(job.payloadKey)
            if (cached) {
              commitJobPayloadToSubscribers(job, cached.payload, 'cache')
              return
            }
          }
        }
      } else {
        const cachedVersion = payloadCache.get(job.payloadKey)?.version
        if (cachedVersion) {
          void persistentCache.invalidatePayload(job.path, job.lang, job.fragmentId, cachedVersion)
        }
      }

      const payload = await fetchFragmentPayload(job.apiBase, job.fragmentId, job.lang, job.refresh, controller.signal)
      const previousVersion = payloadCache.get(job.payloadKey)?.version
      if (previousVersion && previousVersion !== buildPayloadVersion(payload)) {
        void persistentCache.invalidatePayload(job.path, job.lang, job.fragmentId, previousVersion)
      }
      payloadCache.set(job.payloadKey, {
        payload,
        version: buildPayloadVersion(payload)
      })
      void persistentCache.seedPayload(job.path, job.lang, payload)
      commitJobPayloadToSubscribers(job, payload, 'network')
    })()
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        notifyError(job.subscribers, error instanceof Error ? error.message : 'Fragment fetch failed', [job.fragmentId])
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

const scheduleFetch = (
  client: ClientState,
  fragmentId: string,
  priority: FragmentRuntimePriority,
  refresh = false
) => {
  const cacheKey = buildPayloadCacheKey(client.path, client.lang, fragmentId)
  const cached = !refresh ? payloadCache.get(cacheKey) : null
  if (cached) {
    const knownVersion =
      client.knownVersions.get(fragmentId) ?? client.entriesById.get(fragmentId)?.cacheUpdatedAt ?? null
    if (
      typeof knownVersion === 'number' &&
      Number.isFinite(knownVersion) &&
      cached.payload.cacheUpdatedAt !== knownVersion
    ) {
      void persistentCache.invalidatePayload(client.path, client.lang, fragmentId, cached.version)
      payloadCache.delete(cacheKey)
    } else {
      commitPayloadToClient(client, cached.payload, priority, 'cache')
      return
    }
  }

  const fetchKey = buildFetchKey(client.apiBase, client.path, client.lang, fragmentId, refresh)
  const existingActive = activeFetchJobs.get(fetchKey)
  if (existingActive) {
    existingActive.subscribers.add(client.id)
    existingActive.priority = Math.max(
      existingActive.priority,
      priorityToValue(priority, client.entriesById.get(fragmentId)?.critical === true)
    )
    refreshClientStatus(client)
    return
  }

  const existingQueued = scheduledFetchJobs.find((job) => job.key === fetchKey)
  if (existingQueued) {
    existingQueued.subscribers.add(client.id)
    existingQueued.priority = Math.max(
      existingQueued.priority,
      priorityToValue(priority, client.entriesById.get(fragmentId)?.critical === true)
    )
    refreshClientStatus(client)
    return
  }

  scheduledFetchJobs.push({
    key: fetchKey,
    payloadKey: cacheKey,
    owner: `${client.id}:${fragmentId}:${jobOrder}`,
    apiBase: client.apiBase,
    path: client.path,
    lang: client.lang,
    fragmentId,
    refresh,
    priority: priorityToValue(priority, client.entriesById.get(fragmentId)?.critical === true),
    subscribers: new Set([client.id]),
    order: jobOrder++
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
  orderedIds.forEach((fragmentId) => {
    scheduleFetch(client, fragmentId, priority, refreshIdSet.has(fragmentId))
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

const streamVisibleFragments = async (client: ClientState, ids: string[], controller: AbortController) => {
  const apiBase = normalizeApiBase(client.apiBase)
  const params = new URLSearchParams({
    path: client.path,
    protocol: '2'
  })
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

  const response = await fetch(`${apiBase}/fragments/stream?${params.toString()}`, {
    signal: controller.signal
  })
  if (!response.ok || !response.body) {
    throw new Error(`Fragment stream failed: ${response.status}`)
  }

  const reader = response.body.getReader()
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
        const pendingTask = decodePool
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
    }
  } finally {
    await Promise.allSettled(Array.from(client.stream?.pendingTasks ?? []))
  }
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

const createClientState = (message: FragmentRuntimeInitMessage): ClientState => {
  const entriesById = new Map(message.planEntries.map((entry) => [entry.id, entry]))
  const client: ClientState = {
    id: message.clientId,
    apiBase: message.apiBase,
    path: message.path,
    lang: message.lang,
    viewportWidth: message.viewportWidth,
    enableStreaming: message.enableStreaming,
    bootstrapHref: message.bootstrapHref ?? null,
    paused: false,
    planOrder: message.planEntries.map((entry) => entry.id),
    entriesById,
    visibleIds: new Set(message.visibleIds),
    committedVersions: new Map(),
    knownVersions: new Map(),
    sizingSeeds: { ...message.initialSizing },
    widthById: new Map(),
    lastSizingKeyById: new Map(),
    lastStatus: null,
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
    }
  })
  publishSizingSnapshot(client)
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
  const payloads = await decodeBootstrapPayloads(new Uint8Array(message.bytes))
  seedPayloadCache(payloads, client.path, client.lang)
  payloads.forEach((payload) => {
    if (typeof payload.cacheUpdatedAt === 'number' && Number.isFinite(payload.cacheUpdatedAt)) {
      client.knownVersions.set(payload.id, payload.cacheUpdatedAt)
    }
  })
  const response: FragmentRuntimeBootstrapPrimedMessage = {
    type: 'bootstrap-primed',
    clientId: client.id,
    requestId: message.requestId,
    href: message.href ?? client.bootstrapHref ?? undefined,
    fragmentIds: payloads.map((payload) => payload.id)
  }
  postToClient(client, response)
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
  void persistentCacheReady.then(() => {
    handleMessage(messageEvent.data)
  })
})
