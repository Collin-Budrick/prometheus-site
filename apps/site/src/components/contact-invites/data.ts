export type ContactInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
export type ContactSearchStatus = 'none' | 'incoming' | 'outgoing' | 'accepted'

export type ContactInviteUser = {
  id: string
  name?: string | null
  email: string
}

export type ContactInviteView = {
  id: string
  status: ContactInviteStatus
  user: ContactInviteUser
}

export type ContactInviteGroups = {
  incoming: ContactInviteView[]
  outgoing: ContactInviteView[]
  contacts: ContactInviteView[]
}

export type ContactSearchResult = {
  id: string
  name?: string | null
  email: string
  status: ContactSearchStatus
  inviteId?: string
}

export const emptyInviteGroups: ContactInviteGroups = {
  incoming: [],
  outgoing: [],
  contacts: []
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeInviteStatus = (value: unknown): ContactInviteStatus | null => {
  if (value === 'pending' || value === 'accepted' || value === 'declined' || value === 'revoked') {
    return value
  }
  return null
}

const normalizeSearchStatus = (value: unknown): ContactSearchStatus => {
  if (value === 'incoming' || value === 'outgoing' || value === 'accepted') return value
  return 'none'
}

const normalizeSearchResult = (value: unknown): ContactSearchResult | null => {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const email = typeof value.email === 'string' ? value.email : ''
  if (!id || !email) return null
  const name = typeof value.name === 'string' ? value.name : null
  const status = normalizeSearchStatus(value.status)
  const inviteId = typeof value.inviteId === 'string' ? value.inviteId : undefined
  return { id, email, name, status, inviteId }
}

const normalizeInviteUser = (value: unknown): ContactInviteUser | null => {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const email = typeof value.email === 'string' ? value.email : ''
  if (!id || !email) return null
  const name = typeof value.name === 'string' ? value.name : null
  return { id, email, name }
}

const normalizeInvite = (value: unknown): ContactInviteView | null => {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const status = normalizeInviteStatus(value.status)
  const user = normalizeInviteUser(value.user)
  if (!id || !status || !user) return null
  return { id, status, user }
}

const normalizeInviteList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as ContactInviteView[]
  return value.map(normalizeInvite).filter((entry): entry is ContactInviteView => entry !== null)
}

export const normalizeInviteGroups = (value: unknown): ContactInviteGroups => {
  if (!isRecord(value)) return emptyInviteGroups
  return {
    incoming: normalizeInviteList(value.incoming),
    outgoing: normalizeInviteList(value.outgoing),
    contacts: normalizeInviteList(value.contacts)
  }
}

export const normalizeSearchResults = (value: unknown) => {
  if (!isRecord(value) || !Array.isArray(value.results)) return [] as ContactSearchResult[]
  return value.results
    .map(normalizeSearchResult)
    .filter((entry): entry is ContactSearchResult => entry !== null)
}
