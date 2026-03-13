import { randomUUID } from 'node:crypto'
import { Elysia, type AnyElysia, type Context } from 'elysia'
import type { ElysiaWS } from 'elysia/ws'
import type { ValkeyClientType } from '@valkey/client'
import { LoroDoc } from 'loro-crdt/nodejs'
import type { CacheClient } from '../cache'

const HOME_COLLAB_SNAPSHOT_KEY = 'home:collab:dock:snapshot:v1'
const HOME_COLLAB_CHANNEL = 'home:collab:dock:updates:v1'
const HOME_COLLAB_PERSIST_DELAY_MS = 120

type ValkeyClient = ValkeyClientType

type HomeCollabInitEvent = {
  type: 'home-collab:init'
  snapshot: string
}

type HomeCollabUpdateEvent = {
  type: 'home-collab:update'
  update: string
  clientId: string
  serverId?: string
}

type HomeCollabErrorEvent = {
  type: 'error'
  error: string
}

type WsData = {
  clientId?: string
}

type WsUpgradeContext = Context
type WsContextData = WsData
type WsSocket = ElysiaWS<WsContextData>

export type HomeCollabRoutesOptions = {
  cache: CacheClient
}

const encodeBase64 = (value: Uint8Array) => Buffer.from(value).toString('base64')

const decodeBase64 = (value: string) => Uint8Array.from(Buffer.from(value, 'base64'))

const jsonMessage = (value: HomeCollabInitEvent | HomeCollabUpdateEvent | HomeCollabErrorEvent) =>
  JSON.stringify(value)

const decodeTextMessage = (value: ArrayBuffer | ArrayBufferView) => {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return new TextDecoder().decode(bytes)
}

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
  let loadDocPromise: Promise<LoroDoc> | null = null
  let subscriber: Awaited<ReturnType<ValkeyClient['duplicate']>> | null = null
  let subscriberReadyPromise: Promise<void> | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const liveClients = new Set<WsSocket>()

  const broadcast = (payload: HomeCollabUpdateEvent, excludeClientId?: string) => {
    const message = jsonMessage(payload)
    liveClients.forEach((client) => {
      if (excludeClientId && client.data.clientId === excludeClientId) {
        return
      }
      try {
        client.send(message)
      } catch {
        liveClients.delete(client)
      }
    })
  }

  const persistSnapshot = async () => {
    persistTimer = null
    if (!cache.isReady()) {
      return
    }
    const current = await ensureDoc()
    const snapshot = encodeBase64(current.export({ mode: 'snapshot' }))
    await cache.client.set(HOME_COLLAB_SNAPSHOT_KEY, snapshot)
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
      return next
    })()

    try {
      return await loadDocPromise
    } finally {
      loadDocPromise = null
    }
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
          schedulePersistSnapshot()
          broadcast(
            {
              type: 'home-collab:update',
              update: event.update,
              clientId: typeof event.clientId === 'string' ? event.clientId : ''
            },
            undefined
          )
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

  return app.ws('/home/collab/dock/ws', {
    upgrade(_context: WsUpgradeContext) {
      return {}
    },
    async open(ws: WsSocket) {
      if (!cache.isReady()) {
        ws.send(jsonMessage({ type: 'error', error: 'Realtime unavailable' }))
        ws.close(1013, 'Cache unavailable')
        return
      }

      liveClients.add(ws)

      try {
        await ensureSubscriber()
        const current = await ensureDoc()
        ws.send(
          jsonMessage({
            type: 'home-collab:init',
            snapshot: encodeBase64(current.export({ mode: 'snapshot' }))
          })
        )
      } catch (error) {
        console.error('Home collab socket open failed', error)
        liveClients.delete(ws)
        ws.send(jsonMessage({ type: 'error', error: 'Unable to join realtime document' }))
        ws.close(1011, 'Subscription failed')
      }
    },
    async message(ws: WsSocket, message: unknown) {
      const payload = parseHomeCollabUpdateEvent(message)
      if (!payload) {
        return
      }

      if (payload.type !== 'home-collab:update' || typeof payload.update !== 'string') {
        return
      }

      const clientId = typeof payload.clientId === 'string' ? payload.clientId : ''
      if (clientId) {
        ws.data.clientId = clientId
      }

      try {
        const current = await ensureDoc()
        current.import(decodeBase64(payload.update))
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

      broadcast(event, clientId || undefined)

      try {
        await cache.client.publish(HOME_COLLAB_CHANNEL, JSON.stringify(event))
      } catch (error) {
        console.error('Home collab publish failed', error)
      }
    },
    close(ws: WsSocket) {
      liveClients.delete(ws)
    }
  })
}
