import { describe, expect, it } from 'bun:test'

import {
  createDockRouteDescriptors,
  getIdleWarmupDescriptors,
  normalizeRoutePath,
  resolveComparableRouteKey,
  resolveDockOwner,
  resolveRouteMotionDirection,
  resolveRouteSafetyMode,
  type DockRouteDescriptor
} from './route-navigation'

const descriptors: DockRouteDescriptor[] = createDockRouteDescriptors([
  { href: '/', labelKey: 'navHome', order: 10 },
  { href: '/store', labelKey: 'navStore', order: 20 },
  { href: '/lab', labelKey: 'navLab', order: 30 },
  { href: '/login', labelKey: 'navLogin', order: 40 }
] as never)

describe('route navigation helpers', () => {
  it('normalizes route paths and comparable keys', () => {
    expect(normalizeRoutePath('/store/')).toBe('/store')
    expect(normalizeRoutePath('/')).toBe('/')
    expect(resolveComparableRouteKey('https://prometheus.prod/store/?lang=en')).toBe('/store?lang=en')
  })

  it('resolves dock owners using the longest matching href', () => {
    expect(resolveDockOwner('/', descriptors)?.href).toBe('/')
    expect(resolveDockOwner('/store/items/123', descriptors)?.href).toBe('/store')
    expect(resolveDockOwner('/privacy', descriptors)).toBeNull()
  })

  it('resolves route motion direction from dock order', () => {
    expect(resolveRouteMotionDirection('/', '/store', descriptors)).toBe('forward')
    expect(resolveRouteMotionDirection('/lab', '/store', descriptors)).toBe('back')
    expect(resolveRouteMotionDirection('/store/items/123', '/store', descriptors)).toBe('neutral')
    expect(resolveRouteMotionDirection('/privacy', '/store', descriptors)).toBe('neutral')
    expect(resolveRouteMotionDirection('/store', '/store', descriptors)).toBe('none')
  })

  it('returns only adjacent idle warmup targets', () => {
    expect(getIdleWarmupDescriptors('/', descriptors).map((entry) => entry.href)).toEqual(['/store'])
    expect(getIdleWarmupDescriptors('/store', descriptors).map((entry) => entry.href)).toEqual(['/', '/lab'])
    expect(getIdleWarmupDescriptors('/login', descriptors).map((entry) => entry.href)).toEqual(['/lab'])
    expect(getIdleWarmupDescriptors('/privacy', descriptors)).toEqual([])
  })

  it('classifies route safety using the warmup policy', () => {
    expect(resolveRouteSafetyMode('/')).toBe('prerender-ok')
    expect(resolveRouteSafetyMode('/store')).toBe('prerender-ok')
    expect(resolveRouteSafetyMode('/chat')).toBe('prefetch-only')
    expect(resolveRouteSafetyMode('/privacy')).toBe('prefetch-only')
    expect(resolveRouteSafetyMode('/login/callback')).toBe('no-warmup')
    expect(resolveRouteSafetyMode('/store/items/123')).toBe('no-warmup')
    expect(resolveRouteSafetyMode('/store/items/123/consume')).toBe('no-warmup')
  })
})
