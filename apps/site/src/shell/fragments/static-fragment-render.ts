import { h, renderToHtml } from '@core/fragment/tree'
import type { FragmentPayload, RenderNode } from '../../fragment/types'
import type { ContactInvitesSeed } from '../../features/messaging/contact-invites-seed'
import type { StoreSeed } from '../../features/store/store-seed'
import { buildFragmentWidgetId, createFragmentWidgetMarkerNode } from '../../fragment/widget-markup'

type StaticFragmentRenderContext = {
  fragmentId?: string
  storeSeed?: StoreSeed | null
  contactInvitesSeed?: ContactInvitesSeed | null
  copy?: Record<string, unknown> | null
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

const staticReplacementTags = new Set(['store-stream', 'store-create', 'store-cart', 'contact-invites'])

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
  const name = typeof value.name === 'string' ? value.name.trim() : ''
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

const interpolate = (value: string, params: Record<string, string | number>) =>
  value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(params[key] ?? ''))

const formatLabeledValue = (label: string, value: string | number) => `${label} ${value}`

const translateStaticText = (context: StaticFragmentRenderContext, value: string) => {
  const translated = context.copy?.[value]
  return typeof translated === 'string' ? translated : value
}

const resolveStoreItemName = (item: StaticStoreItem | StaticCartItem, context: StaticFragmentRenderContext) => {
  if (item.name && item.name !== `Item ${item.id}`) return item.name
  return interpolate(translateStaticText(context, 'Item {{id}}'), { id: item.id })
}

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
const resolveWidgetId = (context: StaticFragmentRenderContext, kind: string, localKey?: string) =>
  buildFragmentWidgetId(context.fragmentId ?? 'fragment://page/unknown@v1', kind, localKey)

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
  const resultsLabel = translateStaticText(context, 'results')
  const itemsLabel = translateStaticText(context, 'items')
  const idLabel = translateStaticText(context, 'ID')
  const qtyLabel = translateStaticText(context, 'Qty')
  const scoreLabel = translateStaticText(context, 'Score')
  const deleteLabel = translateStaticText(context, 'Delete item')
  const addLabel = translateStaticText(context, 'Add to cart')
  const outOfStockLabel = translateStaticText(context, 'Out of stock')
  const queuedActionsLabel = translateStaticText(context, 'Queued actions')

  const shell = h('div', {
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
            h('span', { class: 'sr-only' }, [translateStaticText(context, query ? 'Search snapshot' : 'Live snapshot')])
          ])
        ]),
        query ? h('button', { class: 'store-stream-clear', type: 'button', disabled: true }, [translateStaticText(context, 'Clear')]) : null
      ]),
      h('div', { class: 'store-stream-sort' }, [h('span', undefined, [translateStaticText(context, query ? 'Filtered catalog' : 'Live catalog')])]),
      queuedCount > 0
        ? h('div', { class: 'store-stream-queue', 'aria-live': 'polite' }, [
            translateStaticText(context, `${queuedActionsLabel}: ${queuedCount}`)
          ])
        : null
      ]),
      h('div', { class: 'store-stream-meta' }, [
        h('span', undefined, [translateStaticText(context, query ? 'SpaceTimeDB search' : 'SpaceTimeDB snapshot')]),
        h('span', undefined, [translateStaticText(context, query ? `${total} ${resultsLabel}` : `${visibleItems.length} ${itemsLabel}`)])
      ]),
    h(
      'div',
      { class: 'store-stream-panel', role: 'list', 'aria-live': 'polite' },
      visibleItems.length === 0
        ? [h('div', { class: 'store-stream-empty', role: 'listitem' }, [translateStaticText(context, emptyLabel)])]
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
                'aria-label': deleteLabel,
                title: deleteLabel
              }, [translateStaticText(context, 'X')]),
              h('div', undefined, [
                h('div', { class: 'store-stream-row-title' }, [translateStaticText(context, resolveStoreItemName(item, context))]),
                h('div', { class: 'store-stream-row-meta' }, [
                  h('span', undefined, [translateStaticText(context, formatLabeledValue(idLabel, item.id))]),
                  h('span', undefined, [translateStaticText(context, formatLabeledValue(qtyLabel, item.quantity))])
                ])
              ]),
              h('div', { class: 'store-stream-row-meta store-stream-row-meta-secondary' }, [
                item.score !== undefined
                  ? h('span', { class: 'store-stream-score' }, [translateStaticText(context, formatLabeledValue(scoreLabel, item.score.toFixed(2)))])
                  : null,
                h('button', {
                  class: `store-stream-add${item.quantity === 0 ? ' is-out' : ''}`,
                  type: 'button',
                  disabled: true,
                  'aria-label': item.quantity === 0 ? outOfStockLabel : addLabel,
                  title: item.quantity === 0 ? outOfStockLabel : addLabel
                }, [translateStaticText(context, item.quantity === 0 ? outOfStockLabel : addLabel)]),
                h('span', { class: 'store-stream-row-price' }, [translateStaticText(context, formatPrice(item.price))])
              ])
            ])
          )
    )
  ])
  return createFragmentWidgetMarkerNode({
    kind: 'store-stream',
    id: resolveWidgetId(context, 'store-stream', attrs?.['data-widget-key']),
    priority: 'visible',
    props: {
      props: {
        class: attrs?.class ?? 'store-stream',
        limit,
        placeholder
      },
      storeSeed: context.storeSeed ?? null
    },
    shell
  })
}

