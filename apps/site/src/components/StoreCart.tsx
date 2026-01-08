import { $, component$, noSerialize, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { NoSerialize } from '@builder.io/qwik'
import { getLanguagePack } from '../lang'
import { useSharedLangSignal } from '../shared/lang-bridge'
import {
  consumeStoreCartDragItem,
  normalizeStoreCartItem,
  storeCartAddEvent,
  type StoreCartItem
} from '../shared/store-cart'

type StoreCartProps = {
  class?: string
  title?: string
  helper?: string
  empty?: string
  totalLabel?: string
  dropLabel?: string
  removeLabel?: string
}

type CartLine = StoreCartItem & { qty: number }

const formatPrice = (value: number) => `$${value.toFixed(2)}`

const normalizeLabel = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

export const StoreCart = component$<StoreCartProps>(
  ({ class: className, title, helper, empty, totalLabel, dropLabel, removeLabel }) => {
    const langSignal = useSharedLangSignal()
    const cartItems = useSignal<CartLine[]>([])
    const removingIds = useSignal<number[]>([])
    const dragActive = useSignal(false)
    const listRef = useSignal<HTMLElement>()
    const totalRef = useSignal<HTMLElement>()
    const listPositions = useSignal<NoSerialize<Map<number, DOMRect>> | undefined>(undefined)
    const lastTotal = useSignal<number | null>(null)

    const fragmentCopy = useComputed$(() => getLanguagePack(langSignal.value).fragments ?? {})
    const copy = fragmentCopy.value
    const resolve = (value: string) => copy?.[value] ?? value

    const rootClass = useComputed$(() => {
      if (!className) return 'store-cart'
      return className.includes('store-cart') ? className : `store-cart ${className}`.trim()
    })

    const resolvedTitle = normalizeLabel(title ? resolve(title) : undefined, resolve('Cart'))
    const resolvedHelper = normalizeLabel(helper ? resolve(helper) : undefined, resolve('Drag items here or select them.'))
    const resolvedEmpty = normalizeLabel(empty ? resolve(empty) : undefined, resolve('Cart is empty.'))
    const resolvedTotal = normalizeLabel(totalLabel ? resolve(totalLabel) : undefined, resolve('Total'))
    const resolvedDrop = normalizeLabel(dropLabel ? resolve(dropLabel) : undefined, resolve('Drop to add'))
    const resolvedRemove = normalizeLabel(removeLabel ? resolve(removeLabel) : undefined, resolve('Remove item'))
    const qtyLabel = resolve('Qty')
    const idLabel = resolve('ID')

    const total = useComputed$(() =>
      cartItems.value.reduce((sum, item) => sum + item.price * item.qty, 0)
    )

    const addItem = $((item: StoreCartItem) => {
      const existingIndex = cartItems.value.findIndex((entry) => entry.id === item.id)
      if (existingIndex >= 0) {
        const next = [...cartItems.value]
        next[existingIndex] = { ...next[existingIndex], qty: next[existingIndex].qty + 1 }
        cartItems.value = next
        return
      }
      cartItems.value = [...cartItems.value, { ...item, qty: 1 }]
    })

    const scheduleRemoval = $((id: number) => {
      if (!Number.isFinite(id)) return
      if (removingIds.value.includes(id)) return
      const exists = cartItems.value.some((entry) => entry.id === id)
      if (!exists) return
      removingIds.value = [...removingIds.value, id]
      const delayMs = 240
      const finalize = () => {
        cartItems.value = cartItems.value.filter((entry) => entry.id !== id)
        removingIds.value = removingIds.value.filter((entry) => entry !== id)
      }
      if (typeof window === 'undefined') {
        finalize()
        return
      }
      window.setTimeout(finalize, delayMs)
    })

    const handleRemoveClick = $((id: number) => {
      void scheduleRemoval(id)
    })

    const handleDragOver = $((event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      dragActive.value = true
    })

    const handleDragEnter = $((event: DragEvent) => {
      if (event.currentTarget === event.target) {
        event.preventDefault()
        dragActive.value = true
      }
    })

    const handleDragLeave = $((event: DragEvent) => {
      if (event.currentTarget === event.target) {
        dragActive.value = false
      }
    })

    const handleDrop = $((event: DragEvent) => {
      event.preventDefault()
      dragActive.value = false
      const jsonPayload = event.dataTransfer?.getData('application/json') ?? ''
      const textPayload = event.dataTransfer?.getData('text/plain') ?? event.dataTransfer?.getData('text') ?? ''
      const raw = jsonPayload || textPayload
      let parsed: unknown = raw
      if (raw) {
        try {
          parsed = JSON.parse(raw)
        } catch {
          // ignore parse failures
        }
      }
      const item = normalizeStoreCartItem(parsed) ?? consumeStoreCartDragItem()
      if (item) {
        void addItem(item)
      }
    })

    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        const handler = (event: Event) => {
          const detail = (event as CustomEvent).detail
          const item = normalizeStoreCartItem(detail)
          if (item) {
            void addItem(item)
          }
        }
        window.addEventListener(storeCartAddEvent, handler)
        ctx.cleanup(() => window.removeEventListener(storeCartAddEvent, handler))
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        ctx.track(() => cartItems.value.map((item) => `${item.id}:${item.qty}`).join(','))
        const list = listRef.value
        if (!list) return
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const elements = Array.from(list.querySelectorAll<HTMLElement>('.store-cart-item'))
        const nextPositions = new Map<number, DOMRect>()

        elements.forEach((element) => {
          const id = Number(element.dataset.cartId)
          if (!Number.isFinite(id)) return
          nextPositions.set(id, element.getBoundingClientRect())
        })

        const previousPositions = listPositions.value
        if (previousPositions && previousPositions.size && !prefersReducedMotion) {
          elements.forEach((element) => {
            const id = Number(element.dataset.cartId)
            const first = previousPositions.get(id)
            const last = nextPositions.get(id)
            if (!first || !last) return
            const dx = first.left - last.left
            const dy = first.top - last.top
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
            element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
              duration: 320,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both'
            })
          })
        }

        listPositions.value = noSerialize(nextPositions)
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        ctx.track(() => total.value)
        const nextTotal = total.value

        if (lastTotal.value === null) {
          lastTotal.value = nextTotal
          return
        }

        if (nextTotal === lastTotal.value) return

        const element = totalRef.value
        if (!element) {
          lastTotal.value = nextTotal
          return
        }

        const direction = nextTotal > lastTotal.value ? 'up' : 'down'
        lastTotal.value = nextTotal

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          element.removeAttribute('data-change')
          return
        }

        element.removeAttribute('data-change')
        requestAnimationFrame(() => {
          element.dataset.change = direction
        })

        const timeout = window.setTimeout(() => {
          if (element.dataset.change === direction) {
            element.removeAttribute('data-change')
          }
        }, 520)

        ctx.cleanup(() => window.clearTimeout(timeout))
      },
      { strategy: 'document-ready' }
    )

    return (
      <div class={rootClass.value} data-state={cartItems.value.length > 0 ? 'filled' : 'empty'}>
        <div class="store-cart-header">
          <div>
            <p class="store-cart-title">{resolvedTitle}</p>
            <p class="store-cart-helper">{resolvedHelper}</p>
          </div>
          <div class="store-cart-total">
            <span>{resolvedTotal}</span>
            <strong ref={totalRef}>{formatPrice(total.value)}</strong>
          </div>
        </div>
        <div
          class={`store-cart-dropzone${dragActive.value ? ' is-active' : ''}`}
          onDragOver$={handleDragOver}
          onDragEnter$={handleDragEnter}
          onDragLeave$={handleDragLeave}
          onDrop$={handleDrop}
        >
          <div class="store-cart-drop-hint" aria-hidden="true">
            {resolvedDrop}
          </div>
          {cartItems.value.length === 0 ? (
            <div class="store-cart-empty">{resolvedEmpty}</div>
          ) : (
            <div class="store-cart-list" role="list" ref={listRef}>
              {cartItems.value.map((item, index) => (
                <div
                  key={item.id}
                  class={`store-cart-item${removingIds.value.includes(item.id) ? ' is-removing' : ''}`}
                  role="listitem"
                  data-cart-id={item.id}
                  style={{ '--stagger-index': String(index) }}
                >
                  <button
                    class="store-cart-remove"
                    type="button"
                    aria-label={resolvedRemove}
                    title={resolvedRemove}
                    onClick$={() => handleRemoveClick(item.id)}
                  >
                    X
                  </button>
                  <div class="store-cart-item-title">{item.name}</div>
                  <div class="store-cart-item-meta">
                    <span>
                      {idLabel} {item.id}
                    </span>
                  </div>
                  <div class="store-cart-item-footer">
                    <span class="store-cart-qty">{qtyLabel} {item.qty}</span>
                    <span class="store-cart-price">{formatPrice(item.price * item.qty)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
)
