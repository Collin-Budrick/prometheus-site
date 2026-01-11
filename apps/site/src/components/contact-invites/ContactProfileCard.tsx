import { component$, type PropFunction } from '@builder.io/qwik'
import type { ProfilePayload } from '../../shared/profile-storage'
import { DEFAULT_PROFILE_COLOR } from '../../shared/profile-storage'
import { formatDisplayName, formatInitials } from './utils'
import type { ActiveContact } from './types'

type ContactProfileCardProps = {
  open: boolean
  contact: ActiveContact | null
  profile: ProfilePayload | null
  onClose$: PropFunction<() => void>
}

export const ContactProfileCard = component$<ContactProfileCardProps>((props) => {
  if (!props.open || !props.contact) return null
  const profile = props.profile
  const color = profile?.color ?? DEFAULT_PROFILE_COLOR
  const initials = formatInitials(props.contact)
  const displayName = formatDisplayName(props.contact)
  const bio = profile?.bio?.trim() ?? ''

  return (
    <div class="chat-profile-overlay" role="dialog" aria-modal="true" aria-label="Profile card">
      <button type="button" class="chat-profile-backdrop" aria-label="Close profile" onClick$={props.onClose$} />
      <div class="chat-profile-panel" style={{ '--profile-accent': `${color.r} ${color.g} ${color.b}` }}>
        <div class="chat-profile-card profile-card">
          <div class="profile-card-header">
            <div>
              <p class="profile-card-title">Profile card</p>
              <p class="profile-card-hint">Shared peer to peer.</p>
            </div>
            <button type="button" class="chat-profile-close" onClick$={props.onClose$}>
              Close
            </button>
          </div>
          <div class="profile-card-body">
            <div class="profile-avatar-block">
              <div class="profile-avatar" data-empty={profile?.avatar ? 'false' : 'true'}>
                {profile?.avatar ? (
                  <img src={profile.avatar} alt={displayName} loading="lazy" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div class="profile-avatar-info">
                <p class="profile-avatar-title">{displayName}</p>
                <p class="profile-avatar-subtitle">{props.contact.email}</p>
              </div>
            </div>
            <div class="profile-preview">
              <p class="profile-preview-bio" data-empty={bio ? 'false' : 'true'}>
                {bio || 'No bio shared yet.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