const renderStoreCreateNode = (
  attrs: Record<string, string> | undefined,
  context: StaticFragmentRenderContext
): RenderNode => {
  const nameLabel = attrs?.['data-name-label'] ?? 'Item name'
  const priceLabel = attrs?.['data-price-label'] ?? 'Price'
  const quantityLabel = attrs?.['data-quantity-label'] ?? 'Quantity'
  const submitLabel = attrs?.['data-submit-label'] ?? 'Add item'
  const helper = attrs?.['data-helper']
  const namePlaceholder = attrs?.['data-name-placeholder'] ?? 'Neural render pack'
  const pricePlaceholder = attrs?.['data-price-placeholder'] ?? '19.00'
  const quantityPlaceholder = attrs?.['data-quantity-placeholder'] ?? '1'

  const shell = h('div', { class: attrs?.class ?? 'store-create', 'data-state': 'idle' }, [
    h('form', { class: 'store-create-form' }, [
      h('div', { class: 'store-create-grid' }, [
        h('label', { class: 'store-create-input' }, [
          h('span', undefined, [translateStaticText(context, nameLabel)]),
          h('input', {
            type: 'text',
            name: 'name',
            placeholder: namePlaceholder,
            autocomplete: 'off',
            readonly: true
          })
        ]),
        h('label', { class: 'store-create-input' }, [
          h('span', undefined, [translateStaticText(context, priceLabel)]),
          h('input', {
            type: 'number',
            name: 'price',
            placeholder: pricePlaceholder,
            autocomplete: 'off',
            readonly: true
          })
        ]),
        h('div', { class: 'store-create-input store-create-input-quantity', 'data-digital': 'false' }, [
          h('label', { class: 'store-create-label', for: 'store-create-quantity-static' }, [translateStaticText(context, quantityLabel)]),
          h('div', { class: 'store-create-quantity-row' }, [
            h('div', { class: 'store-create-field' }, [
              h('input', {
                id: 'store-create-quantity-static',
                class: 'store-create-quantity-input',
                type: 'number',
                name: 'quantity',
                placeholder: quantityPlaceholder,
                autocomplete: 'off',
                readonly: true
              })
            ]),
            h('label', { class: 'store-create-digital' }, [
              h('input', { type: 'checkbox', disabled: true }),
              h('span', { class: 'store-create-digital-indicator', 'aria-hidden': 'true' }),
              h('span', { class: 'store-create-digital-text' }, [translateStaticText(context, 'Digital product')])
            ])
          ])
        ]),
        h('button', { class: 'store-create-submit', type: 'button', disabled: true }, [translateStaticText(context, submitLabel)])
      ])
    ]),
    helper ? h('p', { class: 'store-create-helper' }, [translateStaticText(context, helper)]) : null
  ])
  return createFragmentWidgetMarkerNode({
    kind: 'store-create',
    id: resolveWidgetId(context, 'store-create', attrs?.['data-widget-key']),
    priority: 'visible',
    props: {
      props: {
        class: attrs?.class ?? 'store-create',
        nameLabel,
        priceLabel,
        quantityLabel,
        submitLabel,
        helper: helper ?? null,
        namePlaceholder,
        pricePlaceholder,
        quantityPlaceholder
      }
    },
    shell
  })
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
  const idLabel = translateStaticText(context, 'ID')
  const qtyLabel = translateStaticText(context, 'Qty')
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)

  const shell = h('div', {
    class: attrs?.class ?? 'store-cart',
    'data-state': items.length > 0 ? 'filled' : 'empty'
  }, [
    h('div', { class: 'store-cart-header' }, [
      h('div', undefined, [
        h('p', { class: 'store-cart-title' }, [translateStaticText(context, title)]),
        h('p', { class: 'store-cart-helper' }, [translateStaticText(context, helper)])
      ]),
      h('div', { class: 'store-cart-total' }, [
        h('span', undefined, [translateStaticText(context, totalLabel)]),
        h('strong', undefined, [translateStaticText(context, formatPrice(total))])
      ])
    ]),
    h('div', { class: 'store-cart-dropzone' }, [
      h('div', { class: 'store-cart-drop-hint', 'aria-hidden': 'true' }, [translateStaticText(context, dropLabel)]),
      items.length === 0
        ? h('div', { class: 'store-cart-empty' }, [translateStaticText(context, empty)])
        : h(
            'div',
            { class: 'store-cart-list', role: 'list' },
            items.map((item, index) =>
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
                }, [translateStaticText(context, 'X')]),
                h('div', { class: 'store-cart-item-title' }, [translateStaticText(context, resolveStoreItemName(item, context))]),
                h('div', { class: 'store-cart-item-meta' }, [h('span', undefined, [translateStaticText(context, formatLabeledValue(idLabel, item.id))])]),
                h('div', { class: 'store-cart-item-footer' }, [
                  h('span', { class: 'store-cart-qty' }, [translateStaticText(context, formatLabeledValue(qtyLabel, item.qty))]),
                  h('span', { class: 'store-cart-price' }, [translateStaticText(context, formatPrice(item.price * item.qty))])
                ])
              ])
            )
          )
    ])
  ])
  return createFragmentWidgetMarkerNode({
    kind: 'store-cart',
    id: resolveWidgetId(context, 'store-cart', attrs?.['data-widget-key']),
    priority: 'visible',
    props: {
      props: {
        class: attrs?.class ?? 'store-cart',
        title,
        helper,
        empty,
        totalLabel,
        dropLabel,
        removeLabel
      },
      storeSeed: context.storeSeed ?? null
    },
    shell
  })
}

