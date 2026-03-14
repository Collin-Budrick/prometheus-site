import { randomUUID } from 'node:crypto'
import { type AnyElysia, type Context } from 'elysia'
import type { ElysiaWS } from 'elysia/ws'
import type { ValkeyClientType } from '@valkey/client'
import { LoroDoc } from 'loro-crdt/nodejs'
import type { CacheClient } from '../cache'

const HOME_COLLAB_SNAPSHOT_KEY = 'home:collab:dock:snapshot:v1'
const HOME_COLLAB_TEXT_KEY = 'home:collab:dock:text:v1'
const HOME_COLLAB_CHANNEL = 'home:collab:dock:updates:v1'
const HOME_COLLAB_PERSIST_DELAY_MS = 120

type ValkeyClient = ValkeyClientType
type HomeCollabMode = 'listener' | 'editor'

type HomeCollabInitEvent = {
  type: 'home-collab:init'
  snapshot: string
  text: string
}

type HomeCollabTextInitEvent = {
  type: 'home-collab:text-init'
  text: string
}

type HomeCollabUpdateEvent = {
  type: 'home-collab:update'
  update: string
  clientId: string
  serverId?: string
}

type HomeCollabTextUpdateEvent = {
  type: 'home-collab:text-update'
  text: string
  clientId?: string
}

type HomeCollabErrorEvent = {
  type: 'error'
  error: string
}

type WsData = Record<string, never>

type WsUpgradeContext = Context
type WsContextData = WsData
type WsSocket = ElysiaWS<WsContextData>

export type HomeCollabRoutesOptions = {
  cache: CacheClient
}

const encodeBase64 = (value: Uint8Array) => Buffer.from(value).toString('base64')

const decodeBase64 = (value: string) => Uint8Array.from(Buffer.from(value, 'base64'))

const jsonMessage = (
  value:
    | HomeCollabInitEvent
    | HomeCollabTextInitEvent
    | HomeCollabUpdateEvent
    | HomeCollabTextUpdateEvent
    | HomeCollabErrorEvent
) => JSON.stringify(value)

const decodeTextMessage = (value: ArrayBuffer | ArrayBufferView) => {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return new TextDecoder().decode(bytes)
}

const getHomeCollabMode = (value: unknown): HomeCollabMode =>
  value === 'listener' ? 'listener' : 'editor'

export const resolveHomeCollabModeFromUpgradeContext = (
  context: Pick<Context, 'request'> & { query?: Record<string, unknown> }
) => {
  const queryMode =
    typeof context.query?.mode === 'string'
      ? context.query.mode
      : new URL(context.request.url).searchParams.get('mode')
  return getHomeCollabMode(queryMode)
}

const getDocText = (value: LoroDoc) => value.getText('text').toString()

