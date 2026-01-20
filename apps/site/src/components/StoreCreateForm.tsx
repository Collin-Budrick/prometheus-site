import { $, component$, useComputed$, useSignal } from '@builder.io/qwik'
import { useRequestEvent } from '@builder.io/qwik-city'
import { appConfig } from '../app-config'
import { getLanguagePack } from '../lang'
import { useSharedLangSignal } from '../shared/lang-bridge'

type StoreCreateFormProps = {
  class?: string
  nameLabel?: string
  priceLabel?: string
  quantityLabel?: string
  submitLabel?: string
  helper?: string
  namePlaceholder?: string
  pricePlaceholder?: string
  quantityPlaceholder?: string
}

type CreateState = 'idle' | 'saving' | 'success' | 'error'

const buildApiUrl = (path: string, origin: string) => {
  const base = appConfig.apiBase
  if (!base) return `${origin}${path}`
  if (base.startsWith('/')) return `${origin}${base}${path}`
  return `${base}${path}`
}

const normalizeLabel = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

const infinitySymbol = '\u221e'
const STORE_CREATE_NAME_COOKIE = 'prom-store-create-name'
const STORE_CREATE_PRICE_COOKIE = 'prom-store-create-price'
const STORE_CREATE_QUANTITY_COOKIE = 'prom-store-create-quantity'
const STORE_CREATE_DIGITAL_COOKIE = 'prom-store-create-digital'
const STORE_CREATE_COOKIE_MAX_AGE = 2592000

const readCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name === key) {
      if (!raw) return ''
      try {
        return decodeURIComponent(raw)
      } catch {
        return null
      }
    }
  }
  return null
}

