import { showNativeNotification } from '../native/notifications'
import { readResidentFragmentMeta } from './resident-fragment-manager'
import {
  type ResidentNotificationIntentInput,
  type ResidentNotificationRecord,
  type ResidentNotificationStoreFilters,
  buildResidentNotificationId,
  buildResidentNotificationTag
} from './resident-notifications'
import {
  createResidentNotificationStore,
  type ResidentNotificationStore
} from './resident-notification-store'

type ResidentNotificationServiceWorkerMessage =
  | {
      type: 'sw:resident-notification-upsert'
      notification: ResidentNotificationRecord
      reason?: string
      deliverNow?: boolean
    }
  | {
      type: 'sw:resident-notification-clear'
      notificationId: string
      tag: string
    }

type ResidentNotificationDeliveredPayload = {
  deliveredAt?: number
  notificationId?: string
  updatedAt?: number
}

type ResidentNotificationManagerOptions = {
  now?: () => number
  postToServiceWorker?: (message: ResidentNotificationServiceWorkerMessage) => Promise<boolean>
  showFallbackNotification?: (record: ResidentNotificationRecord) => Promise<boolean>
  store?: ResidentNotificationStore
  windowObject?: (Window & typeof globalThis) | null
}

const MAX_TIMEOUT_MS = 2_147_483_647

const defaultNow = () => Date.now()

const resolveWindowObject = () =>
  (typeof window !== 'undefined' ? window : null) as (Window & typeof globalThis) | null

const buildServiceWorkerMessage = (
  record: ResidentNotificationRecord,
  options: {
    deliverNow?: boolean
    reason?: string
  } = {}
): ResidentNotificationServiceWorkerMessage => ({
  type: 'sw:resident-notification-upsert',
  notification: record,
  deliverNow: options.deliverNow === true,
  reason: options.reason
})

const postResidentNotificationToServiceWorker = async (
  message: ResidentNotificationServiceWorkerMessage
) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  const postMessage = (target: ServiceWorker | null | undefined) => {
    if (!target) return false
    target.postMessage(message)
    return true
  }

  if (postMessage(navigator.serviceWorker.controller)) {
    return true
  }

  try {
    const registration = await navigator.serviceWorker.ready
    return postMessage(registration?.active)
  } catch {
    return false
  }
}

const getDisplayedNotificationCount = async (tag: string) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return 0
  }
  try {
    const registration = await navigator.serviceWorker.ready
    const registrationWithNotifications = registration as ServiceWorkerRegistration & {
      getNotifications?: (filter?: { tag?: string }) => Promise<Notification[]>
    }
    if (typeof registrationWithNotifications.getNotifications !== 'function') {
      return 0
    }
    const notifications = await registrationWithNotifications.getNotifications({ tag })
    return notifications.length
  } catch {
    return 0
  }
}

const defaultFallbackNotification = async (record: ResidentNotificationRecord) =>
  showNativeNotification({
    title: record.title,
    body: record.body,
    tag: buildResidentNotificationTag(record.id),
    url: record.url ?? undefined,
    requireInteraction: false,
    silent: false
  })

