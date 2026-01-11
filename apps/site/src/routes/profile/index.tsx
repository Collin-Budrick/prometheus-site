import { $, component$, useSignal } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { appConfig } from '../../app-config'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'

type ProfileData = {
  user: {
    id?: string
    name?: string
    email?: string
    image?: string
  }
  lang: Lang
}

const isLocalHost = (hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'

const resolveAuthBase = (origin: string, apiBase?: string) => {
  if (!apiBase) return ''
  if (apiBase.startsWith('/')) return apiBase
  try {
    const apiUrl = new URL(apiBase)
    const originUrl = new URL(origin)
    const apiHost = apiUrl.hostname
    const originHost = originUrl.hostname
    if (isLocalHost(apiHost) && !isLocalHost(originHost) && apiHost !== originHost) {
      return '/api'
    }
  } catch {
    return ''
  }
  return apiBase
}

const buildApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = resolveAuthBase(origin, apiBase)
  if (!base) return `${origin}${path}`

  if (base.startsWith('/')) {
    if (path.startsWith(base)) return `${origin}${path}`
    return `${origin}${base}${path}`
  }

  if (path.startsWith('/api')) {
    const normalizedBase = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${normalizedBase}${path}`
  }

  return `${base}${path}`
}

export const useProfileData = routeLoader$<ProfileData>(async ({ request, redirect }) => {
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { user: session.user, lang }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useProfileData)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
  const description = copy.protectedDescription.replace('{{label}}', copy.navProfile)

  return {
    title: `${copy.navProfile} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  const data = useProfileData()
  const copy = useLangCopy()
  const user = data.value.user
  const savedName = useSignal(user.name ?? '')
  const nameInput = useSignal(user.name ?? '')
  const saving = useSignal(false)
  const statusMessage = useSignal<string | null>(null)
  const statusTone = useSignal<'success' | 'error'>('success')
  const nameValue = savedName.value || user.email || user.id
  const emailValue = user.email ?? user.id
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navProfile)
  const trimmedName = nameInput.value.trim()
  const canSave = !saving.value && trimmedName.length >= 2 && trimmedName !== savedName.value

  const handleNameInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    nameInput.value = target?.value ?? ''
    statusMessage.value = null
  })

  const handleSaveName = $(async () => {
    if (saving.value || typeof window === 'undefined') return
    const trimmed = nameInput.value.trim()
    if (trimmed.length < 2) {
      statusTone.value = 'error'
      statusMessage.value = 'Name must be at least 2 characters.'
      return
    }
    if (trimmed.length > 64) {
      statusTone.value = 'error'
      statusMessage.value = 'Name must be 64 characters or less.'
      return
    }
    if (trimmed === savedName.value) return

    saving.value = true
    statusMessage.value = null

    try {
      const response = await fetch(buildApiUrl('/auth/profile/name', window.location.origin, appConfig.apiBase), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      })

      if (!response.ok) {
        let errorMessage = 'Unable to update name.'
        try {
          const payload = (await response.json()) as { error?: string }
          if (payload?.error) errorMessage = payload.error
        } catch {
          // ignore parse errors
        }
        statusTone.value = 'error'
        statusMessage.value = errorMessage
        return
      }

      const payload = (await response.json()) as { user?: { name?: string } }
      const nextName = payload.user?.name ?? trimmed
      savedName.value = nextName
      nameInput.value = nextName
      statusTone.value = 'success'
      statusMessage.value = 'Name updated.'
    } catch (error) {
      statusTone.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : 'Unable to update name.'
    } finally {
      saving.value = false
    }
  })

  return (
    <StaticRouteTemplate
      metaLine={copy.value.protectedMetaLine}
      title={copy.value.navProfile}
      description={description}
      actionLabel={copy.value.profileNameAction}
      actionDisabled={!canSave}
      onAction$={handleSaveName}
      closeLabel={copy.value.fragmentClose}
    >
      <div class="profile-details">
        <label class="auth-field">
          <span>{copy.value.authNameLabel}</span>
          <input
            class="auth-input"
            type="text"
            maxLength={64}
            placeholder="Nova Lane"
            value={nameInput.value}
            onInput$={handleNameInput}
            aria-label={copy.value.authNameLabel}
          />
        </label>
        {nameValue ? (
          <div class="profile-row">
            <span>{copy.value.authNameLabel}</span>
            <strong>{nameValue}</strong>
          </div>
        ) : null}
        {emailValue ? (
          <div class="profile-row">
            <span>{copy.value.authEmailLabel}</span>
            <strong>{emailValue}</strong>
          </div>
        ) : null}
      </div>
      {statusMessage.value ? (
        <div class="auth-status" role="status" aria-live="polite" data-tone={statusTone.value}>
          {statusMessage.value}
        </div>
      ) : null}
    </StaticRouteTemplate>
  )
})
