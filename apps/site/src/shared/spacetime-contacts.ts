import type { SubscriptionHandle } from '@prometheus/spacetimedb-client'
import type { ContactInviteGroups, ContactInviteUser, ContactSearchResult } from '../components/contact-invites/data'
import { emptyInviteGroups } from '../components/contact-invites/data'
import {
  ensureSpacetimeConnection,
  getSpacetimeConnectionSnapshot,
  loadSpacetimeClient,
  subscribeSpacetimeConnection,
  type SpacetimeConnectionSnapshot
} from './spacetime-client'

type ContactsListener = (snapshot: ContactsSnapshot) => void

type DirectoryUserEntry = {
  id: string
  image: string | null
  name: string | null
}

type ContactInviteEntry = {
  id: string
  inviteeId: string
  inviterId: string
  status: 'accepted' | 'declined' | 'pending' | 'revoked'
}

export type ContactsSnapshot = {
  error: string | null
  invites: ContactInviteGroups
  status: SpacetimeConnectionSnapshot['status']
}

const contactsListeners = new Set<ContactsListener>()

let connectionCleanup: (() => void) | null = null
let connectionSubscription: SubscriptionHandle | null = null
let activeConnection: SpacetimeConnectionSnapshot['connection'] = null
let directoryUsers: DirectoryUserEntry[] = []
let inviteRows: ContactInviteEntry[] = []
let contactsState: ContactsSnapshot = {
  error: null,
  invites: emptyInviteGroups,
  status: getSpacetimeConnectionSnapshot().status
}

let tableCallbacks:
  | {
      onDelete: () => void
      onInsert: () => void
      onUpdate: () => void
    }
  | null = null

const cloneEmptyInviteGroups = (): ContactInviteGroups => ({
  incoming: [],
  outgoing: [],
  contacts: []
})

const cloneContactsState = (): ContactsSnapshot => ({
  error: contactsState.error,
  invites: {
    incoming: [...contactsState.invites.incoming],
    outgoing: [...contactsState.invites.outgoing],
    contacts: [...contactsState.invites.contacts]
  },
  status: contactsState.status
})

const notifyContactsListeners = () => {
  const next = cloneContactsState()
  contactsListeners.forEach((listener) => listener(next))
}

const normalizeIdentity = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  ) {
    return ((value as { toHexString: () => string }).toHexString() || '').trim()
  }
  return ''
}

const normalizeInviteId = (value: unknown) => {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  if (typeof value === 'string' && value.trim() !== '') return value
  return ''
}

const normalizeDirectoryUser = (value: unknown): DirectoryUserEntry | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = normalizeIdentity(record.identity)
  if (!id) return null
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name : null
  const image = typeof record.image === 'string' && record.image.trim() !== '' ? record.image : null
  return { id, image, name }
}

const normalizeInviteStatus = (value: unknown): ContactInviteEntry['status'] | null => {
  if (value === 'pending' || value === 'accepted' || value === 'declined' || value === 'revoked') {
    return value
  }
  return null
}

const normalizeContactInvite = (value: unknown): ContactInviteEntry | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = normalizeInviteId(record.id)
  const inviterId = normalizeIdentity(record.inviterIdentity)
  const inviteeId = normalizeIdentity(record.inviteeIdentity)
  const status = normalizeInviteStatus(record.status)
  if (!id || !inviterId || !inviteeId || !status) return null
  return { id, inviteeId, inviterId, status }
}

const compareInviteUsers = (left: ContactInviteUser, right: ContactInviteUser) => {
  const leftLabel = left.name?.trim() || left.handle || left.id
  const rightLabel = right.name?.trim() || right.handle || right.id
  return leftLabel.localeCompare(rightLabel)
}

const buildInviteUser = (identity: string): ContactInviteUser => {
  const directoryUser = directoryUsers.find((entry) => entry.id === identity)
  return {
    id: identity,
    handle: identity,
    image: directoryUser?.image ?? null,
    name: directoryUser?.name ?? null
  }
}

const buildInviteGroups = () => {
  const currentIdentity = getSpacetimeConnectionSnapshot().identity
  if (!currentIdentity) return cloneEmptyInviteGroups()

  const incoming = [] as ContactInviteGroups['incoming']
  const outgoing = [] as ContactInviteGroups['outgoing']
  const contactsByIdentity = new Map<string, ContactInviteGroups['contacts'][number]>()

  for (const invite of inviteRows) {
    const isInviter = invite.inviterId === currentIdentity
    const isInvitee = invite.inviteeId === currentIdentity
    if (!isInviter && !isInvitee) continue

    const otherIdentity = isInviter ? invite.inviteeId : invite.inviterId
    const entry = {
      id: invite.id,
      status: invite.status,
      user: buildInviteUser(otherIdentity)
    }

    if (invite.status === 'pending') {
      if (isInvitee) {
        incoming.push(entry)
      } else {
        outgoing.push(entry)
      }
      continue
    }

    if (invite.status === 'accepted') {
      contactsByIdentity.set(otherIdentity, entry)
    }
  }

  incoming.sort((left, right) => compareInviteUsers(left.user, right.user))
  outgoing.sort((left, right) => compareInviteUsers(left.user, right.user))
  const contacts = Array.from(contactsByIdentity.values()).sort((left, right) =>
    compareInviteUsers(left.user, right.user)
  )

  return { incoming, outgoing, contacts }
}