const createManager = (options: ResidentNotificationManagerOptions = {}) => {
  const now = options.now ?? defaultNow
  const store = options.store ?? createResidentNotificationStore({ now })
  const postToServiceWorker = options.postToServiceWorker ?? postResidentNotificationToServiceWorker
  const showFallbackNotification = options.showFallbackNotification ?? defaultFallbackNotification
  const windowObject = options.windowObject ?? resolveWindowObject()
  let initialized = false
  let destroyed = false
  let timeoutHandle = 0
  let unsubscribeStore: (() => void) | null = null
  let reconcilePromise: Promise<void> = Promise.resolve()
  const cleanupCallbacks: Array<() => void> = []

  const clearScheduledTimeout = () => {
    if (!timeoutHandle || !windowObject) return
    windowObject.clearTimeout(timeoutHandle)
    timeoutHandle = 0
  }

  const scheduleNextTimeout = () => {
    clearScheduledTimeout()
    if (!windowObject) return
    const nextRecord = store
      .listPending()
      .find((record) => record.kind === 'scheduled' && typeof record.deliverAtMs === 'number')
    if (!nextRecord?.deliverAtMs) return
    const delayMs = Math.max(0, Math.min(MAX_TIMEOUT_MS, nextRecord.deliverAtMs - now()))
    timeoutHandle = windowObject.setTimeout(() => {
      timeoutHandle = 0
      void queueReconcile('timeout')
    }, delayMs)
  }

  const markDeliveredFromServiceWorker = async (payload: ResidentNotificationDeliveredPayload) => {
    const notificationId = typeof payload.notificationId === 'string' ? payload.notificationId : ''
    if (!notificationId) return
    const current = store.get(notificationId)
    if (!current) return
    if (typeof payload.updatedAt === 'number' && payload.updatedAt < current.updatedAt) {
      return
    }
    await store.markDelivered(notificationId, typeof payload.deliveredAt === 'number' ? payload.deliveredAt : now())
  }

  const syncScheduledRecordToServiceWorker = async (
    record: ResidentNotificationRecord,
    reason: string
  ) => {
    if (record.kind !== 'scheduled' || record.deliveredAt !== null) return false
    return await postToServiceWorker(buildServiceWorkerMessage(record, { reason }))
  }

  const deliverRecord = async (record: ResidentNotificationRecord, reason: string) => {
    if (record.deliveredAt !== null) return
    const tag = buildResidentNotificationTag(record.id)
    if ((await getDisplayedNotificationCount(tag)) > 0) {
      await store.markDelivered(record.id, now())
      return
    }

    const posted = await postToServiceWorker(
      buildServiceWorkerMessage(record, {
        deliverNow: true,
        reason
      })
    )
    if (posted) return

    const shown = await showFallbackNotification(record)
    if (shown) {
      await store.markDelivered(record.id, now())
    }
  }

  const reconcileInternal = async (reason: string) => {
    if (destroyed) return
    await store.hydrate()
    const nowMs = now()
    const pending = store.listPending()

    if (reason !== 'timeout') {
      await Promise.all(
        pending
          .filter(
            (record) =>
              record.kind === 'scheduled' &&
              typeof record.deliverAtMs === 'number' &&
              record.deliverAtMs > nowMs
          )
          .map((record) => syncScheduledRecordToServiceWorker(record, reason))
      )
    }

    for (const record of store.listDuePending(nowMs)) {
      await deliverRecord(record, reason)
    }

    scheduleNextTimeout()
  }

  const queueReconcile = (reason: string) => {
    reconcilePromise = reconcilePromise
      .then(() => reconcileInternal(reason))
      .catch(() => undefined)
    return reconcilePromise
  }

  const init = async () => {
    if (initialized || destroyed) return
    initialized = true

    await store.hydrate()
    unsubscribeStore = store.subscribe(() => {
      scheduleNextTimeout()
    })

    if (windowObject) {
      const onFocus = () => {
        void queueReconcile('focus')
      }
      const onPageShow = () => {
        void queueReconcile('pageshow')
      }
      const onVisibilityChange = () => {
        if (windowObject.document.visibilityState === 'visible') {
          void queueReconcile('visibilitychange')
        }
      }

      windowObject.addEventListener('focus', onFocus)
      windowObject.addEventListener('pageshow', onPageShow)
      windowObject.document.addEventListener('visibilitychange', onVisibilityChange)

      cleanupCallbacks.push(() => {
        windowObject.removeEventListener('focus', onFocus)
        windowObject.removeEventListener('pageshow', onPageShow)
        windowObject.document.removeEventListener('visibilitychange', onVisibilityChange)
      })
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => queueReconcile('service-worker-ready'))
        .catch(() => undefined)
    }

    await queueReconcile('boot')
  }

  const emit = async (root: Element | null, intent: ResidentNotificationIntentInput) => {
    const meta = readResidentFragmentMeta(root)
    if (!meta) return false
    if (intent.kind === 'scheduled' && meta.mode !== 'live') {
      return false
    }

    await init()
    const record = await store.upsertIntent(meta, intent)
    if (record.kind === 'scheduled' && typeof record.deliverAtMs === 'number' && record.deliverAtMs > now()) {
      await syncScheduledRecordToServiceWorker(record, 'intent-upsert')
      scheduleNextTimeout()
      return true
    }

    await deliverRecord(record, 'intent-upsert')
    scheduleNextTimeout()
    return true
  }

  const clearMatching = async (filters: ResidentNotificationStoreFilters) => {
    await init()
    const matchingRecords = Array.from(store.records.values()).filter((record) => {
      if (typeof filters.scopeKey === 'string' && record.scopeKey !== filters.scopeKey) return false
      if (typeof filters.residentKey === 'string' && record.residentKey !== filters.residentKey) return false
      if (typeof filters.path === 'string' && record.path !== filters.path) return false
      if (typeof filters.lang === 'string' && record.lang !== filters.lang) return false
      if (typeof filters.fragmentId === 'string' && record.fragmentId !== filters.fragmentId) return false
      return true
    })

    await store.clearMatching(filters)
    await Promise.all(
      matchingRecords.map((record) =>
        postToServiceWorker({
          type: 'sw:resident-notification-clear',
          notificationId: record.id,
          tag: buildResidentNotificationTag(record.id)
        })
      )
    )
    scheduleNextTimeout()
  }

  return {
    async init() {
      await init()
    },
    async emitFromRoot(root: Element | null, intent: ResidentNotificationIntentInput) {
      return await emit(root, intent)
    },
    async clearFromRoot(root: Element | null, notificationKey: string) {
      const meta = readResidentFragmentMeta(root)
      if (!meta) return
      await init()
      const id = buildResidentNotificationId(meta.scopeKey, meta.residentKey, notificationKey)
      await store.clearIntent(id)
      await postToServiceWorker({
        type: 'sw:resident-notification-clear',
        notificationId: id,
        tag: buildResidentNotificationTag(id)
      })
      scheduleNextTimeout()
    },
    async clearMatching(filters: ResidentNotificationStoreFilters) {
      await clearMatching(filters)
    },
    async handleDeliveredPayload(payload: ResidentNotificationDeliveredPayload) {
      await init()
      await markDeliveredFromServiceWorker(payload)
      scheduleNextTimeout()
    },
    destroy() {
      destroyed = true
      clearScheduledTimeout()
      unsubscribeStore?.()
      unsubscribeStore = null
      cleanupCallbacks.splice(0).forEach((cleanup) => cleanup())
      store.close()
    }
  }
}

let defaultManager: ReturnType<typeof createManager> | null = null

const getDefaultManager = () => {
  defaultManager ??= createManager()
  return defaultManager
}

export const initResidentNotificationManager = async () => {
  await getDefaultManager().init()
}

export const emitResidentNotificationIntent = async (
  root: Element | null,
  intent: ResidentNotificationIntentInput
) => await getDefaultManager().emitFromRoot(root, intent)

export const clearResidentNotificationIntent = async (
  root: Element | null,
  notificationKey: string
) => {
  await getDefaultManager().clearFromRoot(root, notificationKey)
}

export const clearResidentNotificationScope = async (scopeKey: string) => {
  await getDefaultManager().clearMatching({ scopeKey })
}

export const invalidateResidentNotificationIntents = async (
  filters: ResidentNotificationStoreFilters
) => {
  await getDefaultManager().clearMatching(filters)
}

export const handleResidentNotificationDeliveredMessage = async (
  payload: ResidentNotificationDeliveredPayload
) => {
  await getDefaultManager().handleDeliveredPayload(payload)
}

export const resetResidentNotificationManagerForTests = () => {
  defaultManager?.destroy()
  defaultManager = null
}

export const createResidentNotificationManager = createManager
