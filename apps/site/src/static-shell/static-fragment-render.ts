import { h, renderToHtml, t } from '@core/fragment/tree'
import type { FragmentPayload, RenderNode } from '../fragment/types'
import type { ContactInvitesSeed } from '../shared/contact-invites-seed'
import type { StoreSeed } from '../shared/store-seed'

type StaticFragmentRenderContext = {
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
}

type StaticStoreItem = {
  id: number
  name: string
  price: number
  quantity: number
  score?: number
}

type StaticCartItem = {
  id: number
  name: string
  price: number
  qty: number
}

type StaticInviteUser = {
  id: string
  email: string
  name?: string | null
}

type StaticInvite = {
  id: string
  user: StaticInviteUser
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const toInteger = (value: unknown) => {
  const parsed = Math.floor(toNumber(value))
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeStoreItem = (value: unknown): StaticStoreItem | null => {
  if (!isRecord(value)) return null
  const id = toInteger(value.id)
  if (id <= 0) return null
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : `Item ${id}`
  const price = toNumber(value.price)
  const quantity = Math.max(0, toInteger(value.quantity))
  const scoreRaw = toNumber(value.score)
  const score = Number.isFinite(scoreRaw) && scoreRaw > 0 ? scoreRaw : undefined
  return { id, name, price, quantity, score }
}

const normalizeCartItem = (value: unknown): StaticCartItem | null => {
  if (!isRecord(value)) return null
  const base = normalizeStoreItem(value)
  if (!base) return null
  const qty = Math.max(0, toInteger(value.qty))
  if (qty <= 0) return null
  return { ...base, qty }
}

const normalizeInvite = (value: unknown): StaticInvite | null => {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const user = isRecord(value.user) ? value.user : null
  if (!id || !user) return null
  const userId = typeof user.id === 'string' ? user.id : ''
  const email = typeof user.email === 'string' ? user.email : ''
  if (!userId || !email) return null
  const name = typeof user.name === 'string' ? user.name : null
  return {
    id,
    user: {
      id: userId,
      email,
      name
    }
  }
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0)

const resolveAvatarText = (user: StaticInviteUser) => {
  const source = user.name?.trim() || user.email || user.id
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('') || 'U'
}

const resolveInviteDisplayName = (user: StaticInviteUser) => user.name?.trim() || user.email || user.id
const resolveInviteMeta = (user: StaticInviteUser) => (user.name ? user.email : user.id)

const renderStoreStreamNode = (attrs: Record<string, string> | undefined, context: StaticFragmentRenderContext): RenderNode => {
  const items = Array.isArray(context.storeSeed?.stream?.items)
    ? context.storeSeed?.stream?.items.map(normalizeStoreItem).filter((item): item is StaticStoreItem => item !== null)
    : []
  const limit = Math.max(1, toInteger(attrs?.['data-limit']) || 12)
  const visibleItems = items.slice(0, limit)
  const query = context.storeSeed?.stream?.query?.trim() ?? ''
  const total = context.storeSeed?.stream?.searchMeta?.total ?? visibleItems.length
  const queuedCount = context.storeSeed?.cart?.queuedCount ?? 0
  const placeholder = attrs?.['data-placeholder'] ?? 'Search the store...'
  const emptyLabel = query ? 'No matching items.' : 'Catalog is empty.'

  return h('div', {
    class: attrs?.class ?? 'store-stream',
    'data-state': 'idle',
    'data-mode': query ? 'search' : 'browse'
  }, [
    h('div', { class: 'store-stream-controls' }, [
      h('div', { class: 'store-stream-search' }, [
        h('div', { class: 'store-stream-field' }, [
          h('input', {
            type: 'search',
            placeholder,
            value: query,
            readonly: true,
            'aria-label': placeholder
          }),
          h('div', { class: 'store-stream-field-status', 'aria-live': 'polite' }, [
            h('span', { class: 'store-stream-status-dot', 'aria-hidden': 'true' }),
            h('span', { class: 'sr-only' }, [t(query ? 'Search snapshot' : 'Live snapshot')])
          ])
        ]),
        query ? h('button', { class: 'store-stream-clear', type: 'button', disabled: true }, [t('Clear')]) : null
      ]),
      h('div', { class: 'store-stream-sort' }, [h('span', undefined, [t(query ? 'Filtered catalog' : 'Live catalog')])]),
      queuedCount > 0
        ? h('div', { class: 'store-stream-queue', 'aria-live': 'polite' }, [t(`Queued: ${queuedCount}`)])
        : null
      ]),
      h('div', { class: 'store-stream-meta' }, [
        h('span', undefined, [t(query ? 'SpaceTimeDB search' : 'SpaceTimeDB snapshot')]),
        h('span', undefined, [t(query ? `${total} results` : `${visibleItems.length} items`)])
      ]),
    h('div', { class: 'store-stream-panel', role: 'list', 'aria-live': 'polite' }, [
      visibleItems.length === 0
        ? h('div', { class: 'store-stream-empty' }, [t(emptyLabel)])
        : visibleItems.map((item, index) =>
            h('div', {
              class: 'store-stream-row',
              role: 'listitem',
              'data-item-id': item.id,
              style: `--stagger-index:${index}`
            }, [
              h('button', {
                class: 'store-stream-delete',
                type: 'button',
                disabled: true,
                'aria-label': 'Delete item',
                title: 'Delete item'
              }, [t('X')]),
              h('div', undefined, [
                h('div', { class: 'store-stream-row-title' }, [t(item.name)]),
                h('div', { class: 'store-stream-row-meta' }, [
                  h('span', undefined, [t(`ID ${item.id}`)]),
                  h('span', undefined, [t(`Qty ${item.quantity}`)])
                ])
              ]),
              h('div', { class: 'store-stream-row-meta store-stream-row-meta-secondary' }, [
                item.score !== undefined
                  ? h('span', { class: 'store-stream-score' }, [t(`Score ${item.score.toFixed(2)}`)])
                  : null,
                h('button', {
                  class: `store-stream-add${item.quantity === 0 ? ' is-out' : ''}`,
                  type: 'button',
                  disabled: true,
                  'aria-label': item.quantity === 0 ? 'Out of stock' : 'Add to cart',
                  title: item.quantity === 0 ? 'Out of stock' : 'Add to cart'
                }, [t(item.quantity === 0 ? 'Out of stock' : 'Add to cart')]),
                h('span', { class: 'store-stream-row-price' }, [t(formatPrice(item.price))])
              ])
            ])
          )
    ])
  ])
}

const renderStoreCreateNode = (attrs: Record<string, string> | undefined): RenderNode => {
  const nameLabel = attrs?.['data-name-label'] ?? 'Item name'
  const priceLabel = attrs?.['data-price-label'] ?? 'Price'
  const quantityLabel = attrs?.['data-quantity-label'] ?? 'Quantity'
  const submitLabel = attrs?.['data-submit-label'] ?? 'Add item'
  const helper = attrs?.['data-helper']
  const namePlaceholder = attrs?.['data-name-placeholder'] ?? 'Neural render pack'
  const pricePlaceholder = attrs?.['data-price-placeholder'] ?? '19.00'
  const quantityPlaceholder = attrs?.['data-quantity-placeholder'] ?? '1'

  return h('div', { class: attrs?.class ?? 'store-create', 'data-state': 'idle' }, [
    h('form', { class: 'store-create-form' }, [
      h('div', { class: 'store-create-grid' }, [
        h('label', { class: 'store-create-input' }, [
          h('span', undefined, [t(nameLabel)]),
          h('input', {
            type: 'text',
            name: 'name',
            placeholder: namePlaceholder,
            readonly: true
          })
        ]),
        h('label', { class: 'store-create-input' }, [
          h('span', undefined, [t(priceLabel)]),
          h('input', {
            type: 'number',
            name: 'price',
            placeholder: pricePlaceholder,
            readonly: true
          })
        ]),
        h('div', { class: 'store-create-input store-create-input-quantity', 'data-digital': 'false' }, [
          h('label', { class: 'store-create-label', for: 'store-create-quantity-static' }, [t(quantityLabel)]),
          h('div', { class: 'store-create-quantity-row' }, [
            h('div', { class: 'store-create-field' }, [
              h('input', {
                id: 'store-create-quantity-static',
                class: 'store-create-quantity-input',
                type: 'number',
                name: 'quantity',
                placeholder: quantityPlaceholder,
                readonly: true
              })
            ]),
            h('label', { class: 'store-create-digital' }, [
              h('input', { type: 'checkbox', disabled: true }),
              h('span', { class: 'store-create-digital-indicator', 'aria-hidden': 'true' }),
              h('span', { class: 'store-create-digital-text' }, [t('Digital product')])
            ])
          ])
        ]),
        h('button', { class: 'store-create-submit', type: 'button', disabled: true }, [t(submitLabel)])
      ])
    ]),
    helper ? h('p', { class: 'store-create-helper' }, [t(helper)]) : null
  ])
}

const renderStoreCartNode = (attrs: Record<string, string> | undefined, context: StaticFragmentRenderContext): RenderNode => {
  const items = Array.isArray(context.storeSeed?.cart?.items)
    ? context.storeSeed?.cart?.items.map(normalizeCartItem).filter((item): item is StaticCartItem => item !== null)
    : []
  const title = attrs?.['data-title'] ?? 'Cart'
  const helper = attrs?.['data-helper'] ?? 'Drag items here or select them.'
  const empty = attrs?.['data-empty'] ?? 'Cart is empty.'
  const totalLabel = attrs?.['data-total'] ?? 'Total'
  const dropLabel = attrs?.['data-drop'] ?? 'Drop to add'
  const removeLabel = attrs?.['data-remove'] ?? 'Remove item'
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)

  return h('div', {
    class: attrs?.class ?? 'store-cart',
    'data-state': items.length > 0 ? 'filled' : 'empty'
  }, [
    h('div', { class: 'store-cart-header' }, [
      h('div', undefined, [
        h('p', { class: 'store-cart-title' }, [t(title)]),
        h('p', { class: 'store-cart-helper' }, [t(helper)])
      ]),
      h('div', { class: 'store-cart-total' }, [
        h('span', undefined, [t(totalLabel)]),
        h('strong', undefined, [t(formatPrice(total))])
      ])
    ]),
    h('div', { class: 'store-cart-dropzone' }, [
      h('div', { class: 'store-cart-drop-hint', 'aria-hidden': 'true' }, [t(dropLabel)]),
      items.length === 0
        ? h('div', { class: 'store-cart-empty' }, [t(empty)])
        : h('div', { class: 'store-cart-list', role: 'list' }, items.map((item, index) =>
            h('div', {
              class: 'store-cart-item',
              role: 'listitem',
              'data-cart-id': item.id,
              style: `--stagger-index:${index}`
            }, [
              h('button', {
                class: 'store-cart-remove',
                type: 'button',
                disabled: true,
                'aria-label': removeLabel,
                title: removeLabel
              }, [t('X')]),
              h('div', { class: 'store-cart-item-title' }, [t(item.name)]),
              h('div', { class: 'store-cart-item-meta' }, [h('span', undefined, [t(`ID ${item.id}`)])]),
              h('div', { class: 'store-cart-item-footer' }, [
                h('span', { class: 'store-cart-qty' }, [t(`Qty ${item.qty}`)]),
                h('span', { class: 'store-cart-price' }, [t(formatPrice(item.price * item.qty))])
              ])
            ])
          ))
    ])
  ])
}

const renderInviteList = (label: string, invites: StaticInvite[], emptyLabel: string, accent = false) =>
  h('div', { class: 'chat-invites-subsection' }, [
    h('div', { class: 'chat-invites-subheader' }, [
      h('span', undefined, [t(label)]),
      h('span', {
        class: 'chat-invites-subcount',
        ...(accent && invites.length > 0 ? { 'data-alert': 'true' } : {})
      }, [t(String(invites.length))])
    ]),
    h('div', { class: 'chat-invites-list' }, [
      invites.length === 0
        ? h('div', { class: 'chat-invites-empty' }, [t(emptyLabel)])
        : invites.map((invite, index) =>
            h('div', {
              class: 'chat-invites-item',
              style: `--stagger-index:${index}`
            }, [
              h('div', { class: 'chat-invites-item-heading' }, [
                h('div', { class: 'chat-invites-avatar' }, [t(resolveAvatarText(invite.user))]),
                h('div', undefined, [
                  h('div', { class: 'chat-invites-item-name' }, [t(resolveInviteDisplayName(invite.user))]),
                  h('div', { class: 'chat-invites-item-meta' }, [t(resolveInviteMeta(invite.user))])
                ])
              ])
            ])
          )
    ])
  ])

const renderContactInvitesNode = (attrs: Record<string, string> | undefined, context: StaticFragmentRenderContext): RenderNode => {
  const groups = context.contactInvitesSeed?.invites ?? { incoming: [], outgoing: [], contacts: [] }
  const incoming = groups.incoming.map(normalizeInvite).filter((invite): invite is StaticInvite => invite !== null)
  const outgoing = groups.outgoing.map(normalizeInvite).filter((invite): invite is StaticInvite => invite !== null)
  const contacts = groups.contacts.map(normalizeInvite).filter((invite): invite is StaticInvite => invite !== null)
  const title = attrs?.['data-title'] ?? 'Contact invites'
  const helper = attrs?.['data-helper'] ?? 'Search by user ID to connect.'
  const incomingLabel = attrs?.['data-incoming-label'] ?? 'Incoming'
  const outgoingLabel = attrs?.['data-outgoing-label'] ?? 'Outgoing'
  const contactsLabel = attrs?.['data-contacts-label'] ?? 'Contacts'
  const emptyLabel = attrs?.['data-empty-label'] ?? 'No invites yet.'

  return h('div', { class: attrs?.class ?? 'chat-invites' }, [
    h('div', { class: 'chat-invites-header' }, [
      h('div', undefined, [
        h('div', { class: 'chat-invites-title' }, [t(title)]),
        h('p', { class: 'chat-invites-helper' }, [t(helper)])
      ]),
      h('div', { class: 'chat-invites-header-actions' }, [
        h('span', { class: 'chat-invites-status-note', 'data-tone': 'neutral' }, [
          t(`${incoming.length + outgoing.length} pending`)
        ])
      ])
    ]),
    h('section', { class: 'chat-invites-results' }, [
      h('div', { class: 'chat-invites-results-header' }, [h('span', undefined, [t(title)])]),
      renderInviteList(incomingLabel, incoming, emptyLabel, true),
      renderInviteList(outgoingLabel, outgoing, emptyLabel),
      renderInviteList(contactsLabel, contacts, emptyLabel)
    ])
  ])
}

const replaceStaticNodes = (node: RenderNode, context: StaticFragmentRenderContext): RenderNode => {
  if (node.type !== 'element') return { ...node }

  if (node.tag === 'store-stream') return renderStoreStreamNode(node.attrs, context)
  if (node.tag === 'store-create') return renderStoreCreateNode(node.attrs)
  if (node.tag === 'store-cart') return renderStoreCartNode(node.attrs, context)
  if (node.tag === 'contact-invites') return renderContactInvitesNode(node.attrs, context)

  return {
    ...node,
    children: node.children?.map((child) => replaceStaticNodes(child, context))
  }
}

export const renderStaticFragmentTreeHtml = (node: RenderNode, context: StaticFragmentRenderContext = {}) =>
  renderToHtml(replaceStaticNodes(node, context))

export const renderStaticFragmentPayloadHtml = (
  payload: Pick<FragmentPayload, 'tree' | 'html'>,
  context: StaticFragmentRenderContext = {}
) => {
  const html = payload.html?.trim()
  if (html) return html
  return renderStaticFragmentTreeHtml(payload.tree, context)
}