export const parseHomeCollabUpdateEvent = (message: unknown): Partial<HomeCollabUpdateEvent> | null => {
  let parsed: unknown = message

  if (typeof message === 'string') {
    try {
      parsed = JSON.parse(message)
    } catch {
      return null
    }
  } else if (message instanceof ArrayBuffer || ArrayBuffer.isView(message)) {
    try {
      parsed = JSON.parse(decodeTextMessage(message))
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  return parsed as Partial<HomeCollabUpdateEvent>
}

export const createHomeCollabRoutes = <App extends AnyElysia>(app: App, options: HomeCollabRoutesOptions) => {
  const { cache } = options
  const serverId = randomUUID()

  let doc: LoroDoc | null = null
  let currentText: string | null = null
  let loadDocPromise: Promise<LoroDoc> | null = null
  let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
  let subscriberReadyPromise: Promise<void> | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const liveEditors = new Set<WsSocket>()
  const liveListeners = new Set<WsSocket>()

  const broadcastEditors = (payload: HomeCollabUpdateEvent) => {
    const message = jsonMessage(payload)
    liveEditors.forEach((client) => {
      try {
        client.send(message)
      } catch {
        liveEditors.delete(client)
      }
    })
  }

  const broadcastListeners = (payload: HomeCollabTextUpdateEvent) => {
    const message = jsonMessage(payload)
    liveListeners.forEach((client) => {
      try {
        client.send(message)
      } catch {
        liveListeners.delete(client)
      }
    })
  }

  const ensureDoc = async () => {
    if (doc) {
      return doc
    }
    if (loadDocPromise) {
      return loadDocPromise
    }

    loadDocPromise = (async () => {
      const next = new LoroDoc()
      if (cache.isReady()) {
        try {
          const snapshot = await cache.client.get(HOME_COLLAB_SNAPSHOT_KEY)
          if (typeof snapshot === 'string' && snapshot !== '') {
            next.import(decodeBase64(snapshot))
          }
        } catch (error) {
          console.error('Home collab snapshot load failed', error)
        }
      }
      doc = next
      currentText = getDocText(next)
      return next
    })()

    try {
      return await loadDocPromise
    } finally {
      loadDocPromise = null
    }
  }

  const ensureText = async () => {
    if (typeof currentText === 'string') {
      return currentText
    }

    if (cache.isReady()) {
      try {
        const text = await cache.client.get(HOME_COLLAB_TEXT_KEY)
        if (typeof text === 'string') {
          currentText = text
          return text
        }
      } catch (error) {
        console.error('Home collab text load failed', error)
      }
    }

    const current = await ensureDoc()
    currentText = getDocText(current)
    return currentText
  }

  const persistSnapshot = async () => {
    persistTimer = null
    if (!cache.isReady()) {
      return
    }

    const current = await ensureDoc()
    const snapshot = encodeBase64(current.export({ mode: 'snapshot' }))
    currentText = getDocText(current)

    await Promise.all([
      cache.client.set(HOME_COLLAB_SNAPSHOT_KEY, snapshot),
      cache.client.set(HOME_COLLAB_TEXT_KEY, currentText)
    ])
  }

  const schedulePersistSnapshot = () => {
    if (persistTimer !== null) {
      return
    }
    persistTimer = setTimeout(() => {
      void persistSnapshot().catch((error) => {
        console.error('Home collab snapshot persistence failed', error)
      })
    }, HOME_COLLAB_PERSIST_DELAY_MS)
  }

  const ensureSubscriber = async () => {
    if (!cache.isReady()) {
      return
    }
    if (subscriberReadyPromise) {
      return subscriberReadyPromise
    }

    subscriberReadyPromise = (async () => {
      if (!subscriber) {
        subscriber = cache.client.duplicate()
        await subscriber.connect()
      }

      await subscriber.subscribe(HOME_COLLAB_CHANNEL, async (message: string) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(message)
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') {
          return
        }

        const event = parsed as Partial<HomeCollabUpdateEvent>
        if (event.type !== 'home-collab:update' || typeof event.update !== 'string') {
          return
        }
        if (event.serverId === serverId) {
          return
        }

        try {
          const current = await ensureDoc()
          current.import(decodeBase64(event.update))
          currentText = getDocText(current)
          schedulePersistSnapshot()
          broadcastEditors(
            {
              type: 'home-collab:update',
              update: event.update,
              clientId: typeof event.clientId === 'string' ? event.clientId : ''
            },
            undefined
          )
          broadcastListeners({
            type: 'home-collab:text-update',
            text: currentText,
            clientId: typeof event.clientId === 'string' ? event.clientId : undefined
          })
        } catch (error) {
          console.error('Home collab remote update import failed', error)
        }
      })
    })()

    try {
      await subscriberReadyPromise
    } catch (error) {
      subscriberReadyPromise = null
      if (subscriber) {
        try {
          await subscriber.quit()
        } catch {
          // Ignore subscriber cleanup failures.
        }
      }
      subscriber = null
      throw error
    }
  }

  const closeSocket = (ws: WsSocket) => {
    liveEditors.delete(ws)
    liveListeners.delete(ws)
  }

  const openEditorSocket = async (ws: WsSocket) => {
    if (!cache.isReady()) {
      ws.send(jsonMessage({ type: 'error', error: 'Realtime unavailable' }))
      ws.close(1013, 'Cache unavailable')
      return
    }

    liveEditors.add(ws)

    try {
      await ensureSubscriber()

      const current = await ensureDoc()
      ws.send(
        jsonMessage({
          type: 'home-collab:init',
          snapshot: encodeBase64(current.export({ mode: 'snapshot' })),
          text: currentText ?? getDocText(current)
        })
      )
    } catch (error) {
      console.error('Home collab socket open failed', error)
      liveEditors.delete(ws)
      ws.send(jsonMessage({ type: 'error', error: 'Unable to join realtime document' }))
      ws.close(1011, 'Subscription failed')
    }
  }

  const openListenerSocket = async (ws: WsSocket) => {
    if (!cache.isReady()) {
      ws.send(jsonMessage({ type: 'error', error: 'Realtime unavailable' }))
      ws.close(1013, 'Cache unavailable')
      return
    }

    liveListeners.add(ws)

    try {
      await ensureSubscriber()
      ws.send(
        jsonMessage({
          type: 'home-collab:text-init',
          text: await ensureText()
        })
      )
    } catch (error) {
      console.error('Home collab listener open failed', error)
      liveListeners.delete(ws)
      ws.send(jsonMessage({ type: 'error', error: 'Unable to join realtime document' }))
      ws.close(1011, 'Subscription failed')
    }
  }

  const messageEditorSocket = async (ws: WsSocket, message: unknown) => {
    const payload = parseHomeCollabUpdateEvent(message)
    if (!payload) {
      return
    }

    if (payload.type !== 'home-collab:update' || typeof payload.update !== 'string') {
      return
    }

    const clientId = typeof payload.clientId === 'string' ? payload.clientId : ''

    try {
      const current = await ensureDoc()
      current.import(decodeBase64(payload.update))
      currentText = getDocText(current)
      schedulePersistSnapshot()
    } catch (error) {
      console.error('Home collab local update import failed', error)
      ws.send(jsonMessage({ type: 'error', error: 'Unable to apply collaborative update' }))
      return
    }

    const event: HomeCollabUpdateEvent = {
      type: 'home-collab:update',
      update: payload.update,
      clientId,
      serverId
    }

    broadcastEditors(event)
    broadcastListeners({
      type: 'home-collab:text-update',
      text: currentText ?? '',
      clientId: clientId || undefined
    })

    try {
      await cache.client.publish(HOME_COLLAB_CHANNEL, JSON.stringify(event))
    } catch (error) {
      console.error('Home collab publish failed', error)
    }
  }

  const withEditorSocket = app.ws('/home/collab/dock/ws', {
    async open(ws: WsSocket) {
      await openEditorSocket(ws)
    },
    async message(ws: WsSocket, message: unknown) {
      await messageEditorSocket(ws, message)
    },
    close(ws: WsSocket) {
      closeSocket(ws)
    }
  })

  return withEditorSocket.ws('/home/collab/listener/dock/ws', {
    async open(ws: WsSocket) {
      await openListenerSocket(ws)
    },
    close(ws: WsSocket) {
      closeSocket(ws)
    }
  })
}
