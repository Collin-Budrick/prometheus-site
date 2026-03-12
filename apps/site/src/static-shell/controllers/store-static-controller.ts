import type { StaticFragmentRouteData } from '../fragment-static-data'
import { setTrustedInnerHtml } from '../../security/client'
import type { StoreSeed } from '../../shared/store-seed'
import {
  createStoreItemDirect,
  deleteStoreItemDirect,
  executeStoreCommandDirect,
  subscribeStoreInventory,
  type StoreInventoryItem,
  type StoreInventorySnapshot
} from '../../shared/spacetime-store'

type StoreStaticControllerContext = {
  routeData: StaticFragmentRouteData
}

type StoreCreateStatus = 'idle' | 'saving' | 'success' | 'error'

type StoreCreateState = {
  digital: boolean
  message: string | null
  name: string
  price: string
  quantity: string
  status: StoreCreateStatus
}

type StoreCartSnapshotItem = {
  id: number
  name: string
  price: number
  qty: number
}

type StoreStaticState = {
  cart: StoreCartSnapshotItem[]
  destroyed: boolean
  form: StoreCreateState
  inventory: StoreInventorySnapshot
  observer: MutationObserver | null
  pendingAddIds: Set<number>
  pendingDeleteIds: Set<number>
  pendingRemoveIds: Set<number>
  query: string
  renderQueued: boolean
}

const emptyInventorySnapshot: StoreInventorySnapshot = {
  error: null,
  items: [],
  status: 'idle'
}

const storeCartSnapshotStorageKey = 'store-cart-snapshot'
const storeCartSnapshotCookieKey = 'prom-store-cart'

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const formatPrice = (value: number) => `$${value.toFixed(2)}`
const formatQuantity = (value: number) => (value < 0 ? 'infinite' : `${value}`)

const parseNumberInput = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const parseIntegerInput = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeInventoryItem = (value: unknown): StoreInventoryItem | null => {
  if (!isRecord(value)) return null
  const id = Number(value.id)
  const price = Number(value.price)
  const quantity = Number(value.quantity)
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!Number.isFinite(id) || id <= 0) return null
  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return null
  return {
    id,
    name: name || `Item ${id}`,
    price,
    quantity
  }
}

const normalizeStoreCartSnapshotItem = (value: unknown): StoreCartSnapshotItem | null => {
  if (!isRecord(value)) return null
  const id = Number(value.id)
  const price = Number(value.price)
  const qty = Number(value.qty)
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!Number.isFinite(id) || id <= 0) return null
  if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null
  return {
    id,
    name: name || `Item ${id}`,
    price,
    qty: Math.floor(qty)
  }
}

const serializeStoreCartSnapshot = (items: StoreCartSnapshotItem[]) =>
  JSON.stringify({
    version: 1,
    items
  })

const writeStoreCartSnapshotCookie = (items: StoreCartSnapshotItem[]) => {
  if (typeof document === 'undefined') return
  if (!items.length) {
    document.cookie = `${storeCartSnapshotCookieKey}=; path=/; max-age=0; samesite=lax`
    return
  }
  try {
    const serialized = encodeURIComponent(serializeStoreCartSnapshot(items.slice(0, 60)))
    document.cookie = `${storeCartSnapshotCookieKey}=${serialized}; path=/; max-age=2592000; samesite=lax`
  } catch {
    // Ignore cookie persistence failures in preview runtime.
  }
}

const readStoredCartSnapshot = () => {
  if (typeof window === 'undefined') return [] as StoreCartSnapshotItem[]
  try {
    const raw = window.localStorage.getItem(storeCartSnapshotStorageKey)
    if (!raw) return [] as StoreCartSnapshotItem[]
    const parsed = JSON.parse(raw) as { items?: unknown[] } | unknown[]
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : []
    return items
      .map((entry) => normalizeStoreCartSnapshotItem(entry))
      .filter((entry): entry is StoreCartSnapshotItem => entry !== null)
  } catch {
    return [] as StoreCartSnapshotItem[]
  }
}

