import { $, Resource, component$, noSerialize, useResource$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { Component, NoSerialize, QRL } from '@builder.io/qwik'
import type { RenderNode } from '@core/fragments'
import { sanitizeAttributes } from '@core/fragments'
import {
  getPlannerDemoCopy,
  getPreactIslandCopy,
  getReactBinaryDemoCopy,
  getUiCopy,
  getWasmRendererDemoCopy
} from '../../lang/client'
import { HomeDemoPreview, type HomeDemoKind } from '../../components/HomeDemoPreview'
import { StoreStream } from '../../components/StoreStream'
import { StoreCreateForm } from '../../components/StoreCreateForm'
import { StoreCart } from '../../components/StoreCart'
import { ContactInvites } from '../../components/ContactInvites'
import { useSharedLangSignal } from '../../shared/lang-bridge'
import type { Lang } from '../../shared/lang-store'
import {
  beginInitialTask,
  failInitialTask,
  finishInitialTask,
  getFragmentInitialTaskKey,
  markInitialTasksComplete,
  resolveFragmentInitialTaskHost
} from './initial-settle'

type NodeProps = {
  node: RenderNode
}

type VoidTag =
  | 'area'
  | 'base'
  | 'br'
  | 'col'
  | 'embed'
  | 'hr'
  | 'img'
  | 'input'
  | 'link'
  | 'meta'
  | 'param'
  | 'source'
  | 'track'
  | 'wbr'

const voidTags = new Set<VoidTag>([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

const isVoidTag = (tag: string): tag is VoidTag => voidTags.has(tag as VoidTag)

type LazyComponentLoader<Props> = () => Promise<Component<Props>>

const loadPreactIsland: LazyComponentLoader<{ label?: string }> = () =>
  import('../../components/PreactIsland').then((mod) => mod.PreactIsland)

const loadReactBinaryDemo: LazyComponentLoader<Record<string, never>> = () =>
  import('../../components/ReactBinaryDemo').then((mod) => mod.ReactBinaryDemo)

const loadWasmRendererDemo: LazyComponentLoader<Record<string, never>> = () =>
  import('../../components/WasmRendererDemo').then((mod) => mod.WasmRendererDemo)

const loadPlannerDemo: LazyComponentLoader<Record<string, never>> = () =>
  import('../../components/PlannerDemo').then((mod) => mod.PlannerDemo)

const loadHomeDemoComponent = (kind: HomeDemoKind): Promise<Component<any>> => {
  switch (kind) {
    case 'preact-island':
      return loadPreactIsland()
    case 'react-binary':
      return loadReactBinaryDemo()
    case 'wasm-renderer':
      return loadWasmRendererDemo()
    case 'planner':
      return loadPlannerDemo()
  }
}

type HomeDemoPreviewProps = {
  kind: HomeDemoKind
  activating: boolean
  lang: Lang
  onActivate$: QRL<() => void>
}

const renderHomeDemoPreview = ({ kind, activating, lang, onActivate$ }: HomeDemoPreviewProps) => {
  const ui = getUiCopy(lang)
  return (
    <HomeDemoPreview
      kind={kind}
      ui={{
        demoActivate: ui.demoActivate,
        demoActivating: ui.demoActivating
      }}
      planner={getPlannerDemoCopy(lang)}
      wasmRenderer={getWasmRendererDemoCopy(lang)}
      reactBinary={getReactBinaryDemoCopy(lang)}
      preactIsland={getPreactIslandCopy(lang)}
      activating={activating}
      onActivate$={onActivate$}
    />
  )
}

const LazyFragmentComponent = component$<{
  loader: LazyComponentLoader<any>
  props?: Record<string, unknown>
}>(({ loader, props }) => {
  const rootRef = useSignal<HTMLElement>()
  const taskKey = useSignal<string | null>(null)
  const loadState = useSignal<'pending' | 'ready' | 'error'>('pending')
  const resource = useResource$<Component<any>>(async ({ track }) => {
    track(() => loader)
    loadState.value = 'pending'
    try {
      const resolved = await loader()
      loadState.value = 'ready'
      return resolved
    } catch (error) {
      loadState.value = 'error'
      throw error
    }
  })

  useVisibleTask$(
    (ctx) => {
      const root = rootRef.value
      ctx.track(() => rootRef.value)
      if (!root) return
      const host = resolveFragmentInitialTaskHost(root)
      if (!host) return
      const key = getFragmentInitialTaskKey('lazy', root)
      taskKey.value = key
      if (loadState.value === 'pending') {
        beginInitialTask(host, key)
      } else {
        markInitialTasksComplete(host)
      }
      ctx.cleanup(() => {
        if (loadState.value !== 'ready' && loadState.value !== 'error') {
          failInitialTask(host, key)
        }
      })
    },
    { strategy: 'document-ready' }
  )

  useVisibleTask$(
    (ctx) => {
      const state = ctx.track(() => loadState.value)
      const root = rootRef.value
      const key = taskKey.value
      if (!root || !key) return
      const host = resolveFragmentInitialTaskHost(root)
      if (!host) return
      if (state === 'ready') {
        finishInitialTask(host, key)
        markInitialTasksComplete(host)
      } else if (state === 'error') {
        failInitialTask(host, key)
        markInitialTasksComplete(host)
      }
    },
    { strategy: 'document-ready' }
  )

  return (
    <div ref={rootRef} class="fragment-lazy-root" data-fragment-lazy-state={loadState.value}>
      <Resource
        value={resource}
        onPending={() => (
          <div class="fragment-placeholder is-loading" role="status" aria-live="polite">
            <div class="loader" aria-hidden="true" />
          </div>
        )}
        onResolved={(ResolvedComponent) => <ResolvedComponent {...props} />}
      />
    </div>
  )
})

const HomeDemoActivationBoundary = component$<{
  kind: HomeDemoKind
  label?: string
}>(({ kind, label }) => {
  const langSignal = useSharedLangSignal()
  const active = useSignal(false)
  const loadState = useSignal<'idle' | 'pending' | 'ready' | 'error'>('idle')
  const resolvedComponent = useSignal<NoSerialize<Component<any>> | null>(null)
  const handleActivate = $(() => {
    if (loadState.value === 'pending') return
    if (loadState.value === 'error') {
      resolvedComponent.value = null
      loadState.value = 'idle'
    }
    active.value = true
  })

  useVisibleTask$(
    async (ctx) => {
      const isActive = ctx.track(() => active.value)
      const state = ctx.track(() => loadState.value)
      let cancelled = false
      ctx.cleanup(() => {
        cancelled = true
      })

      if (!isActive || state === 'pending' || state === 'ready') {
        return
      }
      loadState.value = 'pending'

      try {
        const component = await loadHomeDemoComponent(kind)
        if (cancelled) return
        resolvedComponent.value = noSerialize(component)
        loadState.value = 'ready'
      } catch (error) {
        if (cancelled) return
        active.value = false
        loadState.value = 'error'
        console.error(`Failed to load home demo component: ${kind}`, error)
      }
    },
    { strategy: 'document-ready' }
  )

  const ResolvedComponent = resolvedComponent.value as Component<any> | null
  if (loadState.value === 'ready' && ResolvedComponent) {
    return kind === 'preact-island' ? <ResolvedComponent label={label} /> : <ResolvedComponent />
  }

  return renderHomeDemoPreview({
    kind,
    activating: loadState.value === 'pending',
    lang: langSignal.value,
    onActivate$: handleActivate
  })
})

export const FragmentRenderer = component$(({ node }: NodeProps) => {
  if (node.type === 'text') {
    return <>{node.text ?? ''}</>
  }

  if (node.tag === 'preact-island') {
    return <HomeDemoActivationBoundary kind="preact-island" label={node.attrs?.label} />
  }

  if (node.tag === 'react-binary-demo') {
    return <HomeDemoActivationBoundary kind="react-binary" />
  }

  if (node.tag === 'wasm-renderer-demo') {
    return <HomeDemoActivationBoundary kind="wasm-renderer" />
  }

  if (node.tag === 'planner-demo') {
    return <HomeDemoActivationBoundary kind="planner" />
  }

  if (node.tag === 'store-stream') {
    return (
      <StoreStream
        class={node.attrs?.class}
        limit={node.attrs?.['data-limit']}
        placeholder={node.attrs?.['data-placeholder']}
      />
    )
  }

  if (node.tag === 'store-create') {
    return (
      <StoreCreateForm
        class={node.attrs?.class}
        nameLabel={node.attrs?.['data-name-label']}
        priceLabel={node.attrs?.['data-price-label']}
        quantityLabel={node.attrs?.['data-quantity-label']}
        submitLabel={node.attrs?.['data-submit-label']}
        helper={node.attrs?.['data-helper']}
        namePlaceholder={node.attrs?.['data-name-placeholder']}
        pricePlaceholder={node.attrs?.['data-price-placeholder']}
        quantityPlaceholder={node.attrs?.['data-quantity-placeholder']}
      />
    )
  }

  if (node.tag === 'store-cart') {
    return (
      <StoreCart
        class={node.attrs?.class}
        title={node.attrs?.['data-title']}
        helper={node.attrs?.['data-helper']}
        empty={node.attrs?.['data-empty']}
        totalLabel={node.attrs?.['data-total']}
        dropLabel={node.attrs?.['data-drop']}
        removeLabel={node.attrs?.['data-remove']}
      />
    )
  }

  if (node.tag === 'contact-invites') {
    return (
      <ContactInvites
        class={node.attrs?.class}
        title={node.attrs?.['data-title']}
        helper={node.attrs?.['data-helper']}
        searchLabel={node.attrs?.['data-search-label']}
        searchPlaceholder={node.attrs?.['data-search-placeholder']}
        searchActionLabel={node.attrs?.['data-search-action']}
        inviteActionLabel={node.attrs?.['data-invite-action']}
        acceptActionLabel={node.attrs?.['data-accept-action']}
        declineActionLabel={node.attrs?.['data-decline-action']}
        removeActionLabel={node.attrs?.['data-remove-action']}
        incomingLabel={node.attrs?.['data-incoming-label']}
        outgoingLabel={node.attrs?.['data-outgoing-label']}
        contactsLabel={node.attrs?.['data-contacts-label']}
        emptyLabel={node.attrs?.['data-empty-label']}
      />
    )
  }

  const tagName = (node.tag || 'div') as keyof HTMLElementTagNameMap
  const children = node.children?.map((child, index) => <FragmentRenderer key={index} node={child} />)
  const props = { ...sanitizeAttributes(node.attrs) }
  const isCriticalImage = node.attrs?.['data-critical'] === 'true'

  if (tagName === 'img') {
    if (!props.loading && !isCriticalImage) {
      props.loading = 'lazy'
    }
    if (!props.decoding && !isCriticalImage) {
      props.decoding = 'async'
    }
    if (isCriticalImage) {
      props.fetchpriority = 'high'
    }
  }

  if (isVoidTag(tagName)) {
    const VoidTag = tagName as any
    return <VoidTag {...props} />
  }

  const Tag = tagName as any
  return <Tag {...props}>{children}</Tag>
})
