import { component$, render, useVisibleTask$, type RenderResult, type Signal } from '@builder.io/qwik'

type FragmentShellIslandsProps = {
  gridRef: Signal<HTMLDivElement | undefined>
}

type IslandDefinition = {
  load: () => Promise<any>
  readProps?: (el: HTMLElement) => Record<string, string>
}

const readAttr = (el: HTMLElement, name: string) => {
  const value = el.getAttribute(name)
  if (value === null) return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const buildProps = (el: HTMLElement, mapping: Record<string, string>) => {
  const props: Record<string, string> = {}
  Object.entries(mapping).forEach(([prop, attr]) => {
    const value = readAttr(el, attr)
    if (value !== undefined) {
      props[prop] = value
    }
  })
  return props
}

const islandRegistry: Record<string, IslandDefinition> = {
  'preact-island': {
    load: async () => (await import('../../components/PreactIsland')).PreactIsland,
    readProps: (el) => buildProps(el, { label: 'label' })
  },
  'planner-demo': {
    load: async () => (await import('../../components/PlannerDemo')).PlannerDemo
  },
  'react-binary-demo': {
    load: async () => (await import('../../components/ReactBinaryDemo')).ReactBinaryDemo
  },
  'wasm-renderer-demo': {
    load: async () => (await import('../../components/WasmRendererDemo')).WasmRendererDemo
  },
  'store-stream': {
    load: async () => (await import('../../components/StoreStream')).StoreStream,
    readProps: (el) =>
      buildProps(el, {
        class: 'class',
        limit: 'data-limit',
        placeholder: 'data-placeholder'
      })
  },
  'store-create': {
    load: async () => (await import('../../components/StoreCreateForm')).StoreCreateForm,
    readProps: (el) =>
      buildProps(el, {
        class: 'class',
        nameLabel: 'data-name-label',
        priceLabel: 'data-price-label',
        quantityLabel: 'data-quantity-label',
        submitLabel: 'data-submit-label',
        helper: 'data-helper',
        namePlaceholder: 'data-name-placeholder',
        pricePlaceholder: 'data-price-placeholder',
        quantityPlaceholder: 'data-quantity-placeholder'
      })
  },
  'store-cart': {
    load: async () => (await import('../../components/StoreCart')).StoreCart,
    readProps: (el) =>
      buildProps(el, {
        class: 'class',
        title: 'data-title',
        helper: 'data-helper',
        empty: 'data-empty',
        totalLabel: 'data-total',
        dropLabel: 'data-drop',
        removeLabel: 'data-remove'
      })
  },
  'contact-invites': {
    load: async () => (await import('../../components/ContactInvites')).ContactInvites,
    readProps: (el) =>
      buildProps(el, {
        class: 'class',
        title: 'data-title',
        helper: 'data-helper',
        searchLabel: 'data-search-label',
        searchPlaceholder: 'data-search-placeholder',
        searchActionLabel: 'data-search-action',
        inviteActionLabel: 'data-invite-action',
        acceptActionLabel: 'data-accept-action',
        declineActionLabel: 'data-decline-action',
        removeActionLabel: 'data-remove-action',
        incomingLabel: 'data-incoming-label',
        outgoingLabel: 'data-outgoing-label',
        contactsLabel: 'data-contacts-label',
        emptyLabel: 'data-empty-label'
      })
  }
}

const islandSelector = Object.keys(islandRegistry).join(',')
const fragmentHostSelector = '[data-fragment-id]'
const hostIntersectionMargin = 200

const resolveIslands = (root: ParentNode) => {
  const matches: HTMLElement[] = []
  if (root instanceof HTMLElement && root.matches(islandSelector)) {
    matches.push(root)
  }
  root.querySelectorAll?.(islandSelector).forEach((element) => {
    matches.push(element as HTMLElement)
  })
  return matches
}

const resolveIslandHost = (element: HTMLElement) =>
  element.closest<HTMLElement>(fragmentHostSelector) ?? element

export const FragmentShellIslands = component$(({ gridRef }: FragmentShellIslandsProps) => {
  useVisibleTask$(
    (ctx) => {
      const grid = gridRef.value
      ctx.track(() => gridRef.value)
      if (!grid) return

      const mounted = new Map<HTMLElement, RenderResult>()
      const pending = new Set<HTMLElement>()
      const islandsByHost = new Map<HTMLElement, Set<HTMLElement>>()
      const observedHosts = new Set<HTMLElement>()
      const idleMounts = new Map<HTMLElement, () => void>()
      const isHostInView = (host: HTMLElement) => {
        if (typeof window === 'undefined') return false
        const rect = host.getBoundingClientRect()
        const margin = hostIntersectionMargin
        return (
          rect.bottom >= -margin &&
          rect.top <= window.innerHeight + margin &&
          rect.right >= -margin &&
          rect.left <= window.innerWidth + margin
        )
      }
      const mountHostIslands = (host: HTMLElement) => {
        const islands = islandsByHost.get(host)
        if (!islands) return
        islandsByHost.delete(host)
        const cancelIdle = idleMounts.get(host)
        if (cancelIdle) {
          cancelIdle()
          idleMounts.delete(host)
        }
        if (observedHosts.has(host)) {
          observer.unobserve(host)
          observedHosts.delete(host)
        }
        islands.forEach((element) => {
          void mountIsland(element, mounted, pending)
        })
      }
      const scheduleIdle = (callback: () => void) => {
        if ('requestIdleCallback' in window) {
          const handle = window.requestIdleCallback(callback, { timeout: 900 })
          return () => window.cancelIdleCallback(handle)
        }
        const handle = window.setTimeout(callback, 140)
        return () => window.clearTimeout(handle)
      }
      const scheduleHostMount = (host: HTMLElement) => {
        if (!islandsByHost.has(host)) return
        if (idleMounts.has(host)) return
        const cancel = scheduleIdle(() => {
          idleMounts.delete(host)
          if (!host.isConnected) return
          if (!isHostInView(host)) return
          mountHostIslands(host)
        })
        idleMounts.set(host, cancel)
      }
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const target = entry.target as HTMLElement
            if (!entry.isIntersecting) {
              const cancelIdle = idleMounts.get(target)
              if (cancelIdle) {
                cancelIdle()
                idleMounts.delete(target)
              }
              return
            }
            scheduleHostMount(target)
          })
        },
        { rootMargin: '200px 0px' }
      )

      const registerIsland = (element: HTMLElement) => {
        const host = resolveIslandHost(element)
        let set = islandsByHost.get(host)
        if (!set) {
          set = new Set()
          islandsByHost.set(host, set)
        }
        set.add(element)
        if (isHostInView(host)) {
          scheduleHostMount(host)
          return
        }
        if (!observedHosts.has(host)) {
          observer.observe(host)
          observedHosts.add(host)
        }
      }

      const observeIslands = (root: ParentNode) => {
        resolveIslands(root).forEach((element) => {
          if (mounted.has(element) || pending.has(element)) return
          if (element.dataset.fragmentIslandMounted) {
            element.removeAttribute('data-fragment-island-mounted')
          }
          registerIsland(element)
        })
      }

      const cleanupIslands = (root: ParentNode) => {
        resolveIslands(root).forEach((element) => {
          const result = mounted.get(element)
          if (result) {
            result.cleanup()
            mounted.delete(element)
          }
          pending.delete(element)
          element.removeAttribute('data-fragment-island-mounted')
          const host = resolveIslandHost(element)
          const set = islandsByHost.get(host)
          if (set) {
            set.delete(element)
            if (!set.size) {
              islandsByHost.delete(host)
              if (observedHosts.has(host)) {
                observer.unobserve(host)
                observedHosts.delete(host)
              }
            }
          }
        })
      }

      observeIslands(grid)

      const mutationObserver = new MutationObserver((records) => {
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return
            observeIslands(node)
          })
          record.removedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return
            cleanupIslands(node)
          })
        })
      })

      mutationObserver.observe(grid, { childList: true, subtree: true })
      const rescan = () => {
        observeIslands(grid)
      }
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          rescan()
        }
      }
      window.addEventListener('pageshow', rescan)
      document.addEventListener('visibilitychange', handleVisibilityChange)

      ctx.cleanup(() => {
        window.removeEventListener('pageshow', rescan)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        mutationObserver.disconnect()
        observer.disconnect()
        idleMounts.forEach((cancel) => cancel())
        idleMounts.clear()
        mounted.forEach((result) => result.cleanup())
        mounted.clear()
        pending.clear()
        islandsByHost.clear()
        observedHosts.clear()
      })
    },
    { strategy: 'document-ready' }
  )

  return null
})

const mountIsland = async (
  element: HTMLElement,
  mounted: Map<HTMLElement, RenderResult>,
  pending: Set<HTMLElement>
) => {
  if (mounted.has(element) || pending.has(element)) return
  const tagName = element.tagName.toLowerCase()
  const definition = islandRegistry[tagName]
  if (!definition) return
  pending.add(element)
  element.dataset.fragmentIslandMounted = 'pending'

  try {
    const Component = await definition.load()
    if (!element.isConnected) {
      element.removeAttribute('data-fragment-island-mounted')
      pending.delete(element)
      return
    }
    const props = definition.readProps ? definition.readProps(element) : {}
    const result = await render(element, <Component {...props} />)
    if (!element.isConnected) {
      result.cleanup()
      element.removeAttribute('data-fragment-island-mounted')
      pending.delete(element)
      return
    }
    mounted.set(element, result)
    element.dataset.fragmentIslandMounted = 'true'
    pending.delete(element)
  } catch (error) {
    element.dataset.fragmentIslandMounted = 'error'
    pending.delete(element)
    console.error(`[FragmentShellIslands] Failed to mount ${tagName}`, error)
  }
}