const persistStoreCartSnapshot = async (items: StoreCartSnapshotItem[]) => {
  if (typeof window === 'undefined') return
  const normalized = items
    .map((entry) => normalizeStoreCartSnapshotItem(entry))
    .filter((entry): entry is StoreCartSnapshotItem => entry !== null)
  try {
    if (normalized.length) {
      window.localStorage.setItem(storeCartSnapshotStorageKey, serializeStoreCartSnapshot(normalized))
    } else {
      window.localStorage.removeItem(storeCartSnapshotStorageKey)
    }
  } catch {
    // Ignore localStorage persistence failures in preview runtime.
  }
  writeStoreCartSnapshotCookie(normalized)
}

const cloneCartItems = (items: StoreCartSnapshotItem[]) =>
  items.map((item) => ({
    ...item
  }))

const readInitialCart = (routeData: StaticFragmentRouteData) => {
  const seedItems = routeData.storeSeed?.cart?.items
  const parsedSeedItems = Array.isArray(seedItems)
    ? seedItems
        .map((entry) => normalizeStoreCartSnapshotItem(entry))
        .filter((entry): entry is StoreCartSnapshotItem => entry !== null)
    : []
  const storedItems = readStoredCartSnapshot()
  if (storedItems.length > 0) return storedItems
  return parsedSeedItems
}

const readInitialInventory = (routeData: StaticFragmentRouteData) => {
  const items = routeData.storeSeed?.stream?.items
  if (!Array.isArray(items)) return [] as StoreInventoryItem[]
  return items
    .map((entry) => normalizeInventoryItem(entry))
    .filter((entry): entry is StoreInventoryItem => entry !== null)
}

const getFilteredInventoryItems = (state: StoreStaticState) => {
  const query = state.query.trim().toLowerCase()
  if (!query) return [...state.inventory.items]
  return state.inventory.items.filter((item) => {
    return (
      item.name.toLowerCase().includes(query) ||
      `${item.id}`.includes(query) ||
      `${item.price}`.includes(query)
    )
  })
}

const syncRouteData = (state: StoreStaticState, routeData: StaticFragmentRouteData) => {
  const query = state.query.trim()
  const filteredItems = getFilteredInventoryItems(state)
  const storeSeed: StoreSeed = {
    stream: {
      items: state.inventory.items.map((item) => ({ ...item })),
      query,
      searchMeta: query ? { query, total: filteredItems.length } : null,
      sort: 'id',
      dir: 'asc'
    },
    cart: {
      items: cloneCartItems(state.cart),
      queuedCount: 0
    }
  }
  routeData.storeSeed = storeSeed
}

const getStoreStreamRoot = () => document.querySelector<HTMLElement>('.store-stream')
const getStoreCreateRoot = () => document.querySelector<HTMLElement>('.store-create')
const getStoreCartRoot = () => document.querySelector<HTMLElement>('.store-cart')

const updateInventoryQuantity = (state: StoreStaticState, id: number, quantity: number) => {
  state.inventory = {
    ...state.inventory,
    items: state.inventory.items.map((item) => (item.id === id ? { ...item, quantity } : item))
  }
}

const upsertInventoryItem = (state: StoreStaticState, nextItem: StoreInventoryItem) => {
  const existingIndex = state.inventory.items.findIndex((item) => item.id === nextItem.id)
  const nextItems = [...state.inventory.items]
  if (existingIndex >= 0) {
    nextItems[existingIndex] = nextItem
  } else {
    nextItems.push(nextItem)
    nextItems.sort((left, right) => left.id - right.id)
  }
  state.inventory = {
    ...state.inventory,
    items: nextItems
  }
}

const removeInventoryItem = (state: StoreStaticState, id: number) => {
  state.inventory = {
    ...state.inventory,
    items: state.inventory.items.filter((item) => item.id !== id)
  }
}

const ensureStatusNode = (root: HTMLElement, className: string) => {
  let element = root.querySelector<HTMLElement>(`.${className}`)
  if (!element) {
    element = document.createElement('div')
    element.className = className
    root.append(element)
  }
  return element
}

