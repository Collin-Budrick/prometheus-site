import { $, component$, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import authModuleStyles from '@site/features/auth/auth.module.css'
import { siteBrand } from '../../config'
import { appConfig } from '../../public-app-config'
import { createFeatureRouteHandler, ensureFeatureEnabled } from '../feature-bundle'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../../shared/lang-bridge'
import { createCacheHandler, PRIVATE_REVALIDATE_CACHE } from '../cache-headers'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../features/auth/auth-session'
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
import profileModuleStyles from './profile.module.css'
import { emptyUiCopy, profileLanguageSelection, type LanguageSeedPayload } from '../../lang/selection'
import { StaticPageRoot } from '../../shell/core/StaticPageRoot'
import { createStaticIslandRouteData } from '../../shell/core/island-static-data'
import { STATIC_ISLAND_DATA_SCRIPT_ID } from '../../shell/core/constants'
import { isStaticShellBuild } from '../../shell/core/build-mode'
import { buildGlobalStylesheetLinks } from '../../shell/core/global-style-assets'

type ProfileData = {
  user: {
    id?: string
    name?: string
    email?: string
    image?: string
  }
  lang: Lang
  localProfile: ProfilePayload | null
  languageSeed: LanguageSeedPayload
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

const authClass = {
  field: authModuleStyles['auth-field'],
  input: authModuleStyles['auth-input'],
  status: authModuleStyles['auth-status']
} as const

const profileClass = {
  details: profileModuleStyles['profile-details'],
  row: profileModuleStyles['profile-row'],
  card: profileModuleStyles['profile-card'],
  cardHeader: profileModuleStyles['profile-card-header'],
  cardTitle: profileModuleStyles['profile-card-title'],
  cardHint: profileModuleStyles['profile-card-hint'],
  cardSwatch: profileModuleStyles['profile-card-swatch'],
  cardBody: profileModuleStyles['profile-card-body'],
  preview: profileModuleStyles['profile-preview'],
  previewName: profileModuleStyles['profile-preview-name'],
  previewEmail: profileModuleStyles['profile-preview-email'],
  previewBio: profileModuleStyles['profile-preview-bio'],
  avatarBlock: profileModuleStyles['profile-avatar-block'],
  avatar: profileModuleStyles['profile-avatar'],
  avatarInfo: profileModuleStyles['profile-avatar-info'],
  avatarTitle: profileModuleStyles['profile-avatar-title'],
  avatarSubtitle: profileModuleStyles['profile-avatar-subtitle'],
  avatarActions: profileModuleStyles['profile-avatar-actions'],
  avatarUpload: profileModuleStyles['profile-avatar-upload'],
  avatarRemove: profileModuleStyles['profile-avatar-remove'],
  field: profileModuleStyles['profile-field'],
  textarea: profileModuleStyles['profile-textarea'],
  fieldMeta: profileModuleStyles['profile-field-meta'],
  colorPicker: profileModuleStyles['profile-color-picker'],
  colorHeader: profileModuleStyles['profile-color-header'],
  colorTitle: profileModuleStyles['profile-color-title'],
  colorWell: profileModuleStyles['profile-color-well'],
  colorRow: profileModuleStyles['profile-color-row'],
  colorLabel: profileModuleStyles['profile-color-label'],
  colorSlider: profileModuleStyles['profile-color-slider']
} as const

export const useProfileData = routeLoader$<ProfileData>(async ({ request, redirect }) => {
  ensureFeatureEnabled('account')
  const { createServerLanguageSeed } = await import('../../lang/server')
  const lang = resolveRequestLang(request)
  if (isStaticShellBuild()) {
    return {
      user: {},
      lang,
      localProfile: readLocalProfileFromCookie(request.headers.get('cookie')),
      languageSeed: createServerLanguageSeed(lang, profileLanguageSelection)
    }
  }
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  const localProfile = readLocalProfileFromCookie(request.headers.get('cookie'))
  return {
    user: session.user,
    lang,
    localProfile,
    languageSeed: createServerLanguageSeed(lang, profileLanguageSelection)
  }
})

export const onGet: RequestHandler = createFeatureRouteHandler(
  'account',
  createCacheHandler(PRIVATE_REVALIDATE_CACHE)
)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useProfileData)
  const lang = data?.lang ?? defaultLang
  const copy = { ...emptyUiCopy, ...(data?.languageSeed.ui ?? {}) }
  const description = copy.protectedDescription.replace('{{label}}', copy.navProfile)

  return {
    title: `${copy.navProfile} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    links: buildGlobalStylesheetLinks(),
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  const data = useProfileData()
  useLanguageSeed(data.value.lang, data.value.languageSeed)
  const copy = useLangCopy(useSharedLangSignal(data.value.lang))
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
  const profileFallbackName = copy.value.profileAvatarAlt
  const avatarInitials = useComputed$(() => {
    const source = `${savedName.value || user.email || user.id || profileFallbackName}`
    const cleaned = source.split('@')[0]?.trim() ?? profileFallbackName
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
    localStatus.value = saved ? copy.value.profileSavedLocal : copy.value.profileSaveLocalFailed
  })

  const handleAvatarChange = $(async (event: Event) => {
    const target = event.target as HTMLInputElement | null
    const file = target?.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      localStatusTone.value = 'error'
      localStatus.value = copy.value.profileImageInvalid
      return
    }
    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
      localStatusTone.value = 'error'
      localStatus.value = copy.value.profileImageTooLarge
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
      localStatus.value = copy.value.profileImageReadFailed
      return
    }
    localAvatar.value = result
    if (target) {
      target.value = ''
    }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? copy.value.profileSavedLocal : copy.value.profileSaveLocalFailed
  })

  const handleAvatarRemove = $(() => {
    localAvatar.value = null
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? copy.value.profileSavedLocal : copy.value.profileSaveLocalFailed
  })

  const handleRedInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    const value = clampChannel(Number(target?.value ?? 0))
    localColor.value = { ...localColor.value, r: value }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? copy.value.profileSavedLocal : copy.value.profileSaveLocalFailed
  })

  const handleGreenInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    const value = clampChannel(Number(target?.value ?? 0))
    localColor.value = { ...localColor.value, g: value }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? copy.value.profileSavedLocal : copy.value.profileSaveLocalFailed
  })

  const handleBlueInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    const value = clampChannel(Number(target?.value ?? 0))
    localColor.value = { ...localColor.value, b: value }
    const saved = persistLocalProfile(localBio.value, localAvatar.value, localColor.value)
    localStatusTone.value = saved ? 'success' : 'error'
    localStatus.value = saved ? copy.value.profileSavedLocal : copy.value.profileSaveLocalFailed
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
      statusMessage.value = copy.value.profileNameTooShort
      return
    }
    if (trimmed.length > 64) {
      statusTone.value = 'error'
      statusMessage.value = copy.value.profileNameTooLong
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
        let errorMessage = copy.value.profileNameUpdateFailed
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
      statusMessage.value = copy.value.profileNameUpdated
    } catch (error) {
      statusTone.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : copy.value.profileNameUpdateFailed
    } finally {
      saving.value = false
    }
  })

  return (
    <StaticPageRoot
      routeDataScriptId={STATIC_ISLAND_DATA_SCRIPT_ID}
      routeData={createStaticIslandRouteData('/profile', data.value.lang, 'profile')}
    >
      <StaticRouteTemplate
        metaLine={copy.value.protectedMetaLine}
        title={copy.value.navProfile}
        description={description}
        actionLabel={copy.value.profileNameAction}
        actionDisabled={!canSave}
        onAction$={handleSaveName}
        closeLabel={copy.value.fragmentClose}
      >
        <div data-static-profile-root>
          <div class={profileClass.details}>
            <label class={authClass.field}>
              <span>{copy.value.authNameLabel}</span>
              <input
                class={authClass.input}
                type="text"
                maxLength={64}
                placeholder={copy.value.profileNamePlaceholder}
                value={nameInput.value}
                data-static-profile-name-input
                onInput$={handleNameInput}
                aria-label={copy.value.authNameLabel}
              />
            </label>
            {nameValue ? (
              <div class={profileClass.row}>
                <span>{copy.value.authNameLabel}</span>
                <strong data-static-profile-name-value>{nameValue}</strong>
              </div>
            ) : null}
            {emailValue ? (
              <div class={profileClass.row}>
                <span>{copy.value.authEmailLabel}</span>
                <strong data-static-profile-email-value>{emailValue}</strong>
              </div>
            ) : null}
            {user.id ? (
              <div class={profileClass.row}>
                 <span>{copy.value.profileIdLabel}</span>
                <strong data-static-profile-id-value>{user.id}</strong>
              </div>
            ) : null}
          </div>
          {statusMessage.value ? (
            <div
              class={authClass.status}
              role="status"
              aria-live="polite"
              data-tone={statusTone.value}
              data-static-profile-status
            >
              {statusMessage.value}
            </div>
          ) : null}
          <div
            class={profileClass.card}
            style={{
              '--profile-accent': `${localColor.value.r} ${localColor.value.g} ${localColor.value.b}`
            }}
          >
            <div class={profileClass.cardHeader}>
              <div>
                 <p class={profileClass.cardTitle}>{copy.value.profileCardTitle}</p>
                 <p class={profileClass.cardHint}>{copy.value.profileCardHint}</p>
              </div>
              <div class={profileClass.cardSwatch} data-static-profile-color-hex>
                <span>RGB</span>
                <strong>{colorHex.value}</strong>
              </div>
            </div>
            <div class={profileClass.cardBody}>
              <div class={profileClass.preview}>
                 <p class={profileClass.previewName} data-static-profile-preview-name>{nameValue ?? profileFallbackName}</p>
                {emailValue ? (
                  <p class={profileClass.previewEmail} data-static-profile-preview-email>
                    {emailValue}
                  </p>
                ) : null}
                <p
                  class={profileClass.previewBio}
                  data-empty={localBio.value ? 'false' : 'true'}
                  data-static-profile-preview-bio
                >
                   {localBio.value || copy.value.profileBioEmpty}
                </p>
              </div>
              <div class={profileClass.avatarBlock}>
                <div class={profileClass.avatar} data-empty={localAvatar.value ? 'false' : 'true'} data-static-profile-avatar>
                  {localAvatar.value ? (
                     <img src={localAvatar.value} alt={copy.value.profileAvatarAlt} loading="lazy" />
                  ) : (
                    <span>{avatarInitials.value}</span>
                  )}
                </div>
                <div class={profileClass.avatarInfo}>
                   <p class={profileClass.avatarTitle}>{copy.value.profilePhotoTitle}</p>
                   <p class={profileClass.avatarSubtitle}>{copy.value.profilePhotoHint}</p>
                  <div class={profileClass.avatarActions}>
                    <label class={profileClass.avatarUpload}>
                      <input
                        type="file"
                        accept="image/*"
                        data-static-profile-avatar-input
                        onChange$={handleAvatarChange}
                      />
                       {copy.value.profilePhotoUploadAction}
                    </label>
                    {localAvatar.value ? (
                      <button
                        type="button"
                        class={profileClass.avatarRemove}
                        data-static-profile-avatar-remove
                        onClick$={handleAvatarRemove}
                      >
                        {copy.value.profilePhotoRemoveAction}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <label class={profileClass.field}>
                <span>{copy.value.profileBioLabel}</span>
                <textarea
                  class={profileClass.textarea}
                  maxLength={160}
                  rows={3}
                   placeholder={copy.value.profileBioPlaceholder}
                  value={localBio.value}
                  data-static-profile-bio
                  onInput$={handleBioInput}
                />
                <span class={profileClass.fieldMeta}>{bioCount.value}/160</span>
              </label>
              <div class={profileClass.colorPicker}>
                <div class={profileClass.colorHeader}>
                  <div>
                     <p class={profileClass.colorTitle}>{copy.value.profileColorTitle}</p>
                     <p class={profileClass.cardHint}>{copy.value.profileColorHint}</p>
                  </div>
                  <label
                    class={profileClass.colorWell}
                    style={{ background: `rgb(${localColor.value.r} ${localColor.value.g} ${localColor.value.b})` }}
                  >
                    <input
                      type="color"
                      value={colorHex.value}
                      data-static-profile-color-picker
                      onInput$={handleColorPick}
                       aria-label={copy.value.profileColorPickerAriaLabel}
                    />
                  </label>
                </div>
                <div class={profileClass.colorRow}>
                  <div class={profileClass.colorLabel}>
                     <span>{copy.value.profileColorRed}</span>
                    <strong>{localColor.value.r}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={localColor.value.r}
                    class={profileClass.colorSlider}
                    style={{
                      '--color-start': `0 ${localColor.value.g} ${localColor.value.b}`,
                      '--color-end': `255 ${localColor.value.g} ${localColor.value.b}`
                    }}
                    data-static-profile-color="red"
                    onInput$={handleRedInput}
                  />
                </div>
                <div class={profileClass.colorRow}>
                  <div class={profileClass.colorLabel}>
                     <span>{copy.value.profileColorGreen}</span>
                    <strong>{localColor.value.g}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={localColor.value.g}
                    class={profileClass.colorSlider}
                    style={{
                      '--color-start': `${localColor.value.r} 0 ${localColor.value.b}`,
                      '--color-end': `${localColor.value.r} 255 ${localColor.value.b}`
                    }}
                    data-static-profile-color="green"
                    onInput$={handleGreenInput}
                  />
                </div>
                <div class={profileClass.colorRow}>
                  <div class={profileClass.colorLabel}>
                     <span>{copy.value.profileColorBlue}</span>
                    <strong>{localColor.value.b}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={localColor.value.b}
                    class={profileClass.colorSlider}
                    style={{
                      '--color-start': `${localColor.value.r} ${localColor.value.g} 0`,
                      '--color-end': `${localColor.value.r} ${localColor.value.g} 255`
                    }}
                    data-static-profile-color="blue"
                    onInput$={handleBlueInput}
                  />
                </div>
              </div>
            </div>
          </div>
          {localStatus.value ? (
            <div
              class={authClass.status}
              role="status"
              aria-live="polite"
              data-tone={localStatusTone.value}
              data-static-profile-local-status
            >
              {localStatus.value}
            </div>
          ) : null}
        </div>
      </StaticRouteTemplate>
    </StaticPageRoot>
  )
})
