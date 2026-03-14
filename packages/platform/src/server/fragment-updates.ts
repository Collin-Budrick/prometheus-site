import { randomUUID } from 'node:crypto'
import { normalizePlanPath } from '@core/fragment/planner'
import type { FragmentLang } from '@core/fragment/i18n'
import type { CacheClient } from '../cache'

const FRAGMENT_UPDATE_CHANNEL = 'fragments:updates:v1'

export type FragmentUpdateEvent =
  | {
      type: 'path'
      path: string
      lang?: FragmentLang
    }
  | {
      type: 'fragment'
      id: string
      lang: FragmentLang
      updatedAt?: number
    }

type FragmentUpdateEnvelope = FragmentUpdateEvent & {
  serverId: string
}

type FragmentUpdateListener = (event: FragmentUpdateEvent) => void

export type FragmentUpdateBroadcaster = {
  notifyFragment: (event: Extract<FragmentUpdateEvent, { type: 'fragment' }>) => void
  notifyPath: (path: string, lang?: FragmentLang) => void
  subscribe: (listener: FragmentUpdateListener) => () => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseFragmentUpdateEnvelope = (message: string): FragmentUpdateEnvelope | null => {
  try {
    const parsed: unknown = JSON.parse(message)
    if (!isRecord(parsed) || typeof parsed.serverId !== 'string') return null
    if (parsed.type === 'path' && typeof parsed.path === 'string') {
      return {
        type: 'path',
        path: normalizePlanPath(parsed.path),
        ...(typeof parsed.lang === 'string' ? { lang: parsed.lang as FragmentLang } : {}),
        serverId: parsed.serverId
      }
    }
    if (parsed.type === 'fragment' && typeof parsed.id === 'string' && typeof parsed.lang === 'string') {
      return {
        type: 'fragment',
        id: parsed.id,
        lang: parsed.lang as FragmentLang,
        ...(typeof parsed.updatedAt === 'number' ? { updatedAt: parsed.updatedAt } : {}),
        serverId: parsed.serverId
      }
    }
    return null
  } catch {
    return null
  }
}

export const createFragmentUpdateBroadcaster = (
  cache?: CacheClient | null
): FragmentUpdateBroadcaster => {
  const listeners = new Set<FragmentUpdateListener>()
  const serverId = randomUUID()

  let subscriber: ReturnType<CacheClient['client']['duplicate']> | null = null
  let subscriberReadyPromise: Promise<void> | null = null

  const emit = (event: FragmentUpdateEvent) => {
    listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('Fragment update listener failed', error)
      }
    })
  }

  const publish = async (event: FragmentUpdateEvent) => {
    if (!cache?.isReady()) return
    try {
      await cache.client.publish(FRAGMENT_UPDATE_CHANNEL, JSON.stringify({ ...event, serverId }))
    } catch (error) {
      console.error('Fragment update publish failed', error)
    }
  }

  const ensureSubscriber = async () => {
    if (!cache?.isReady()) return
    if (subscriberReadyPromise) {
      return subscriberReadyPromise
    }

    subscriberReadyPromise = (async () => {
      if (!subscriber) {
        subscriber = cache.client.duplicate()
        await subscriber.connect()
      }

      await subscriber.subscribe(FRAGMENT_UPDATE_CHANNEL, (message: string) => {
        const envelope = parseFragmentUpdateEnvelope(message)
        if (!envelope || envelope.serverId === serverId) return
        if (envelope.type === 'path') {
          emit({
            type: 'path',
            path: envelope.path,
            ...(envelope.lang ? { lang: envelope.lang } : {})
          })
          return
        }
        emit({
          type: 'fragment',
          id: envelope.id,
          lang: envelope.lang,
          ...(typeof envelope.updatedAt === 'number' ? { updatedAt: envelope.updatedAt } : {})
        })
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
          // Ignore cleanup failures.
        }
      }
      subscriber = null
      throw error
    }
  }

  return {
    notifyFragment(event) {
      emit(event)
      void ensureSubscriber()
      void publish(event)
    },
    notifyPath(path, lang) {
      const event: FragmentUpdateEvent = {
        type: 'path',
        path: normalizePlanPath(path),
        ...(lang ? { lang } : {})
      }
      emit(event)
      void ensureSubscriber()
      void publish(event)
    },
    subscribe(listener) {
      listeners.add(listener)
      void ensureSubscriber()
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