const writeCookieValue = (key: string, value: string) => {
  if (typeof document === 'undefined') return
  try {
    const encoded = encodeURIComponent(value)
    document.cookie = `${key}=${encoded}; path=/; max-age=${STORE_CREATE_COOKIE_MAX_AGE}; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

const clearCookieValue = (key: string) => {
  if (typeof document === 'undefined') return
  document.cookie = `${key}=; path=/; max-age=0; samesite=lax`
}

const parseDigitalCookie = (raw: string | null) => raw === '1' || raw === 'true'

const isValidQuantity = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed)
}

export const StoreCreateForm = component$<StoreCreateFormProps>(
  ({
    class: className,
    nameLabel,
    priceLabel,
    quantityLabel,
    submitLabel,
    helper,
    namePlaceholder,
    pricePlaceholder,
    quantityPlaceholder
  }) => {
    const langSignal = useSharedLangSignal()
    const requestEvent = useRequestEvent()
    const cookieHeader =
      requestEvent?.request.headers.get('cookie') ?? (typeof document === 'undefined' ? null : document.cookie)
    const initialName = readCookieValue(cookieHeader, STORE_CREATE_NAME_COOKIE) ?? ''
    const initialPrice = readCookieValue(cookieHeader, STORE_CREATE_PRICE_COOKIE) ?? ''
    const initialQuantityRaw = readCookieValue(cookieHeader, STORE_CREATE_QUANTITY_COOKIE)
    const initialDigital = parseDigitalCookie(readCookieValue(cookieHeader, STORE_CREATE_DIGITAL_COOKIE))
    const initialQuantity = initialQuantityRaw ?? '1'
    const resolvedQuantity = initialDigital ? '-1' : initialQuantity
    const resolvedLastQuantity = isValidQuantity(initialQuantity) ? String(Math.trunc(Number(initialQuantity))) : '1'

    const name = useSignal(initialName)
    const price = useSignal(initialPrice)
    const quantity = useSignal(resolvedQuantity)
    const lastQuantity = useSignal(resolvedLastQuantity)
    const digitalProduct = useSignal(initialDigital)
    const state = useSignal<CreateState>('idle')
    const statusMessage = useSignal<string | null>(null)

    const fragmentCopy = useComputed$(() => getLanguagePack(langSignal.value).fragments ?? {})
    const copy = fragmentCopy.value
    const resolve = (value: string) => copy?.[value] ?? value

    const rootClass = useComputed$(() => {
      if (!className) return 'store-create'
      return className.includes('store-create') ? className : `store-create ${className}`.trim()
    })

    const canSubmit = useComputed$(() => {
      if (state.value === 'saving') return false
      const trimmedName = name.value.trim()
      if (trimmedName.length < 2) return false
      const parsedPrice = Number.parseFloat(price.value)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return false
      if (digitalProduct.value) return true
      const parsedQuantity = Number.parseFloat(quantity.value)
      return Number.isFinite(parsedQuantity) && parsedQuantity > 0 && Number.isInteger(parsedQuantity)
    })

    const handleSubmit = $(async () => {
      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value
      const interpolate = (value: string, params?: Record<string, string | number>) => {
        if (!params) return value
        return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(params[key] ?? ''))
      }

      const trimmedName = name.value.trim()
      const parsedPrice = Number.parseFloat(price.value)
      const parsedQuantity = digitalProduct.value ? -1 : Number.parseFloat(quantity.value)

      if (trimmedName.length < 2) {
        state.value = 'error'
        statusMessage.value = resolveLocal('Name must be at least 2 characters.')
        return
      }

      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        state.value = 'error'
        statusMessage.value = resolveLocal('Price must be a non-negative number.')
        return
      }

      if (
        !digitalProduct.value &&
        (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isInteger(parsedQuantity))
      ) {
        state.value = 'error'
        statusMessage.value = resolveLocal('Quantity must be a non-negative integer.')
        return
      }

      state.value = 'saving'
      statusMessage.value = null

      try {
        const response = await fetch(buildApiUrl('/store/items', window.location.origin), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: trimmedName, price: parsedPrice, quantity: parsedQuantity })
        })

        if (!response.ok) {
          let errorMessage = interpolate(resolveLocal('Request failed: {{status}}'), { status: response.status })
          try {
            const payload = (await response.json()) as { error?: string }
            if (payload?.error) {
              errorMessage = payload.error
            }
          } catch {
            // ignore parsing failures
          }
          state.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        const payload = (await response.json()) as { item?: { id?: number; name?: string } }
        const createdId = payload?.item?.id
        state.value = 'success'
        statusMessage.value = createdId
          ? interpolate(resolveLocal('Added item #{{id}}'), { id: createdId })
          : resolveLocal('Item created.')
        name.value = ''
        price.value = ''
        quantity.value = '1'
        lastQuantity.value = '1'
        digitalProduct.value = false
        clearCookieValue(STORE_CREATE_NAME_COOKIE)
        clearCookieValue(STORE_CREATE_PRICE_COOKIE)
        clearCookieValue(STORE_CREATE_QUANTITY_COOKIE)
        clearCookieValue(STORE_CREATE_DIGITAL_COOKIE)
      } catch (error) {
        state.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Unable to create item.')
      }
    })

    const handleQuantityInput = $((event: Event) => {
      const value = (event.target as HTMLInputElement).value
      quantity.value = value
      writeCookieValue(STORE_CREATE_QUANTITY_COOKIE, value)
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed)) {
        lastQuantity.value = String(Math.trunc(parsed))
      }
      if (Number.isFinite(parsed) && parsed <= 0) {
        digitalProduct.value = true
        quantity.value = '-1'
        writeCookieValue(STORE_CREATE_DIGITAL_COOKIE, '1')
        writeCookieValue(STORE_CREATE_QUANTITY_COOKIE, '-1')
      }
    })

    const handleDigitalToggle = $((event: Event) => {
      const next = (event.target as HTMLInputElement).checked
      if (next) {
        const parsed = Number.parseFloat(quantity.value)
        if (Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed)) {
          lastQuantity.value = String(Math.trunc(parsed))
        }
        quantity.value = '-1'
        writeCookieValue(STORE_CREATE_QUANTITY_COOKIE, '-1')
      } else {
        quantity.value = lastQuantity.value || '1'
        writeCookieValue(STORE_CREATE_QUANTITY_COOKIE, quantity.value)
      }
      digitalProduct.value = next
      writeCookieValue(STORE_CREATE_DIGITAL_COOKIE, next ? '1' : '0')
    })

    const resolvedNameLabel = normalizeLabel(nameLabel ? resolve(nameLabel) : undefined, resolve('Item name'))
    const resolvedPriceLabel = normalizeLabel(priceLabel ? resolve(priceLabel) : undefined, resolve('Price'))
    const resolvedQuantityLabel = normalizeLabel(quantityLabel ? resolve(quantityLabel) : undefined, resolve('Quantity'))
    const resolvedSubmitLabel = normalizeLabel(submitLabel ? resolve(submitLabel) : undefined, resolve('Add item'))
    const resolvedDigitalLabel = resolve('Digital product')
    const resolvedNamePlaceholder = normalizeLabel(
      namePlaceholder ? resolve(namePlaceholder) : undefined,
      resolve('Neural render pack')
    )
    const resolvedPricePlaceholder = normalizeLabel(pricePlaceholder ? resolve(pricePlaceholder) : undefined, resolve('19.00'))
    const resolvedQuantityPlaceholder = normalizeLabel(
      quantityPlaceholder ? resolve(quantityPlaceholder) : undefined,
      resolve('1')
    )
    const resolvedHelper = helper ? resolve(helper) : null
    const quantityDisplay = useComputed$(() => (digitalProduct.value ? infinitySymbol : quantity.value))

    return (
      <div class={rootClass.value} data-state={state.value}>
        <form class="store-create-form" preventdefault:submit onSubmit$={handleSubmit}>
          <div class="store-create-grid">
            <label class="store-create-input">
              <span>{resolvedNameLabel}</span>
                <input
                  type="text"
                  name="name"
                  autocomplete="off"
                  placeholder={resolvedNamePlaceholder}
                  value={name.value}
                  onInput$={(event) => {
                    const value = (event.target as HTMLInputElement).value
                    name.value = value
                    writeCookieValue(STORE_CREATE_NAME_COOKIE, value)
                  }}
                />
            </label>
            <label class="store-create-input">
              <span>{resolvedPriceLabel}</span>
                <input
                  type="number"
                  name="price"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={resolvedPricePlaceholder}
                  value={price.value}
                  onInput$={(event) => {
                    const value = (event.target as HTMLInputElement).value
                    price.value = value
                    writeCookieValue(STORE_CREATE_PRICE_COOKIE, value)
                  }}
                />
            </label>
            <div class="store-create-input store-create-input-quantity" data-digital={digitalProduct.value ? 'true' : 'false'}>
              <label class="store-create-label" for="store-create-quantity">
                {resolvedQuantityLabel}
              </label>
              <div class="store-create-field">
                <input
                  id="store-create-quantity"
                  class="store-create-quantity-input"
                  type={digitalProduct.value ? 'text' : 'number'}
                  name="quantity"
                  min={digitalProduct.value ? undefined : '0'}
                  step={digitalProduct.value ? undefined : '1'}
                  inputMode={digitalProduct.value ? 'text' : 'numeric'}
                  placeholder={resolvedQuantityPlaceholder}
                  value={quantityDisplay.value}
                  readOnly={digitalProduct.value}
                  onInput$={handleQuantityInput}
                />
                <label class="store-create-digital">
                  <input
                    id="store-create-digital"
                    type="checkbox"
                    checked={digitalProduct.value}
                    onChange$={handleDigitalToggle}
                  />
                  <span class="store-create-digital-indicator" aria-hidden="true" />
                  <span class="store-create-digital-text">{resolvedDigitalLabel}</span>
                </label>
              </div>
            </div>
            <button class="store-create-submit" type="submit" disabled={!canSubmit.value}>
              {state.value === 'saving' ? resolve('Saving...') : resolvedSubmitLabel}
            </button>
          </div>
        </form>
        {resolvedHelper ? <p class="store-create-helper">{resolvedHelper}</p> : null}
        {statusMessage.value ? (
          <div class="store-create-status" aria-live="polite">
            {statusMessage.value}
          </div>
        ) : null}
      </div>
    )
  }
)
