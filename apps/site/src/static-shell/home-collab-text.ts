import { LoroDoc } from 'loro-crdt'
import { appConfig } from '../public-app-config'
import { buildPublicApiUrl } from '../shared/public-api-url'

const HOME_COLLAB_ROOT_SELECTOR = '[data-home-collab-root]'
const HOME_COLLAB_TEXTAREA_SELECTOR = '[data-home-collab-input]'
const HOME_COLLAB_STATUS_SELECTOR = '[data-home-collab-status]'
const HOME_COLLAB_RECONNECT_BASE_MS = 800
const HOME_COLLAB_RECONNECT_MAX_MS = 5000

type HomeCollabSocketEvent =
  | {
      type: 'home-collab:init'
      snapshot: string
    }
  | {
      type: 'home-collab:update'
      update: string
      clientId: string
    }
  | {
      type: 'error'
      error: string
    }

type HomeCollabState = {
  root: HTMLElement
  textarea: HTMLTextAreaElement
  status: HTMLElement | null
  socket: WebSocket | null
  doc: LoroDoc | null
  unsubscribeLocalUpdates: (() => void) | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectDelayMs: number
  ready: boolean
  destroyed: boolean
  clientId: string
  peerId: `${number}`
}

type HomeCollaborativeTextManager = {
  observeWithin: (root: ParentNode) => void
  destroy: () => void
}

type BindHomeCollaborativeTextOptions = {
  root?: ParentNode | null
  WebSocketImpl?: typeof WebSocket | undefined
  ObserverImpl?: typeof MutationObserver | undefined
}

const encodeBytesBase64 = (value: Uint8Array) => {
  let binary = ''
  value.forEach((entry) => {
    binary += String.fromCharCode(entry)
  })
  return btoa(binary)
}

const decodeBytesBase64 = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const createRandomPeerId = (): `${number}` => {
  const values = new Uint32Array(2)
  globalThis.crypto.getRandomValues(values)
  const combined = (BigInt(values[0]) << 32n) | BigInt(values[1] || 1)
  return String(combined === 0n ? 1n : combined) as `${number}`
}

const createClientId = () => {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const resolveStatusCopy = (root: HTMLElement, state: 'connecting' | 'live' | 'reconnecting' | 'error') =>
  root.getAttribute(`data-collab-status-${state}`) ??
  ({
    connecting: 'Connecting live sync...',
    live: 'Live for everyone on this page',
    reconnecting: 'Reconnecting live sync...',
    error: 'Realtime unavailable'
  } as const)[state]

const setStatus = (state: HomeCollabState, nextState: 'connecting' | 'live' | 'reconnecting' | 'error') => {
  const message = resolveStatusCopy(state.root, nextState)
  state.root.dataset.collabState = nextState
  if (state.status) {
    state.status.dataset.homeCollabStatus = nextState
    state.status.textContent = message
  }
}

const syncTextareaFromDoc = (state: HomeCollabState) => {
  if (!state.doc) {
    return
  }
  const text = state.doc.getText('text').toString()
  if (state.textarea.value !== text) {
    state.textarea.value = text
  }
}

const resolveHomeCollabWsUrl = (origin: string, apiBase = appConfig.apiBase) => {
  const url = new URL(buildPublicApiUrl('/home/collab/dock/ws', origin, apiBase))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const resetDocState = (state: HomeCollabState) => {
  state.unsubscribeLocalUpdates?.()
  state.unsubscribeLocalUpdates = null

  const nextDoc = new LoroDoc()
  nextDoc.setPeerId(state.peerId)
  state.doc = nextDoc
  state.unsubscribeLocalUpdates = nextDoc.subscribeLocalUpdates((update) => {
    const socket = state.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }
    socket.send(
      JSON.stringify({
        type: 'home-collab:update',
        update: encodeBytesBase64(update),
        clientId: state.clientId
      } satisfies HomeCollabSocketEvent)
    )
  })
}

const disposeState = (state: HomeCollabState) => {
  state.destroyed = true
  state.ready = false
  state.reconnectTimer && clearTimeout(state.reconnectTimer)
  state.reconnectTimer = null
  state.unsubscribeLocalUpdates?.()
  state.unsubscribeLocalUpdates = null
  state.socket?.close()
  state.socket = null
}

const scheduleReconnect = (
  state: HomeCollabState,
  connect: () => void
) => {
  if (state.destroyed || state.reconnectTimer !== null) {
    return
  }
  const delay = state.reconnectDelayMs
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    connect()
  }, delay)
  state.reconnectDelayMs = Math.min(delay * 2, HOME_COLLAB_RECONNECT_MAX_MS)
}

