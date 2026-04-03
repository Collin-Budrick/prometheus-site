import { describe, expect, it } from 'bun:test'
import { resolveResidentNotificationDeliveryMode } from './resident-notifications'

describe('resolveResidentNotificationDeliveryMode', () => {
  it('keeps future scheduled notifications pending when triggers are unavailable', () => {
    expect(
      resolveResidentNotificationDeliveryMode({
        kind: 'scheduled',
        deliverAtMs: 5_000,
        deliverNow: false,
        nowMs: 1_000,
        supportsTrigger: false
      })
    ).toBe('pending')
  })

  it('uses the trigger path for future scheduled notifications when supported', () => {
    expect(
      resolveResidentNotificationDeliveryMode({
        kind: 'scheduled',
        deliverAtMs: 5_000,
        deliverNow: false,
        nowMs: 1_000,
        supportsTrigger: true
      })
    ).toBe('schedule-trigger')
  })

  it('delivers immediately when forced or overdue', () => {
    expect(
      resolveResidentNotificationDeliveryMode({
        kind: 'scheduled',
        deliverAtMs: 900,
        deliverNow: false,
        nowMs: 1_000,
        supportsTrigger: false
      })
    ).toBe('display-now')

    expect(
      resolveResidentNotificationDeliveryMode({
        kind: 'scheduled',
        deliverAtMs: 5_000,
        deliverNow: true,
        nowMs: 1_000,
        supportsTrigger: false
      })
    ).toBe('display-now')
  })
})