const refreshContactsState = () => {
  if (!activeConnection) {
    directoryUsers = []
    inviteRows = []
    contactsState = {
      ...contactsState,
      invites: cloneEmptyInviteGroups()
    }
    notifyContactsListeners()
    return
  }

  directoryUsers = Array.from(activeConnection.db.directory_user.iter())
    .map((row) => normalizeDirectoryUser(row))
    .filter((row): row is DirectoryUserEntry => row !== null)

  inviteRows = Array.from(activeConnection.db.contact_invite.iter())
    .map((row) => normalizeContactInvite(row))
    .filter((row): row is ContactInviteEntry => row !== null)

  contactsState = {
    error: null,
    invites: buildInviteGroups(),
    status: contactsState.status
  }
  notifyContactsListeners()
}

const detachFromActiveConnection = () => {
  if (connectionSubscription && !connectionSubscription.isEnded()) {
    connectionSubscription.unsubscribe()
  }
  connectionSubscription = null
  if (activeConnection && tableCallbacks) {
    activeConnection.db.contact_invite.removeOnInsert(tableCallbacks.onInsert)
    activeConnection.db.contact_invite.removeOnDelete(tableCallbacks.onDelete)
    activeConnection.db.contact_invite.removeOnUpdate?.(tableCallbacks.onUpdate)
    activeConnection.db.directory_user.removeOnInsert(tableCallbacks.onInsert)
    activeConnection.db.directory_user.removeOnDelete(tableCallbacks.onDelete)
    activeConnection.db.directory_user.removeOnUpdate?.(tableCallbacks.onUpdate)
  }
  activeConnection = null
  tableCallbacks = null
}

const attachToConnection = () => {
  const connection = getSpacetimeConnectionSnapshot().connection
  if (!connection || activeConnection === connection) return

  detachFromActiveConnection()
  activeConnection = connection
  tableCallbacks = {
    onDelete: () => refreshContactsState(),
    onInsert: () => refreshContactsState(),
    onUpdate: () => refreshContactsState()
  }

  connection.db.contact_invite.onInsert(tableCallbacks.onInsert)
  connection.db.contact_invite.onDelete(tableCallbacks.onDelete)
  connection.db.contact_invite.onUpdate?.(tableCallbacks.onUpdate)
  connection.db.directory_user.onInsert(tableCallbacks.onInsert)
  connection.db.directory_user.onDelete(tableCallbacks.onDelete)
  connection.db.directory_user.onUpdate?.(tableCallbacks.onUpdate)

  connectionSubscription = connection
    .subscriptionBuilder()
    .onApplied(() => {
      contactsState = {
        ...contactsState,
        error: null,
        status: 'live'
      }
      refreshContactsState()
    })
    .onError((ctx) => {
      contactsState = {
        ...contactsState,
        error: ctx.event?.message ?? 'Subscription failed.',
        status: 'error'
      }
      notifyContactsListeners()
    })
    .subscribe(['SELECT * FROM directory_user', 'SELECT * FROM contact_invite'])
}

const ensureContactsService = () => {
  if (!connectionCleanup) {
    connectionCleanup = subscribeSpacetimeConnection((state) => {
      contactsState = {
        ...contactsState,
        error: state.error,
        status: state.status
      }
      if (state.connection) {
        attachToConnection()
        return
      }
      if (state.status !== 'connecting') {
        detachFromActiveConnection()
      }
      notifyContactsListeners()
    })
  }

  void ensureSpacetimeConnection()
}

const stopContactsServiceIfIdle = () => {
  if (contactsListeners.size > 0) return
  detachFromActiveConnection()
  connectionCleanup?.()
  connectionCleanup = null
}

const resolveSearchStatus = (
  currentIdentity: string,
  targetIdentity: string
): { inviteId?: string; status: ContactSearchResult['status'] } => {
  let pendingInvite: ContactInviteEntry | null = null
  let acceptedInvite: ContactInviteEntry | null = null

  for (const invite of inviteRows) {
    const matchesPair =
      (invite.inviterId === currentIdentity && invite.inviteeId === targetIdentity) ||
      (invite.inviterId === targetIdentity && invite.inviteeId === currentIdentity)
    if (!matchesPair) continue
    if (invite.status === 'accepted') {
      acceptedInvite = invite
      break
    }
    if (invite.status === 'pending') {
      pendingInvite = invite
    }
  }

  if (acceptedInvite) {
    return { inviteId: acceptedInvite.id, status: 'accepted' }
  }
  if (pendingInvite) {
    return {
      inviteId: pendingInvite.id,
      status: pendingInvite.inviterId === currentIdentity ? 'outgoing' : 'incoming'
    }
  }
  return { status: 'none' }
}

