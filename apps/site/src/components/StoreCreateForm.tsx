import { $, component$, useComputed$, useSignal } from '@builder.io/qwik'
import { appConfig } from '../app-config'

type StoreCreateFormProps = {
  class?: string
  nameLabel?: string
  priceLabel?: string
  submitLabel?: string
  helper?: string
  namePlaceholder?: string
  pricePlaceholder?: string
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

const parseError = async (response: Response) => {
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload?.error) return payload.error
  } catch {
    // ignore parsing failures
  }
  return `Request failed: ${response.status}`
}

export const StoreCreateForm = component$<StoreCreateFormProps>(
  ({ class: className, nameLabel, priceLabel, submitLabel, helper, namePlaceholder, pricePlaceholder }) => {
    const name = useSignal('')
    const price = useSignal('')
    const state = useSignal<CreateState>('idle')
    const statusMessage = useSignal<string | null>(null)

    const rootClass = useComputed$(() => {
      if (!className) return 'store-create'
      return className.includes('store-create') ? className : `store-create ${className}`.trim()
    })

    const canSubmit = useComputed$(() => {
      if (state.value === 'saving') return false
      const trimmedName = name.value.trim()
      if (trimmedName.length < 2) return false
      const parsedPrice = Number.parseFloat(price.value)
      return Number.isFinite(parsedPrice) && parsedPrice >= 0
    })

    const handleSubmit = $(async () => {
      const trimmedName = name.value.trim()
      const parsedPrice = Number.parseFloat(price.value)

      if (trimmedName.length < 2) {
        state.value = 'error'
        statusMessage.value = 'Name must be at least 2 characters.'
        return
      }

      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        state.value = 'error'
        statusMessage.value = 'Price must be a non-negative number.'
        return
      }

      state.value = 'saving'
      statusMessage.value = null

      try {
        const response = await fetch(buildApiUrl('/store/items', window.location.origin), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: trimmedName, price: parsedPrice })
        })

        if (!response.ok) {
          const errorMessage = await parseError(response)
          state.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        const payload = (await response.json()) as { item?: { id?: number; name?: string } }
        const createdId = payload?.item?.id
        state.value = 'success'
        statusMessage.value = createdId ? `Added item #${createdId}.` : 'Item created.'
        name.value = ''
        price.value = ''
      } catch (error) {
        state.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : 'Unable to create item.'
      }
    })

    const resolvedNameLabel = normalizeLabel(nameLabel, 'Item name')
    const resolvedPriceLabel = normalizeLabel(priceLabel, 'Price')
    const resolvedSubmitLabel = normalizeLabel(submitLabel, 'Add item')

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
                placeholder={normalizeLabel(namePlaceholder, 'Neural render pack')}
                value={name.value}
                onInput$={(event) => {
                  name.value = (event.target as HTMLInputElement).value
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
                placeholder={normalizeLabel(pricePlaceholder, '19.00')}
                value={price.value}
                onInput$={(event) => {
                  price.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
            <button class="store-create-submit" type="submit" disabled={!canSubmit.value}>
              {state.value === 'saving' ? 'Saving...' : resolvedSubmitLabel}
            </button>
          </div>
        </form>
        {helper ? <p class="store-create-helper">{helper}</p> : null}
        {statusMessage.value ? (
          <div class="store-create-status" aria-live="polite">
            {statusMessage.value}
          </div>
        ) : null}
      </div>
    )
  }
)
