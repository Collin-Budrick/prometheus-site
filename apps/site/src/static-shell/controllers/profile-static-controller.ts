import type { Lang } from '../../lang'
import { getUiCopy } from '../../lang/client'
import {
  buildLocalProfilePayload,
  clampChannel,
  DEFAULT_PROFILE_COLOR,
  emitProfileUpdate,
  loadLocalProfile,
  PROFILE_AVATAR_MAX_BYTES,
  saveLocalProfile,
  type ProfileColor
} from '../../shared/profile-storage'
import { buildPublicApiUrl } from '../../shared/public-api-url'

type ProfileUser = {
  id?: string
  name?: string
  email?: string
}

type MountStaticProfileControllerOptions = {
  lang: Lang
  user?: ProfileUser
}

type ControllerState = {
  savedName: string
  currentName: string
  bio: string
  avatar: string | null
  color: ProfileColor
  saving: boolean
}

const rgbToHex = (color: ProfileColor) => {
  const toHex = (value: number) => clampChannel(value).toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

const parseHexColor = (value: string): ProfileColor | null => {
  const normalized = value.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  }
}

const resolveAvatarInitials = (name: string, fallback: string, user?: ProfileUser) => {
  const source = name || user?.email || user?.id || fallback
  const cleaned = source.split('@')[0]?.trim() ?? fallback
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const result = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return result || 'P'
}

const ensureStatusElement = (
  root: HTMLElement,
  selector: string,
  tone: 'success' | 'error'
) => {
  const existing = root.querySelector<HTMLElement>(selector)
  if (existing) return existing
  const next = document.createElement('div')
  next.className = 'auth-status'
  next.setAttribute('role', 'status')
  next.setAttribute('aria-live', 'polite')
  next.dataset.tone = tone
  if (selector === '[data-static-profile-status]') {
    next.dataset.staticProfileStatus = ''
    root.prepend(next)
    return next
  }
  next.dataset.staticProfileLocalStatus = ''
  root.append(next)
  return next
}

const setStatus = (
  root: HTMLElement,
  selector: string,
  tone: 'success' | 'error',
  message: string | null
) => {
  const element = ensureStatusElement(root, selector, tone)
  element.dataset.tone = tone
  element.textContent = message ?? ''
  element.hidden = !message
}

const persistLocalProfileState = (state: ControllerState) => {
  const payload = buildLocalProfilePayload(state.bio, state.avatar, state.color)
  const saved = saveLocalProfile(payload)
  if (saved) {
    emitProfileUpdate(payload)
  }
  return saved
}

const replaceNodeChildren = (root: HTMLElement, nextChild: Node) => {
  if (typeof root.replaceChildren === 'function') {
    root.replaceChildren(nextChild)
    return
  }

  root.textContent = ''
  root.append(nextChild)
}

export const syncAvatarPreview = (
  avatarRoot: HTMLElement,
  avatar: string | null,
  displayName: string,
  avatarAlt = 'Profile',
  user?: ProfileUser
) => {
  avatarRoot.dataset.empty = avatar ? 'false' : 'true'

  if (avatar) {
    const image = document.createElement('img')
    image.src = avatar
    image.alt = avatarAlt
    image.loading = 'lazy'
    replaceNodeChildren(avatarRoot, image)
    return
  }

  const initials = document.createElement('span')
  initials.textContent = resolveAvatarInitials(displayName, avatarAlt, user)
  replaceNodeChildren(avatarRoot, initials)
}