const attachRoot = (
  root: HTMLElement,
  WebSocketImpl: typeof WebSocket
) => {
  const textarea = root.querySelector<HTMLTextAreaElement>(HOME_COLLAB_TEXTAREA_SELECTOR)
  if (!textarea) {
    return null
  }

  const status = root.querySelector<HTMLElement>(HOME_COLLAB_STATUS_SELECTOR)
  const state: HomeCollabState = {
    root,
    textarea,
    status,
    socket: null,
    doc: null,
    unsubscribeLocalUpdates: null,
    reconnectTimer: null,
    reconnectDelayMs: HOME_COLLAB_RECONNECT_BASE_MS,
    ready: false,
    destroyed: false,
    clientId: createClientId(),
    peerId: createRandomPeerId()
  }

  const applySnapshot = (snapshot: string) => {
    resetDocState(state)
    if (snapshot) {
      state.doc?.import(decodeBytesBase64(snapshot))
    }
    syncTextareaFromDoc(state)
    state.ready = true
    state.textarea.disabled = false
    setStatus(state, 'live')
  }

  const connect = () => {
    if (state.destroyed) {
      return
    }

    state.textarea.disabled = true
    setStatus(state, state.ready ? 'reconnecting' : 'connecting')

    const socket = new WebSocketImpl(resolveHomeCollabWsUrl(window.location.origin))
    state.socket = socket

    socket.addEventListener('message', (event) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(typeof event.data === 'string' ? event.data : '')
      } catch {
        return
      }
      if (!parsed || typeof parsed !== 'object') {
        return
      }

      const payload = parsed as Partial<HomeCollabSocketEvent>
      if (payload.type === 'home-collab:init' && typeof payload.snapshot === 'string') {
        applySnapshot(payload.snapshot)
        state.reconnectDelayMs = HOME_COLLAB_RECONNECT_BASE_MS
        return
      }

      if (payload.type === 'home-collab:update' && typeof payload.update === 'string') {
        if (payload.clientId === state.clientId) {
          return
        }
        if (!state.doc) {
          return
        }
        state.doc.import(decodeBytesBase64(payload.update))
        syncTextareaFromDoc(state)
        setStatus(state, 'live')
        return
      }

      if (payload.type === 'error' && typeof payload.error === 'string') {
        setStatus(state, 'error')
      }
    })

    socket.addEventListener('close', () => {
      if (state.destroyed) {
        return
      }
      state.socket = null
      state.ready = false
      state.textarea.disabled = true
      setStatus(state, 'reconnecting')
      scheduleReconnect(state, connect)
    })

    socket.addEventListener('error', () => {
      setStatus(state, 'reconnecting')
    })
  }

  textarea.disabled = true
  setStatus(state, 'connecting')

  const handleInput = () => {
    if (!state.ready || !state.doc) {
      return
    }
    const text = state.doc.getText('text')
    const nextValue = textarea.value
    if (text.toString() === nextValue) {
      return
    }
    text.update(nextValue)
    state.doc.commit({ origin: 'home-collab-input' })
  }

  textarea.addEventListener('input', handleInput)
  resetDocState(state)
  connect()

  return {
    root,
    destroy: () => {
      textarea.removeEventListener('input', handleInput)
      disposeState(state)
    }
  }
}

export const bindHomeCollaborativeText = ({
  root = typeof document !== 'undefined' ? document : null,
  WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : undefined,
  ObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : undefined
}: BindHomeCollaborativeTextOptions = {}): HomeCollaborativeTextManager => {
  if (!root || !WebSocketImpl) {
    return {
      observeWithin: () => undefined,
      destroy: () => undefined
    }
  }

  const bindings = new Map<HTMLElement, { root: HTMLElement; destroy: () => void }>()

  const cleanupDetached = () => {
    bindings.forEach((binding, element) => {
      if (element.isConnected) {
        return
      }
      binding.destroy()
      bindings.delete(element)
    })
  }

  const scanWithin = (target: ParentNode) => {
    Array.from(target.querySelectorAll<HTMLElement>(HOME_COLLAB_ROOT_SELECTOR)).forEach((element) => {
      if (bindings.has(element)) {
        return
      }
      const binding = attachRoot(element, WebSocketImpl)
      if (binding) {
        bindings.set(element, binding)
      }
    })
    cleanupDetached()
  }

  scanWithin(root)

  const observer =
    ObserverImpl && typeof Node !== 'undefined' && root instanceof Node
      ? new ObserverImpl(() => {
          scanWithin(root)
        })
      : null

  observer?.observe(root as Node, {
    childList: true,
    subtree: true
  })

  return {
    observeWithin(target) {
      scanWithin(target)
    },
    destroy() {
      observer?.disconnect()
      bindings.forEach((binding) => binding.destroy())
      bindings.clear()
    }
  }
}
