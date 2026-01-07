import { $, component$, useComputed$, useSignal } from '@builder.io/qwik'
import { appConfig } from '../app-config'
import { getLanguagePack } from '../lang'
import { useSharedLangSignal } from '../shared/lang-bridge'

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

export const StoreCreateForm = component$<StoreCreateFormProps>(
  ({ class: className, nameLabel, priceLabel, submitLabel, helper, namePlaceholder, pricePlaceholder }) => {
    const langSignal = useSharedLangSignal()
    const name = useSignal('')
    const price = useSignal('')
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
      return Number.isFinite(parsedPrice) && parsedPrice >= 0
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
      } catch (error) {
        state.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Unable to create item.')
      }
    })

    const resolvedNameLabel = normalizeLabel(nameLabel ? resolve(nameLabel) : undefined, resolve('Item name'))
    const resolvedPriceLabel = normalizeLabel(priceLabel ? resolve(priceLabel) : undefined, resolve('Price'))
    const resolvedSubmitLabel = normalizeLabel(submitLabel ? resolve(submitLabel) : undefined, resolve('Add item'))
    const resolvedNamePlaceholder = normalizeLabel(
      namePlaceholder ? resolve(namePlaceholder) : undefined,
      resolve('Neural render pack')
    )
    const resolvedPricePlaceholder = normalizeLabel(pricePlaceholder ? resolve(pricePlaceholder) : undefined, resolve('19.00'))
    const resolvedHelper = helper ? resolve(helper) : null

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
                  placeholder={resolvedPricePlaceholder}
                  value={price.value}
                  onInput$={(event) => {
                    price.value = (event.target as HTMLInputElement).value
                  }}
                />
            </label>
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
