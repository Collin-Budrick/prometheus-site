import { $, component$, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
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
import {
  buildLocalProfilePayload,
  clampChannel,
  DEFAULT_PROFILE_COLOR,
  emitProfileUpdate,
  loadLocalProfile,
  PROFILE_AVATAR_MAX_BYTES,
  readLocalProfileFromCookie,
  saveLocalProfile,
  type ProfileColor,
  type ProfilePayload
} from '../../shared/profile-storage'

type ProfileData = {
  user: {
    id?: string
    name?: string
    email?: string
    image?: string
  }
  lang: Lang
  localProfile: ProfilePayload | null
}

const rgbToHex = (color: ProfileColor) => {
  const toHex = (value: number) => clampChannel(value).toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

const persistLocalProfile = (bio: string, avatar: string | null, color: ProfileColor) => {
  const payload = buildLocalProfilePayload(bio, avatar, color)
  const saved = saveLocalProfile(payload)
  if (saved) {
    emitProfileUpdate(payload)
  }
  return saved
}

const parseHexColor = (value: string): ProfileColor | null => {
  const normalized = value.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
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
  const localProfile = readLocalProfileFromCookie(request.headers.get('cookie'))
  return { user: session.user, lang, localProfile }
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
  const localProfile = data.value.localProfile
  const savedName = useSignal(user.name ?? '')
  const nameInput = useSignal(user.name ?? '')
  const saving = useSignal(false)
  const statusMessage = useSignal<string | null>(null)
  const statusTone = useSignal<'success' | 'error'>('success')
  const localBio = useSignal(localProfile?.bio ?? '')
  const localAvatar = useSignal<string | null>(localProfile?.avatar ?? null)
  const localColor = useSignal<ProfileColor>(
    localProfile?.color ? { ...localProfile.color } : { ...DEFAULT_PROFILE_COLOR }
  )
  const localStatus = useSignal<string | null>(null)
  const localStatusTone = useSignal<'success' | 'error'>('success')
  const bioCount = useComputed$(() => localBio.value.length)
  const colorHex = useComputed$(() => rgbToHex(localColor.value))
  const avatarInitials = useComputed$(() => {
    const source = `${savedName.value || user.email || user.id || 'Profile'}`
    const cleaned = source.split('@')[0]?.trim() ?? 'Profile'
    const parts = cleaned.split(/\s+/).filter(Boolean)
    const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
    const result = letters.join('')
    return result || 'P'
  })
  const nameValue = savedName.value || user.email || user.id
  const emailValue = user.email ?? user.id
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navProfile)
  const trimmedName = nameInput.value.trim()
  const canSave = !saving.value && trimmedName.length >= 2 && trimmedName !== savedName.value

  useVisibleTask$(() => {
    if (typeof window === 'undefined') return
    if (localProfile) return
    const stored = loadLocalProfile()
    if (!stored) return
    localBio.value = stored.bio ?? ''
    localAvatar.value = stored.avatar ?? null
    localColor.value = stored.color ?? { ...DEFAULT_PROFILE_COLOR }
    saveLocalProfile(stored)
  })

  const handleNameInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    nameInput.value = target?.value ?? ''
    statusMessage.value = null
  })

  const handleBioInput = $((event: Event) => {
    const target = event.target as HTMLTextAreaElement | null
    localBio.value = target?.value ?? ''
    localStatus.value = null
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? 'Saved locally.' : 'Unable to save locally.'
  })

  const handleAvatarChange = $(async (event: Event) => {
    const target = event.target as HTMLInputElement | null
    const file = target?.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      localStatusTone.value = 'error'
      localStatus.value = 'Please choose an image file.'
      return
    }
    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
      localStatusTone.value = 'error'
      localStatus.value = 'Image must be under 1.2MB.'
      return
    }
    const reader = new FileReader()
    const result = await new Promise<string | null>((resolve) => {
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
    if (!result) {
      localStatusTone.value = 'error'
      localStatus.value = 'Unable to read that image.'
      return
    }
    localAvatar.value = result
    if (target) {
      target.value = ''
    }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? 'Saved locally.' : 'Unable to save locally.'
  })

  const handleAvatarRemove = $(() => {
    localAvatar.value = null
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? 'Saved locally.' : 'Unable to save locally.'
  })

  const handleRedInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    const value = clampChannel(Number(target?.value ?? 0))
    localColor.value = { ...localColor.value, r: value }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? 'Saved locally.' : 'Unable to save locally.'
  })

  const handleGreenInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    const value = clampChannel(Number(target?.value ?? 0))
    localColor.value = { ...localColor.value, g: value }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? 'Saved locally.' : 'Unable to save locally.'
  })

  const handleBlueInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    const value = clampChannel(Number(target?.value ?? 0))
    localColor.value = { ...localColor.value, b: value }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? 'Saved locally.' : 'Unable to save locally.'
  })

  const handleColorPick = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    const parsed = target?.value ? parseHexColor(target.value) : null
    if (!parsed) return
    localColor.value = parsed
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? 'Saved locally.' : 'Unable to save locally.'
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
        {user.id ? (
          <div class="profile-row">
            <span>User ID</span>
            <strong>{user.id}</strong>
          </div>
        ) : null}
      </div>
      {statusMessage.value ? (
        <div class="auth-status" role="status" aria-live="polite" data-tone={statusTone.value}>
          {statusMessage.value}
        </div>
      ) : null}
      <div
        class="profile-card"
        style={{
          '--profile-accent': `${localColor.value.r} ${localColor.value.g} ${localColor.value.b}`
        }}
      >
        <div class="profile-card-header">
          <div>
            <p class="profile-card-title">Profile card</p>
            <p class="profile-card-hint">Stored only on this device.</p>
          </div>
          <div class="profile-card-swatch">
            <span>RGB</span>
            <strong>{colorHex.value}</strong>
          </div>
        </div>
        <div class="profile-card-body">
          <div class="profile-preview">
            <p class="profile-preview-name">{nameValue ?? 'Profile'}</p>
            {emailValue ? <p class="profile-preview-email">{emailValue}</p> : null}
            <p class="profile-preview-bio" data-empty={localBio.value ? 'false' : 'true'}>
              {localBio.value || 'Add a short bio to personalize your profile card.'}
            </p>
          </div>
          <div class="profile-avatar-block">
            <div class="profile-avatar" data-empty={localAvatar.value ? 'false' : 'true'}>
              {localAvatar.value ? (
                <img src={localAvatar.value} alt="Profile" loading="lazy" />
              ) : (
                <span>{avatarInitials.value}</span>
              )}
            </div>
            <div class="profile-avatar-info">
              <p class="profile-avatar-title">Profile photo</p>
              <p class="profile-avatar-subtitle">PNG or JPG under 1.2MB.</p>
              <div class="profile-avatar-actions">
                <label class="profile-avatar-upload">
                  <input type="file" accept="image/*" onChange$={handleAvatarChange} />
                  Upload
                </label>
                {localAvatar.value ? (
                  <button type="button" class="profile-avatar-remove" onClick$={handleAvatarRemove}>
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <label class="profile-field">
            <span>Bio</span>
            <textarea
              class="profile-textarea"
              maxLength={160}
              rows={3}
              placeholder="Tell us what you are building."
              value={localBio.value}
              onInput$={handleBioInput}
            />
            <span class="profile-field-meta">{bioCount.value}/160</span>
          </label>
          <div class="profile-color-picker">
            <div class="profile-color-header">
              <div>
                <p class="profile-color-title">Card color</p>
                <p class="profile-card-hint">Use RGB sliders for precise control.</p>
              </div>
              <label class="profile-color-well" style={{ background: `rgb(${localColor.value.r} ${localColor.value.g} ${localColor.value.b})` }}>
                <input type="color" value={colorHex.value} onInput$={handleColorPick} aria-label="Pick a color" />
              </label>
            </div>
            <div class="profile-color-row">
              <div class="profile-color-label">
                <span>Red</span>
                <strong>{localColor.value.r}</strong>
              </div>
              <input
                type="range"
                min={0}
                max={255}
                value={localColor.value.r}
                class="profile-color-slider"
                style={{
                  '--color-start': `0 ${localColor.value.g} ${localColor.value.b}`,
                  '--color-end': `255 ${localColor.value.g} ${localColor.value.b}`
                }}
                onInput$={handleRedInput}
              />
            </div>
            <div class="profile-color-row">
              <div class="profile-color-label">
                <span>Green</span>
                <strong>{localColor.value.g}</strong>
              </div>
              <input
                type="range"
                min={0}
                max={255}
                value={localColor.value.g}
                class="profile-color-slider"
                style={{
                  '--color-start': `${localColor.value.r} 0 ${localColor.value.b}`,
                  '--color-end': `${localColor.value.r} 255 ${localColor.value.b}`
                }}
                onInput$={handleGreenInput}
              />
            </div>
            <div class="profile-color-row">
              <div class="profile-color-label">
                <span>Blue</span>
                <strong>{localColor.value.b}</strong>
              </div>
              <input
                type="range"
                min={0}
                max={255}
                value={localColor.value.b}
                class="profile-color-slider"
                style={{
                  '--color-start': `${localColor.value.r} ${localColor.value.g} 0`,
                  '--color-end': `${localColor.value.r} ${localColor.value.g} 255`
                }}
                onInput$={handleBlueInput}
              />
            </div>
          </div>
        </div>
      </div>
      {localStatus.value ? (
        <div class="auth-status" role="status" aria-live="polite" data-tone={localStatusTone.value}>
          {localStatus.value}
        </div>
      ) : null}
    </StaticRouteTemplate>
  )
})