const updateProfileCard = (
  root: HTMLElement,
  state: ControllerState,
  copy: ReturnType<typeof getUiCopy>,
  user?: ProfileUser
) => {
  const displayName = state.savedName || user?.email || user?.id || copy.profileAvatarAlt
  const displayEmail = user?.email ?? ''
  const previewName = root.querySelector<HTMLElement>('[data-static-profile-preview-name]')
  const previewEmail = root.querySelector<HTMLElement>('[data-static-profile-preview-email]')
  const previewBio = root.querySelector<HTMLElement>('[data-static-profile-preview-bio]')
  const avatarRoot = root.querySelector<HTMLElement>('[data-static-profile-avatar]')
  const colorHex = root.querySelector<HTMLElement>('[data-static-profile-color-hex] strong')
  const profileCard = root.querySelector<HTMLElement>('.profile-card')
  const colorPicker = root.querySelector<HTMLInputElement>('[data-static-profile-color-picker]')
  const bioCount = root.querySelector<HTMLElement>('.profile-field-meta')
  const nameValue = root.querySelector<HTMLElement>('[data-static-profile-name-value]')
  const emailValue = root.querySelector<HTMLElement>('[data-static-profile-email-value]')
  const idValue = root.querySelector<HTMLElement>('[data-static-profile-id-value]')

  if (previewName) {
    previewName.textContent = displayName
  }
  if (previewEmail) {
    previewEmail.textContent = displayEmail
    previewEmail.hidden = !displayEmail
  }
  if (previewBio) {
    const bio = state.bio.trim()
    previewBio.textContent = bio || copy.profileBioEmpty
    previewBio.dataset.empty = bio ? 'false' : 'true'
  }
  if (avatarRoot) {
    syncAvatarPreview(avatarRoot, state.avatar, displayName, copy.profileAvatarAlt, user)
  }
  if (colorHex) {
    colorHex.textContent = rgbToHex(state.color)
  }
  if (profileCard) {
    profileCard.style.setProperty('--profile-accent', `${state.color.r} ${state.color.g} ${state.color.b}`)
  }
  if (colorPicker) {
    colorPicker.value = rgbToHex(state.color)
  }
  if (bioCount) {
    bioCount.textContent = `${state.bio.length}/160`
  }
  if (nameValue) {
    nameValue.textContent = displayName
  }
  if (emailValue && displayEmail) {
    emailValue.textContent = displayEmail
  }
  if (idValue && user?.id) {
    idValue.textContent = user.id
  }

  root.querySelectorAll<HTMLInputElement>('[data-static-profile-color]').forEach((input) => {
    const channel = input.dataset.staticProfileColor
    if (channel === 'red') input.value = String(state.color.r)
    if (channel === 'green') input.value = String(state.color.g)
    if (channel === 'blue') input.value = String(state.color.b)
  })
}

const syncSaveButton = (button: HTMLButtonElement | null, state: ControllerState) => {
  if (!button) return
  const trimmedName = state.currentName.trim()
  button.disabled =
    state.saving ||
    trimmedName.length < 2 ||
    trimmedName.length > 64 ||
    trimmedName === state.savedName
}