const renderStoreStream = (state: StoreStaticState) => {
  const root = getStoreStreamRoot()
  if (!root) return

  const searchInput = root.querySelector<HTMLInputElement>('input[type="search"]')
  if (searchInput) {
    searchInput.removeAttribute('readonly')
    searchInput.value = state.query
  }

  const statusCopy =
    state.inventory.status === 'connecting'
      ? 'Connecting'
      : state.inventory.status === 'error'
        ? state.inventory.error ?? 'Stream error'
        : state.inventory.status === 'offline'
          ? 'Offline'
          : state.inventory.status === 'live'
            ? 'Live stream'
            : 'Idle'
  const statusLabel = root.querySelector<HTMLElement>('.sr-only')
  if (statusLabel) {
    statusLabel.textContent = statusCopy
  }

  root.dataset.state = state.inventory.status

  const filteredItems = getFilteredInventoryItems(state)
  const metaValues = root.querySelectorAll<HTMLElement>('.store-stream-meta span')
  if (metaValues.length >= 2) {
    metaValues[1].textContent = state.query.trim() ? `${filteredItems.length} results` : `${filteredItems.length} items`
  }

  const panel = root.querySelector<HTMLElement>('.store-stream-panel')
  if (!panel) return

  if (state.inventory.status === 'connecting' && filteredItems.length === 0) {
    setTrustedInnerHtml(panel, '<div class="store-stream-empty">Loading items...</div>', 'template')
    return
  }

  if (state.inventory.status === 'error' && filteredItems.length === 0) {
    setTrustedInnerHtml(
      panel,
      `<div class="store-stream-empty">${escapeHtml(state.inventory.error ?? 'Stream error')}</div>`,
      'template'
    )
    return
  }

  if (filteredItems.length === 0) {
    const label = state.query.trim() ? 'No matches yet.' : 'Catalog is empty.'
    setTrustedInnerHtml(panel, `<div class="store-stream-empty">${escapeHtml(label)}</div>`, 'template')
    return
  }

  setTrustedInnerHtml(
    panel,
    filteredItems
      .map((item, index) => {
        const isDeleting = state.pendingDeleteIds.has(item.id)
        const isAdding = state.pendingAddIds.has(item.id)
        const isOutOfStock = item.quantity === 0
        const addLabel = isOutOfStock ? 'Out of stock' : isAdding ? 'Adding...' : 'Add to cart'
        const deleteLabel = isDeleting ? 'Deleting...' : 'Delete item'

        return `<div class="store-stream-row${isDeleting ? ' is-deleting' : ''}" role="listitem" data-item-id="${item.id}" style="--stagger-index:${index}"><button class="store-stream-delete" type="button" data-store-delete="${item.id}" aria-label="${escapeHtml(deleteLabel)}" title="${escapeHtml(deleteLabel)}"${isDeleting ? ' disabled' : ''}>X</button><div><div class="store-stream-row-title">${escapeHtml(item.name)}</div><div class="store-stream-row-meta"><span>ID ${item.id}</span><span>Qty ${escapeHtml(formatQuantity(item.quantity))}</span></div></div><div class="store-stream-row-meta store-stream-row-meta-secondary"><button class="store-stream-add${isOutOfStock ? ' is-out' : ''}" type="button" data-store-add="${item.id}" aria-label="${escapeHtml(addLabel)}" title="${escapeHtml(addLabel)}"${isOutOfStock || isAdding ? ' disabled' : ''}>${escapeHtml(addLabel)}</button><span class="store-stream-row-price">${escapeHtml(formatPrice(item.price))}</span></div></div>`
      })
      .join(''),
    'template'
  )
}

const canSubmitCreateForm = (state: StoreStaticState) => {
  if (state.form.status === 'saving') return false
  if (state.form.name.trim().length < 2) return false
  const price = parseNumberInput(state.form.price)
  if (!Number.isFinite(price) || price < 0) return false
  if (state.form.digital) return true
  const quantity = parseIntegerInput(state.form.quantity)
  return Number.isFinite(quantity) && quantity > 0
}

