export type ContactInvitesProps = {
  class?: string
  title?: string
  helper?: string
  searchLabel?: string
  searchPlaceholder?: string
  searchActionLabel?: string
  inviteActionLabel?: string
  acceptActionLabel?: string
  declineActionLabel?: string
  removeActionLabel?: string
  incomingLabel?: string
  outgoingLabel?: string
  contactsLabel?: string
  emptyLabel?: string
}

export type ContactInviteView = {
  id: string
  status: string
  user: {
    id: string
    name?: string | null
    email: string
  }
}

export type ContactInvitesPayload = {
  incoming?: ContactInviteView[]
  outgoing?: ContactInviteView[]
  contacts?: ContactInviteView[]
}

export type ContactSearchResult = {
  id: string
  name?: string | null
  email: string
  status?: 'none' | 'incoming' | 'outgoing' | 'accepted'
  inviteId?: string
}

export type ContactSearchPayload = {
  results?: ContactSearchResult[]
}

export type RealtimeState = 'idle' | 'connecting' | 'live' | 'offline' | 'error'

export type BaselineInviteCounts = {
  incoming: number
  outgoing: number
  contacts: number
}

export type ActiveContact = {
  id: string
  name?: string | null
  email: string
  online: boolean
}

export type DmOrigin = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  radius: number
}

export type ContactSearchItem = {
  id: string
  name?: string | null
  email: string
  status?: ContactSearchResult['status']
  inviteId?: string
  isContact: boolean
  online?: boolean
}

export type DmConnectionState = 'idle' | 'connecting' | 'connected' | 'offline' | 'error'

export type DmDataChannel = {
  label: string
  readyState: 'connecting' | 'open' | 'closing' | 'closed'
  send: (data: string | ArrayBuffer | Blob | ArrayBufferView) => void
  close?: () => void
  onopen?: ((event?: Event) => void) | null
  onclose?: ((event?: Event) => void) | null
  onerror?: ((event?: Event) => void) | null
  onmessage?: ((event: MessageEvent) => void) | null
  binaryType?: BinaryType
}

export type DmImage = {
  dataUrl: string
  name?: string
  mime?: string
  width?: number
  height?: number
  size?: number
}

export type DmMessage = {
  id: string
  text: string
  author: 'self' | 'contact'
  createdAt: string
  status?: 'pending' | 'sent' | 'failed' | 'queued' | 'read'
  kind?: 'text' | 'image'
  image?: DmImage
}

export type ContactDevice = {
  deviceId: string
  publicKey: JsonWebKey
  label?: string
  role?: 'device' | 'relay'
  updatedAt?: string
  relayPublicKey?: string
  relayUrls?: string[]
}

export type P2pSession = {
  sessionId: string
  salt: string
  key: CryptoKey
  remoteDeviceId: string
}
