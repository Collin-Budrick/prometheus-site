import { describe, expect, it } from 'bun:test'

import {
  createDockRouteDescriptors,
  createRouteWarmupDescriptors,
  createRouteWarmupController,
  getIdleWarmupDescriptors,
  normalizeRoutePath,
  resolveComparableRouteKey,
  resolveDockOwner,
  resolveRouteMotionDirection,
  resolveRouteSafetyMode,
  resolveRouteWarmupAudience,
  shouldWarmRouteOnTrigger,
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

type MockWarmupNode = {
  tagName: 'link' | 'script'
  parentNode: { removeChild: (node: MockWarmupNode) => void } | null
  rel?: string
  as?: string
  href?: string
  type?: string
  nonce?: string
  textContent?: string
  attributes: Record<string, string>
  setAttribute: (name: string, value: string) => void
}

type MockWarmupDocument = {
  head: { appendChild: (node: MockWarmupNode) => void }
  documentElement: { getAttribute: (name: string) => string | null }
  location: { origin: string }
  createElement: (tagName: 'link' | 'script') => MockWarmupNode
  querySelectorAll: (selector: string) => MockWarmupNode[]
}

const createTestDocument = (): MockWarmupDocument => {
  const nodes: MockWarmupNode[] = []
  const removeChild = (node: MockWarmupNode) => {
    const index = nodes.indexOf(node)
    if (index >= 0) {
      nodes.splice(index, 1)
    }
    node.parentNode = null
  }

  const createElement = (tagName: 'link' | 'script'): MockWarmupNode => ({
    tagName,
    parentNode: null,
    attributes: {},
    setAttribute(name: string, value: string) {
      this.attributes[name] = value
    }
  })

  return {
    head: {
      appendChild(node) {
        node.parentNode = { removeChild }
        nodes.push(node)
      }
    },
    documentElement: {
      getAttribute() {
        return null
      }
    },
    location: {
      origin: 'https://prometheus.prod'
    },
    createElement,
    querySelectorAll(selector: string) {
      if (selector.includes('[data-route-prefetch="shell"]')) {
        return nodes.filter(
          (node) => node.tagName === 'link' && node.attributes['data-route-prefetch'] === 'shell'
        )
      }
      if (selector.includes('[data-route-speculation="shell"]')) {
        return nodes.filter(
          (node) => node.tagName === 'script' && node.attributes['data-route-speculation'] === 'shell'
        )
      }
      return []
    }
  }
}

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
    expect(resolveRouteSafetyMode('/login/callback/return')).toBe('no-warmup')
    expect(resolveRouteSafetyMode('/store/items/123')).toBe('no-warmup')
    expect(resolveRouteSafetyMode('/store/items/123/consume')).toBe('no-warmup')
    expect(resolveRouteSafetyMode('/store/items/123/restore')).toBe('no-warmup')
  })

  it('classifies warmup audience by auth access', () => {
    expect(resolveRouteWarmupAudience('/')).toBe('public')
    expect(resolveRouteWarmupAudience('/store')).toBe('public')
    expect(resolveRouteWarmupAudience('/login')).toBe('auth')
    expect(resolveRouteWarmupAudience('/profile')).toBe('auth')
    expect(resolveRouteWarmupAudience('/login/callback')).toBe('auth')
  })

  it('gates warmup by route safety, auth audience, and trigger source', () => {
    expect(shouldWarmRouteOnTrigger('/', false, 'pointer', false)).toBe(true)
    expect(shouldWarmRouteOnTrigger('/store', false, 'focus', true)).toBe(true)
    expect(shouldWarmRouteOnTrigger('/store', false, 'idle', true)).toBe(false)
    expect(shouldWarmRouteOnTrigger('/settings', false, 'pointer', false)).toBe(false)
    expect(shouldWarmRouteOnTrigger('/settings', true, 'idle', false)).toBe(true)
    expect(shouldWarmRouteOnTrigger('/login/callback', true, 'pointer', false)).toBe(false)
    expect(shouldWarmRouteOnTrigger('/store/items/123/consume', true, 'focus', false)).toBe(false)
  })

  it('renders and clears warmup markup through the controller', () => {
    const documentRef = createTestDocument()
    const controller = createRouteWarmupController({
      documentRef: documentRef as never,
      origin: 'https://prometheus.prod',
      nonce: null
    })

    controller.setIdlePrefetchUrls(['/store?lang=en', '/store?lang=en', 'https://example.com/elsewhere'])
    controller.warmTarget('/chat?lang=en', false)

    const warmupLinks = documentRef
      .querySelectorAll('link[rel="prefetch"][data-route-prefetch="shell"]')
      .map((link) => link.href)

    expect(warmupLinks).toEqual([
      'https://prometheus.prod/store?lang=en',
      'https://prometheus.prod/chat?lang=en'
    ])

    controller.dispose()
    expect(documentRef.querySelectorAll('link[rel="prefetch"][data-route-prefetch="shell"]').length).toBe(0)
  })
})