const compareSearchResults = (query: string, left: ContactSearchResult, right: ContactSearchResult) => {
  const normalizedQuery = query.toLowerCase()
  const leftLabel = (left.name?.trim() || left.handle || left.id).toLowerCase()
  const rightLabel = (right.name?.trim() || right.handle || right.id).toLowerCase()
  const leftStartsWith = leftLabel.startsWith(normalizedQuery)
  const rightStartsWith = rightLabel.startsWith(normalizedQuery)
  if (leftStartsWith !== rightStartsWith) {
    return leftStartsWith ? -1 : 1
  }
  return leftLabel.localeCompare(rightLabel)
}

const waitForContactsState = async <T>(
  resolveValue: (snapshot: ContactsSnapshot) => T | null,
  timeoutMs = 2_500
) =>
  new Promise<T | null>((resolve) => {
    const immediate = resolveValue(contactsState)
    if (immediate !== null) {
      resolve(immediate)
      return
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)

    const listener: ContactsListener = (snapshot) => {
      const next = resolveValue(snapshot)
      if (next === null) return
      cleanup()
      resolve(next)
    }

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      contactsListeners.delete(listener)
    }

    contactsListeners.add(listener)
  })

export const getContactInvitesSnapshot = () => cloneContactsState()

export const subscribeContactInvites = (listener: ContactsListener) => {
  contactsListeners.add(listener)
  ensureContactsService()
  listener(cloneContactsState())
  return () => {
    contactsListeners.delete(listener)
    stopContactsServiceIfIdle()
  }
}

export const searchContactDirectory = (query: string, limit = 12) => {
  ensureContactsService()
  const trimmed = query.trim().toLowerCase()
  const currentIdentity = getSpacetimeConnectionSnapshot().identity
  if (!currentIdentity || trimmed.length < 2) return [] as ContactSearchResult[]

  const matches = directoryUsers
    .filter((entry) => entry.id !== currentIdentity)
    .filter((entry) => {
      const label = `${entry.name ?? ''} ${entry.id}`.toLowerCase()
      return label.includes(trimmed)
    })
    .map((entry) => {
      const relation = resolveSearchStatus(currentIdentity, entry.id)
      return {
        id: entry.id,
        handle: entry.id,
        image: entry.image,
        name: entry.name,
        status: relation.status,
        inviteId: relation.inviteId
      } satisfies ContactSearchResult
    })
    .sort((left, right) => compareSearchResults(trimmed, left, right))

  return Number.isFinite(limit) && limit > 0 ? matches.slice(0, limit) : matches
}

export const sendContactInviteDirect = async (identity: string) => {
  ensureContactsService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    throw new Error('SpaceTimeDB connection unavailable.')
  }
  const { Identity } = await loadSpacetimeClient()
  await connection.reducers.sendContactInvite({
    inviteeIdentity: Identity.fromString(identity)
  })
  await waitForContactsState((snapshot) =>
    snapshot.invites.outgoing.some((invite) => invite.user.id === identity) ? true : null
  )
}

export const acceptContactInviteDirect = async (inviteId: string) => {
  ensureContactsService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    throw new Error('SpaceTimeDB connection unavailable.')
  }
  await connection.reducers.acceptContactInvite({ id: BigInt(inviteId) })
  await waitForContactsState((snapshot) =>
    snapshot.invites.contacts.some((invite) => invite.id === inviteId) ? true : null
  )
}

export const declineContactInviteDirect = async (inviteId: string) => {
  ensureContactsService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    throw new Error('SpaceTimeDB connection unavailable.')
  }
  await connection.reducers.declineContactInvite({ id: BigInt(inviteId) })
  await waitForContactsState((snapshot) => {
    const inviteStillVisible =
      snapshot.invites.incoming.some((invite) => invite.id === inviteId) ||
      snapshot.invites.contacts.some((invite) => invite.id === inviteId) ||
      snapshot.invites.outgoing.some((invite) => invite.id === inviteId)
    return inviteStillVisible ? null : true
  })
}

export const removeContactInviteDirect = async (inviteId: string) => {
  ensureContactsService()
  const connection = await ensureSpacetimeConnection()
  if (!connection) {
    throw new Error('SpaceTimeDB connection unavailable.')
  }
  await connection.reducers.removeContactInvite({ id: BigInt(inviteId) })
  await waitForContactsState((snapshot) => {
    const inviteStillVisible =
      snapshot.invites.incoming.some((invite) => invite.id === inviteId) ||
      snapshot.invites.contacts.some((invite) => invite.id === inviteId) ||
      snapshot.invites.outgoing.some((invite) => invite.id === inviteId)
    return inviteStillVisible ? null : true
  })
}