const renderInviteList = (
  label: string,
  invites: StaticInvite[],
  emptyLabel: string,
  accent = false,
  context: StaticFragmentRenderContext = {}
) =>
  h('div', { class: 'chat-invites-subsection' }, [
    h('div', { class: 'chat-invites-subheader' }, [
      h('span', undefined, [translateStaticText(context, label)]),
      h('span', {
        class: 'chat-invites-subcount',
        ...(accent && invites.length > 0 ? { 'data-alert': 'true' } : {})
      }, [translateStaticText(context, String(invites.length))])
    ]),
    h(
      'div',
      { class: 'chat-invites-list' },
      invites.length === 0
        ? [h('div', { class: 'chat-invites-empty' }, [translateStaticText(context, emptyLabel)])]
        : invites.map((invite, index) =>
            h('div', {
              class: 'chat-invites-item',
              style: `--stagger-index:${index}`
            }, [
              h('div', { class: 'chat-invites-item-heading' }, [
                h('div', { class: 'chat-invites-avatar' }, [translateStaticText(context, resolveAvatarText(invite.user))]),
                h('div', undefined, [
                  h('div', { class: 'chat-invites-item-name' }, [translateStaticText(context, resolveInviteDisplayName(invite.user))]),
                  h('div', { class: 'chat-invites-item-meta' }, [translateStaticText(context, resolveInviteMeta(invite.user))])
                ])
              ])
            ])
          )
    )
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

  const shell = h('div', { class: attrs?.class ?? 'chat-invites' }, [
    h('div', { class: 'chat-invites-header' }, [
      h('div', undefined, [
        h('div', { class: 'chat-invites-title' }, [translateStaticText(context, title)]),
        h('p', { class: 'chat-invites-helper' }, [translateStaticText(context, helper)])
      ]),
      h('div', { class: 'chat-invites-header-actions' }, [
        h('span', { class: 'chat-invites-status-note', 'data-tone': 'neutral' }, [
          translateStaticText(context, `${incoming.length + outgoing.length} ${translateStaticText(context, 'pending')}`)
        ])
      ])
    ]),
    h('section', { class: 'chat-invites-results' }, [
      h('div', { class: 'chat-invites-results-header' }, [h('span', undefined, [translateStaticText(context, title)])]),
      renderInviteList(incomingLabel, incoming, emptyLabel, true, context),
      renderInviteList(outgoingLabel, outgoing, emptyLabel, false, context),
      renderInviteList(contactsLabel, contacts, emptyLabel, false, context)
    ])
  ])
  return createFragmentWidgetMarkerNode({
    kind: 'contact-invites',
    id: resolveWidgetId(context, 'contact-invites', attrs?.['data-widget-key']),
    priority: 'visible',
    props: {
      props: {
        class: attrs?.class ?? 'chat-invites',
        title,
        helper,
        incomingLabel,
        outgoingLabel,
        contactsLabel,
        emptyLabel
      },
      contactInvitesSeed: context.contactInvitesSeed ?? null
    },
    shell
  })
}

const replaceStaticNodes = (node: RenderNode, context: StaticFragmentRenderContext): RenderNode => {
  if (node.type !== 'element') return { ...node }

  if (node.tag === 'store-stream') return renderStoreStreamNode(node.attrs, context)
  if (node.tag === 'store-create') return renderStoreCreateNode(node.attrs, context)
  if (node.tag === 'store-cart') return renderStoreCartNode(node.attrs, context)
  if (node.tag === 'contact-invites') return renderContactInvitesNode(node.attrs, context)

  return {
    ...node,
    children: node.children?.map((child) => replaceStaticNodes(child, context))
  }
}

const hasStaticReplacementNode = (node: RenderNode): boolean => {
  if (node.type !== 'element') return false
  if (typeof node.tag === 'string' && staticReplacementTags.has(node.tag)) return true
  return (node.children ?? []).some((child) => hasStaticReplacementNode(child))
}

export const renderStaticFragmentTreeHtml = (node: RenderNode, context: StaticFragmentRenderContext = {}) =>
  renderToHtml(replaceStaticNodes(node, context))

export const renderStaticFragmentPayloadHtml = (
  payload: Pick<FragmentPayload, 'id' | 'tree' | 'html'>,
  context: StaticFragmentRenderContext = {}
) => {
  const html = payload.html?.trim()
  if (html && !hasStaticReplacementNode(payload.tree)) return html
  return renderStaticFragmentTreeHtml(payload.tree, { ...context, fragmentId: payload.id })
}