const renderStoreCreateForm = (state: StoreStaticState) => {
  const root = getStoreCreateRoot()
  if (!root) return

  root.dataset.state = state.form.status

  const nameInput = root.querySelector<HTMLInputElement>('input[name="name"]')
  const priceInput = root.querySelector<HTMLInputElement>('input[name="price"]')
  const quantityInput = root.querySelector<HTMLInputElement>('input[name="quantity"]')
  const digitalInput = root.querySelector<HTMLInputElement>('.store-create-digital input[type="checkbox"]')
  const submitButton = root.querySelector<HTMLButtonElement>('.store-create-submit')

  if (nameInput) {
    nameInput.removeAttribute('readonly')
    nameInput.value = state.form.name
  }
  if (priceInput) {
    priceInput.removeAttribute('readonly')
    priceInput.value = state.form.price
  }
  if (quantityInput) {
    quantityInput.removeAttribute('readonly')
    quantityInput.disabled = state.form.digital
    quantityInput.value = state.form.digital ? '-1' : state.form.quantity
  }
  if (digitalInput) {
    digitalInput.disabled = false
    digitalInput.checked = state.form.digital
  }
  if (submitButton) {
    submitButton.disabled = !canSubmitCreateForm(state)
    submitButton.textContent = state.form.status === 'saving' ? 'Saving...' : 'Add item'
  }

  const statusNode = ensureStatusNode(root, 'store-create-status')
  statusNode.hidden = !state.form.message
  statusNode.setAttribute('aria-live', 'polite')
  statusNode.textContent = state.form.message ?? ''
}