export const mountStaticProfileController = ({ lang, user }: MountStaticProfileControllerOptions) => {
  const root = document.querySelector<HTMLElement>('[data-static-profile-root]')
  if (!root) {
    return { cleanup() {} }
  }

  const copy = getUiCopy(lang)
  const cleanupFns: Array<() => void> = []
  const nameInput = root.querySelector<HTMLInputElement>('[data-static-profile-name-input]')
  const bioInput = root.querySelector<HTMLTextAreaElement>('[data-static-profile-bio]')
  const avatarInput = root.querySelector<HTMLInputElement>('[data-static-profile-avatar-input]')
  const avatarRemove = root.querySelector<HTMLButtonElement>('[data-static-profile-avatar-remove]')
  const colorPicker = root.querySelector<HTMLInputElement>('[data-static-profile-color-picker]')
  const actionButton = document.querySelector<HTMLButtonElement>('[data-static-route-action]')
  const storedProfile = loadLocalProfile()
  const initialName = user?.name ?? nameInput?.value?.trim() ?? ''
  const state: ControllerState = {
    savedName: initialName,
    currentName: initialName,
    bio: storedProfile?.bio ?? bioInput?.value ?? '',
    avatar: storedProfile?.avatar ?? null,
    color: storedProfile?.color ? { ...storedProfile.color } : { ...DEFAULT_PROFILE_COLOR },
    saving: false
  }

  if (nameInput) {
    nameInput.value = state.currentName
  }
  if (bioInput) {
    bioInput.value = state.bio
  }

  updateProfileCard(root, state, copy, user)
  syncSaveButton(actionButton, state)

  const handleNameInput = () => {
    state.currentName = nameInput?.value ?? ''
    setStatus(root, '[data-static-profile-status]', 'success', null)
    syncSaveButton(actionButton, state)
  }

  const persistLocalState = () => {
    const saved = persistLocalProfileState(state)
    setStatus(
      root,
      '[data-static-profile-local-status]',
      saved ? 'success' : 'error',
      saved ? copy.profileSavedLocal : copy.profileSaveLocalFailed
    )
    updateProfileCard(root, state, copy, user)
  }

  const handleBioInput = () => {
    state.bio = bioInput?.value ?? ''
    persistLocalState()
  }

  const updateColorChannel = (channel: 'red' | 'green' | 'blue', value: number) => {
    const next = clampChannel(value)
    if (channel === 'red') state.color = { ...state.color, r: next }
    if (channel === 'green') state.color = { ...state.color, g: next }
    if (channel === 'blue') state.color = { ...state.color, b: next }
    persistLocalState()
  }

  const handleAvatarRemove = () => {
    state.avatar = null
    persistLocalState()
  }

  const handleColorPick = () => {
    const parsed = colorPicker?.value ? parseHexColor(colorPicker.value) : null
    if (!parsed) return
    state.color = parsed
    persistLocalState()
  }

  const handleSave = async () => {
    if (state.saving) return
    const trimmed = state.currentName.trim()
    if (trimmed.length < 2) {
      setStatus(root, '[data-static-profile-status]', 'error', copy.profileNameTooShort)
      return
    }
    if (trimmed.length > 64) {
      setStatus(root, '[data-static-profile-status]', 'error', copy.profileNameTooLong)
      return
    }
    if (trimmed === state.savedName) return

    state.saving = true
    syncSaveButton(actionButton, state)

    try {
      const response = await fetch(buildPublicApiUrl('/auth/profile/name', window.location.origin), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      })

      if (!response.ok) {
        let errorMessage = copy.profileNameUpdateFailed
        try {
          const payload = (await response.json()) as { error?: string }
          if (payload?.error) errorMessage = payload.error
        } catch {
          // Ignore parse failures.
        }
        setStatus(root, '[data-static-profile-status]', 'error', errorMessage)
        return
      }

      const payload = (await response.json()) as { user?: { name?: string } }
      state.savedName = payload.user?.name ?? trimmed
      state.currentName = state.savedName
      if (nameInput) {
        nameInput.value = state.savedName
      }
      updateProfileCard(root, state, copy, { ...user, name: state.savedName })
      setStatus(root, '[data-static-profile-status]', 'success', copy.profileNameUpdated)
    } catch (error) {
      setStatus(
        root,
        '[data-static-profile-status]',
        'error',
        error instanceof Error ? error.message : copy.profileNameUpdateFailed
      )
    } finally {
      state.saving = false
      syncSaveButton(actionButton, state)
    }
  }

  if (nameInput) {
    nameInput.addEventListener('input', handleNameInput)
    cleanupFns.push(() => nameInput.removeEventListener('input', handleNameInput))
  }

  if (bioInput) {
    bioInput.addEventListener('input', handleBioInput)
    cleanupFns.push(() => bioInput.removeEventListener('input', handleBioInput))
  }

  if (actionButton) {
    actionButton.addEventListener('click', handleSave)
    cleanupFns.push(() => actionButton.removeEventListener('click', handleSave))
  }

  if (avatarInput) {
    const handleAvatarChange = async () => {
      const file = avatarInput.files?.[0]
      if (!file) return
      if (!file.type.startsWith('image/')) {
        setStatus(root, '[data-static-profile-local-status]', 'error', copy.profileImageInvalid)
        return
      }
      if (file.size > PROFILE_AVATAR_MAX_BYTES) {
        setStatus(root, '[data-static-profile-local-status]', 'error', copy.profileImageTooLarge)
        return
      }
      const reader = new FileReader()
      const result = await new Promise<string | null>((resolve) => {
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(file)
      })
      avatarInput.value = ''
      if (!result) {
        setStatus(root, '[data-static-profile-local-status]', 'error', copy.profileImageReadFailed)
        return
      }
      state.avatar = result
      persistLocalState()
    }

    avatarInput.addEventListener('change', handleAvatarChange)
    cleanupFns.push(() => avatarInput.removeEventListener('change', handleAvatarChange))
  }

  if (avatarRemove) {
    avatarRemove.addEventListener('click', handleAvatarRemove)
    cleanupFns.push(() => avatarRemove.removeEventListener('click', handleAvatarRemove))
  }

  root.querySelectorAll<HTMLInputElement>('[data-static-profile-color]').forEach((input) => {
    const channel = input.dataset.staticProfileColor as 'red' | 'green' | 'blue' | undefined
    if (!channel) return
    const handleInput = () => {
      updateColorChannel(channel, Number(input.value))
    }
    input.addEventListener('input', handleInput)
    cleanupFns.push(() => input.removeEventListener('input', handleInput))
  })

  if (colorPicker) {
    colorPicker.addEventListener('input', handleColorPick)
    cleanupFns.push(() => colorPicker.removeEventListener('input', handleColorPick))
  }

  return {
    cleanup() {
      cleanupFns.splice(0).forEach((cleanup) => cleanup())
    }
  }
}
