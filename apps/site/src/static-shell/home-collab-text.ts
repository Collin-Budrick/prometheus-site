import { LoroDoc } from 'loro-crdt'
import {
  HOME_COLLAB_RECONNECT_BASE_MS,
  HOME_COLLAB_RECONNECT_MAX_MS,
  HOME_COLLAB_ROOT_SELECTOR,
  HOME_COLLAB_STATUS_SELECTOR,
  HOME_COLLAB_TEXTAREA_SELECTOR,
  resolveHomeCollabWsUrl,
  setHomeCollabStatus,
  setHomeCollabTextareaState
} from './home-collab-shared'

type HomeCollabSocketEvent =
  | {
      type: 'home-collab:init'
      snapshot: string
      text?: string
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
  closingForPageHide: WebSocket | null
  doc: LoroDoc | null
  unsubscribeLocalUpdates: (() => void) | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectDelayMs: number
  ready: boolean
  destroyed: boolean
  suspended: boolean
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

const syncTextareaFromDoc = (state: HomeCollabState) => {
  if (!state.doc) {
    return
  }
  const text = state.doc.getText('text').toString()
  if (state.textarea.value !== text) {
    state.textarea.value = text
  }
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

const scheduleReconnect = (state: HomeCollabState, connect: () => void) => {
  if (state.destroyed || state.suspended || state.reconnectTimer !== null) {
    return
  }
  const delay = state.reconnectDelayMs
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    connect()
  }, delay)
  state.reconnectDelayMs = Math.min(delay * 2, HOME_COLLAB_RECONNECT_MAX_MS)
}

const attachRoot = (root: HTMLElement, WebSocketImpl: typeof WebSocket) => {
  const textarea = root.querySelector<HTMLTextAreaElement>(HOME_COLLAB_TEXTAREA_SELECTOR)
  const win = typeof window !== 'undefined' ? window : null
  if (!textarea || !win) {
    return null
  }

  const status = root.querySelector<HTMLElement>(HOME_COLLAB_STATUS_SELECTOR)
  const state: HomeCollabState = {
    root,
    textarea,
    status,
    socket: null,
    closingForPageHide: null,
    doc: null,
    unsubscribeLocalUpdates: null,
    reconnectTimer: null,
    reconnectDelayMs: HOME_COLLAB_RECONNECT_BASE_MS,
    ready: false,
    destroyed: false,
    suspended: false,
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
    setHomeCollabTextareaState({ textarea, busy: false, editable: true })
    setHomeCollabStatus(root, status, 'live')
  }

  const clearReconnectTimer = () => {
    if (state.reconnectTimer === null) {
      return
    }
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }

  const closeSocketForPageHide = () => {
    const socket = state.socket
    state.socket = null
    if (!socket) {
      return
    }
    state.closingForPageHide = socket
    socket.close(1000, 'pagehide')
  }

  const connect = () => {
    if (state.destroyed || state.suspended) {
      return
    }

    state.suspended = false
    setHomeCollabTextareaState({ textarea, busy: true, editable: false })
    setHomeCollabStatus(root, status, state.ready ? 'reconnecting' : 'connecting')

    const socket = new WebSocketImpl(resolveHomeCollabWsUrl(win.location.origin, 'editor'))
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
        setHomeCollabStatus(root, status, 'live')
        return
      }

      if (payload.type === 'error' && typeof payload.error === 'string') {
        setHomeCollabStatus(root, status, 'error')
      }
    })

    socket.addEventListener('close', () => {
      if (state.destroyed) {
        return
      }
      if (state.socket === socket) {
        state.socket = null
      }
      if (state.closingForPageHide === socket) {
        state.closingForPageHide = null
        return
      }
      if (state.suspended) {
        return
      }
      state.ready = false
      setHomeCollabTextareaState({ textarea, busy: true, editable: false })
      setHomeCollabStatus(root, status, 'reconnecting')
      scheduleReconnect(state, connect)
    })

    socket.addEventListener('error', () => {
      setHomeCollabStatus(root, status, 'reconnecting')
    })
  }

  textarea.disabled = false
  setHomeCollabTextareaState({ textarea, busy: true, editable: false })
  setHomeCollabStatus(root, status, 'connecting')

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

  const handlePageHide = () => {
    if (state.destroyed) {
      return
    }
    state.suspended = true
    clearReconnectTimer()
    closeSocketForPageHide()
  }

  const handlePageShow = () => {
    if (state.destroyed || !state.suspended || state.socket || state.reconnectTimer !== null) {
      return
    }
    state.suspended = false
    connect()
  }

  win.addEventListener('pagehide', handlePageHide)
  win.addEventListener('pageshow', handlePageShow)

  return {
    root,
    destroy: () => {
      state.suspended = false
      state.closingForPageHide = null
      textarea.removeEventListener('input', handleInput)
      win.removeEventListener('pagehide', handlePageHide)
      win.removeEventListener('pageshow', handlePageShow)
      disposeState(state)
    }
  }
}

export const attachHomeCollaborativeEditorRoot = ({
  root,
  WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : undefined
}: {
  root?: HTMLElement | null
  WebSocketImpl?: typeof WebSocket | undefined
} = {}) => {
  if (!root || !WebSocketImpl) {
    return () => undefined
  }

  const binding = attachRoot(root, WebSocketImpl)
  return binding ? binding.destroy : () => undefined
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