const renderStoreCart = (state: StoreStaticState) => {
  const root = getStoreCartRoot()
  if (!root) return

  root.dataset.state = state.cart.length > 0 ? 'filled' : 'empty'

  const totalValue = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const totalNode = root.querySelector<HTMLElement>('.store-cart-total strong')
  if (totalNode) {
    totalNode.textContent = formatPrice(totalValue)
  }

  const dropzone = root.querySelector<HTMLElement>('.store-cart-dropzone')
  if (!dropzone) return

  if (state.cart.length === 0) {
    setTrustedInnerHtml(
      dropzone,
      '<div class="store-cart-drop-hint" aria-hidden="true">Drop to add</div>' +
        '<div class="store-cart-empty">Cart is empty.</div>',
      'template'
    )
    return
  }

  setTrustedInnerHtml(
    dropzone,
    '<div class="store-cart-drop-hint" aria-hidden="true">Drop to add</div>' +
      `<div class="store-cart-list" role="list">${state.cart
        .map((item, index) => {
          const isRemoving = state.pendingRemoveIds.has(item.id)
          const removeLabel = isRemoving ? 'Removing...' : 'Remove item'
          return `<div class="store-cart-item${isRemoving ? ' is-removing' : ''}" role="listitem" data-cart-id="${item.id}" style="--stagger-index:${index}"><button class="store-cart-remove" type="button" data-cart-remove="${item.id}" aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}"${isRemoving ? ' disabled' : ''}>X</button><div class="store-cart-item-title">${escapeHtml(item.name)}</div><div class="store-cart-item-meta"><span>ID ${item.id}</span></div><div class="store-cart-item-footer"><span class="store-cart-qty">Qty ${item.qty}</span><span class="store-cart-price">${escapeHtml(formatPrice(item.price * item.qty))}</span></div></div>`
        })
        .join('')}</div>`,
    'template'
  )
}

const attachObserver = (state: StoreStaticState, routeData: StaticFragmentRouteData, scheduleRender: () => void) => {
  state.observer?.disconnect()
  const root = document.querySelector<HTMLElement>('[data-static-fragment-root]')
  if (!root) return
  state.observer = new MutationObserver(() => {
    if (state.destroyed) return
    syncRouteData(state, routeData)
    scheduleRender()
  })
  state.observer.observe(root, {
    childList: true,
    subtree: true
  })
}

const renderAll = (state: StoreStaticState, routeData: StaticFragmentRouteData, scheduleRender: () => void) => {
  if (state.destroyed) return
  syncRouteData(state, routeData)
  state.observer?.disconnect()
  renderStoreStream(state)
  renderStoreCreateForm(state)
  renderStoreCart(state)
  attachObserver(state, routeData, scheduleRender)
}

const createScheduler = (state: StoreStaticState, routeData: StaticFragmentRouteData) => {
  function scheduleRender() {
    if (state.destroyed || state.renderQueued) return
    state.renderQueued = true
    window.requestAnimationFrame(() => {
      state.renderQueued = false
      renderAll(state, routeData, scheduleRender)
    })
  }

  return scheduleRender
}

const persistCart = async (state: StoreStaticState) => {
  await persistStoreCartSnapshot(cloneCartItems(state.cart))
}

const addCartItem = (state: StoreStaticState, item: StoreInventoryItem) => {
  const existingIndex = state.cart.findIndex((entry) => entry.id === item.id)
  if (existingIndex >= 0) {
    const next = cloneCartItems(state.cart)
    next[existingIndex] = {
      ...next[existingIndex],
      qty: next[existingIndex].qty + 1
    }
    state.cart = next
    return
  }

  state.cart = [...cloneCartItems(state.cart), { id: item.id, name: item.name, price: item.price, qty: 1 }]
}

const setCreateFormMessage = (state: StoreStaticState, status: StoreCreateStatus, message: string | null) => {
  state.form = {
    ...state.form,
    message,
    status
  }
}

const handleAddToCart = async (state: StoreStaticState, id: number, scheduleRender: () => void) => {
  if (state.pendingAddIds.has(id)) return
  const item = state.inventory.items.find((entry) => entry.id === id)
  if (!item || item.quantity === 0) return

  state.pendingAddIds.add(id)
  scheduleRender()

  try {
    const result = await executeStoreCommandDirect({ type: 'consume', id })
    if (result.ok) {
      addCartItem(state, item)
      if (result.item) {
        updateInventoryQuantity(state, result.item.id, result.item.quantity)
      }
      await persistCart(state)
    }
  } finally {
    state.pendingAddIds.delete(id)
    scheduleRender()
  }
}

const handleRemoveFromCart = async (state: StoreStaticState, id: number, scheduleRender: () => void) => {
  if (state.pendingRemoveIds.has(id)) return
  const item = state.cart.find((entry) => entry.id === id)
  if (!item) return

  state.pendingRemoveIds.add(id)
  scheduleRender()

  try {
    const result = await executeStoreCommandDirect({ type: 'restore', id, amount: item.qty })
    if (result.ok) {
      state.cart = state.cart.filter((entry) => entry.id !== id)
      if (result.item) {
        updateInventoryQuantity(state, result.item.id, result.item.quantity)
      }
      await persistCart(state)
    }
  } finally {
    state.pendingRemoveIds.delete(id)
    scheduleRender()
  }
}

const handleDeleteItem = async (state: StoreStaticState, id: number, scheduleRender: () => void) => {
  if (state.pendingDeleteIds.has(id)) return

  state.pendingDeleteIds.add(id)
  scheduleRender()

  try {
    await deleteStoreItemDirect(id)
    removeInventoryItem(state, id)
    if (state.cart.some((entry) => entry.id === id)) {
      state.cart = state.cart.filter((entry) => entry.id !== id)
      await persistCart(state)
    }
  } finally {
    state.pendingDeleteIds.delete(id)
    scheduleRender()
  }
}

const handleCreateSubmit = async (state: StoreStaticState, scheduleRender: () => void) => {
  if (!canSubmitCreateForm(state)) return

  setCreateFormMessage(state, 'saving', null)
  scheduleRender()

  try {
    const created = await createStoreItemDirect({
      name: state.form.name.trim(),
      price: parseNumberInput(state.form.price),
      quantity: state.form.digital ? -1 : parseIntegerInput(state.form.quantity)
    })

    if (created) {
      upsertInventoryItem(state, created)
    }

    state.form = {
      digital: false,
      message: created ? `Added item #${created.id}` : 'Item created.',
      name: '',
      price: '',
      quantity: '1',
      status: 'success'
    }
  } catch (error) {
    setCreateFormMessage(state, 'error', error instanceof Error ? error.message : 'Request failed')
  } finally {
    scheduleRender()
  }
}

