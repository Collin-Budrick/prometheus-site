export type ResidentNotificationIntentKind = 'immediate' | 'scheduled'

export type ResidentNotificationIntentInput = {
  notificationKey: string
  kind: ResidentNotificationIntentKind
  title: string
  body: string
  url?: string | null
  deliverAtMs?: number | null
}

export type ResidentNotificationRecord = {
  id: string
  notificationKey: string
  kind: ResidentNotificationIntentKind
  title: string
  body: string
  url: string | null
  deliverAtMs: number | null
  updatedAt: number
  deliveredAt: number | null
  fragmentId: string | null
  lang: string
  path: string
  residentKey: string
  scopeKey: string
}

export type ResidentNotificationStoreFilters = Partial<
  Pick<ResidentNotificationRecord, 'fragmentId' | 'lang' | 'path' | 'residentKey' | 'scopeKey'>
>

export type ResidentNotificationDeliveryMode =
  | 'display-now'
  | 'schedule-trigger'
  | 'pending'

export type ResidentNotificationBroadcastMessage =
  | { type: 'intent-upserted'; record: ResidentNotificationRecord }
  | { type: 'intent-cleared'; id: string }
  | { type: 'intent-delivered'; id: string; deliveredAt: number }

export const buildResidentNotificationId = (
  scopeKey: string,
  residentKey: string,
  notificationKey: string
) => [scopeKey.trim(), residentKey.trim(), notificationKey.trim()].join('::')

export const buildResidentNotificationTag = (notificationId: string) =>
  `resident:${notificationId}`

export const normalizeResidentNotificationKey = (value: string) => value.trim()

export const resolveResidentNotificationDeliveryMode = ({
  kind,
  deliverAtMs,
  deliverNow,
  nowMs,
  supportsTrigger
}: {
  kind: ResidentNotificationIntentKind
  deliverAtMs: number | null
  deliverNow: boolean
  nowMs: number
  supportsTrigger: boolean
}): ResidentNotificationDeliveryMode => {
  if (deliverNow) {
    return 'display-now'
  }
  if (kind !== 'scheduled') {
    return 'display-now'
  }
  if (typeof deliverAtMs !== 'number' || !Number.isFinite(deliverAtMs)) {
    return 'display-now'
  }
  if (deliverAtMs <= nowMs) {
    return 'display-now'
  }
  if (supportsTrigger) {
    return 'schedule-trigger'
  }
  return 'pending'
}
