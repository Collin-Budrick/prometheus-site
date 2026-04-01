import { describe, expect, it } from 'bun:test'

import {
  createDockRouteDescriptors,
  createRouteWarmupDescriptors,
  getIdleWarmupDescriptors,
  normalizeRoutePath,
  resolveComparableRouteKey,
  resolveDockOwner,
  resolveRouteMotionDirection,
  resolveRouteSafetyMode,
  resolveRouteWarmupAudience,
  type DockRouteDescriptor
} from './route-navigation'

const descriptors: DockRouteDescriptor[] = createDockRouteDescriptors([
  { href: '/', labelKey: 'navHome', order: 10 },
  { href: '/store', labelKey: 'navStore', order: 20 },
  { href: '/lab', labelKey: 'navLab', order: 30 },
  { href: '/login', labelKey: 'navLogin', order: 40 }
] as never)

const warmupDescriptors = createRouteWarmupDescriptors(
  [
    { href: '/', labelKey: 'navHome', order: 10 },
    { href: '/store', labelKey: 'navStore', order: 20 },
    { href: '/lab', labelKey: 'navLab', order: 30 },
    { href: '/login', labelKey: 'navLogin', order: 40 }
  ] as never,
  [
    { href: '/profile', labelKey: 'navProfile', order: 10 },
    { href: '/chat', labelKey: 'navChat', order: 20 },
    { href: '/settings', labelKey: 'navSettings', order: 30 },
    { href: '/dashboard', labelKey: 'navDashboard', order: 40 }
  ] as never
)

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

  it('returns idle warmup targets for the current auth mode', () => {
    expect(getIdleWarmupDescriptors('/', warmupDescriptors, false).map((entry) => entry.href)).toEqual([
      '/store',
      '/lab'
    ])
    expect(getIdleWarmupDescriptors('/store', warmupDescriptors, false).map((entry) => entry.href)).toEqual([
      '/',
      '/lab'
    ])
    expect(getIdleWarmupDescriptors('/dashboard', warmupDescriptors, true).map((entry) => entry.href)).toEqual([
      '/',
      '/store',
      '/lab',
      '/login',
      '/profile',
      '/chat',
      '/settings'
    ])
    expect(getIdleWarmupDescriptors('/privacy', warmupDescriptors, false).map((entry) => entry.href)).toEqual([
      '/',
      '/store',
      '/lab'
    ])
  })

  it('classifies route safety using the warmup policy', () => {
    expect(resolveRouteSafetyMode('/')).toBe('prefetch-only')
    expect(resolveRouteSafetyMode('/store')).toBe('prefetch-only')
    expect(resolveRouteSafetyMode('/lab')).toBe('prefetch-only')
    expect(resolveRouteSafetyMode('/chat')).toBe('prefetch-only')
    expect(resolveRouteSafetyMode('/privacy')).toBe('prefetch-only')
    expect(resolveRouteSafetyMode('/login/callback')).toBe('no-warmup')
    expect(resolveRouteSafetyMode('/store/items/123')).toBe('no-warmup')
    expect(resolveRouteSafetyMode('/store/items/123/consume')).toBe('no-warmup')
  })

  it('classifies warmup audience by auth access', () => {
    expect(resolveRouteWarmupAudience('/')).toBe('public')
    expect(resolveRouteWarmupAudience('/store')).toBe('public')
    expect(resolveRouteWarmupAudience('/login')).toBe('auth')
    expect(resolveRouteWarmupAudience('/profile')).toBe('auth')
    expect(resolveRouteWarmupAudience('/login/callback')).toBe('auth')
  })
})