export const activateStoreStaticController = async ({ routeData }: StoreStaticControllerContext) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  const state: StoreStaticState = {
    cart: readInitialCart(routeData),
    destroyed: false,
    form: {
      digital: false,
      message: null,
      name: '',
      price: '',
      quantity: '1',
      status: 'idle'
    },
    inventory: {
      ...emptyInventorySnapshot,
      items: readInitialInventory(routeData)
    },
    observer: null,
    pendingAddIds: new Set<number>(),
    pendingDeleteIds: new Set<number>(),
    pendingRemoveIds: new Set<number>(),
    query: routeData.storeSeed?.stream?.query?.trim() ?? '',
    renderQueued: false
  }

  const scheduleRender = createScheduler(state, routeData)

  const handleClick = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const addButton = target.closest<HTMLElement>('[data-store-add]')
    if (addButton) {
      const id = Number(addButton.dataset.storeAdd)
      if (Number.isFinite(id) && id > 0) {
        void handleAddToCart(state, id, scheduleRender)
      }
      return
    }

    const deleteButton = target.closest<HTMLElement>('[data-store-delete]')
    if (deleteButton) {
      const id = Number(deleteButton.dataset.storeDelete)
      if (Number.isFinite(id) && id > 0) {
        void handleDeleteItem(state, id, scheduleRender)
      }
      return
    }

    const removeButton = target.closest<HTMLElement>('[data-cart-remove]')
    if (removeButton) {
      const id = Number(removeButton.dataset.cartRemove)
      if (Number.isFinite(id) && id > 0) {
        void handleRemoveFromCart(state, id, scheduleRender)
      }
      return
    }

    if (target.closest('.store-create-submit')) {
      event.preventDefault()
      void handleCreateSubmit(state, scheduleRender)
    }
  }

  const handleInput = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return

    if (target.matches('.store-stream input[type="search"]')) {
      state.query = target.value
      scheduleRender()
      return
    }

    if (target.matches('.store-create input[name="name"]')) {
      state.form = { ...state.form, message: null, name: target.value, status: 'idle' }
      scheduleRender()
      return
    }

    if (target.matches('.store-create input[name="price"]')) {
      state.form = { ...state.form, message: null, price: target.value, status: 'idle' }
      scheduleRender()
      return
    }

    if (target.matches('.store-create input[name="quantity"]')) {
      state.form = { ...state.form, message: null, quantity: target.value, status: 'idle' }
      scheduleRender()
    }
  }

  const handleChange = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    if (!target.matches('.store-create .store-create-digital input[type="checkbox"]')) return

    state.form = {
      ...state.form,
      digital: target.checked,
      message: null,
      quantity: target.checked ? '-1' : state.form.quantity === '-1' ? '1' : state.form.quantity,
      status: 'idle'
    }
    scheduleRender()
  }

  document.addEventListener('click', handleClick)
  document.addEventListener('input', handleInput)
  document.addEventListener('change', handleChange)

  const unsubscribe = subscribeStoreInventory((snapshot) => {
    if (state.destroyed) return
    state.inventory = snapshot
    scheduleRender()
  })

  syncRouteData(state, routeData)
  renderAll(state, routeData, scheduleRender)

  return () => {
    state.destroyed = true
    state.observer?.disconnect()
    unsubscribe()
    document.removeEventListener('click', handleClick)
    document.removeEventListener('input', handleInput)
    document.removeEventListener('change', handleChange)
  }
}
