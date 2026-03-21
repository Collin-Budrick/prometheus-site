/// <reference lib="webworker" />

import { LoroDoc } from 'loro-crdt'
import {
  HOME_COLLAB_RECONNECT_BASE_MS,
  HOME_COLLAB_RECONNECT_MAX_MS,
  type HomeCollabVisualState,
  resolveHomeCollabWsUrl
} from './home-collab-shared'
import type {
  HomeCollabWorkerInboundMessage,
  HomeCollabWorkerOutboundMessage
} from './home-collab-worker-protocol'

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

type WorkerState = {
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
  origin: string
}

declare const self: DedicatedWorkerGlobalScope

const encodeBytesBase64 = (value: Uint8Array) => {
  let binary = ''
  value.forEach((entry) => {
    binary += String.fromCharCode(entry)
  })
  return self.btoa(binary)
}

const decodeBytesBase64 = (value: string) => {
  const binary = self.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const createRandomPeerId = (): `${number}` => {
  const values = new Uint32Array(2)
  self.crypto.getRandomValues(values)
  const combined = (BigInt(values[0]) << 32n) | BigInt(values[1] || 1)
  return String(combined === 0n ? 1n : combined) as `${number}`
}

const state: WorkerState = {
  socket: null,
  closingForPageHide: null,
  doc: null,
  unsubscribeLocalUpdates: null,
  reconnectTimer: null,
  reconnectDelayMs: HOME_COLLAB_RECONNECT_BASE_MS,
  ready: false,
  destroyed: false,
  suspended: false,
  clientId: '',
  peerId: createRandomPeerId(),
  origin: ''
}

const postMessageToMain = (message: HomeCollabWorkerOutboundMessage) => {
  self.postMessage(message)
}

const postStatus = (status: HomeCollabVisualState) => {
  postMessageToMain({
    type: 'status',
    status,
    busy: status === 'connecting' || status === 'reconnecting',
    editable: status === 'live'
  })
}

const syncTextFromDoc = () => {
  if (!state.doc) {
    return
  }
  postMessageToMain({
    type: 'remote-update',
    text: state.doc.getText('text').toString()
  })
}

const clearReconnectTimer = () => {
  if (state.reconnectTimer === null) {
    return
  }
  clearTimeout(state.reconnectTimer)
  state.reconnectTimer = null
}

const resetDocState = () => {
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

const applySnapshot = (snapshot: string) => {
  resetDocState()
  if (snapshot) {
    state.doc?.import(decodeBytesBase64(snapshot))
  }
  state.ready = true
  state.reconnectDelayMs = HOME_COLLAB_RECONNECT_BASE_MS
  syncTextFromDoc()
  postStatus('live')
}

const scheduleReconnect = () => {
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

const connect = () => {
  if (state.destroyed || state.suspended || !state.origin) {
    return
  }

  postStatus(state.ready ? 'reconnecting' : 'connecting')
  const socket = new WebSocket(resolveHomeCollabWsUrl(state.origin, 'editor'))
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
      return
    }

    if (payload.type === 'home-collab:update' && typeof payload.update === 'string') {
      if (payload.clientId === state.clientId || !state.doc) {
        return
      }
      state.doc.import(decodeBytesBase64(payload.update))
      syncTextFromDoc()
      postStatus('live')
      return
    }

    if (payload.type === 'error' && typeof payload.error === 'string') {
      postStatus('error')
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
    postStatus('reconnecting')
    scheduleReconnect()
  })

  socket.addEventListener('error', () => {
    if (state.destroyed) {
      return
    }
    postStatus('reconnecting')
  })
}

const suspend = () => {
  state.suspended = true
  clearReconnectTimer()
  const socket = state.socket
  state.socket = null
  if (!socket) {
    return
  }
  state.closingForPageHide = socket
  socket.close(1000, 'pagehide')
}

const resume = () => {
  if (state.destroyed || !state.suspended || state.socket || state.reconnectTimer !== null) {
    return
  }
  state.suspended = false
  connect()
}

const destroy = () => {
  state.destroyed = true
  state.suspended = false
  state.ready = false
  clearReconnectTimer()
  state.unsubscribeLocalUpdates?.()
  state.unsubscribeLocalUpdates = null
  state.socket?.close()
  state.socket = null
  state.closingForPageHide = null
  state.doc = null
  self.close()
}

self.addEventListener('message', (event: MessageEvent<HomeCollabWorkerInboundMessage>) => {
  const message = event.data
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    return
  }

  switch (message.type) {
    case 'init':
      state.destroyed = false
      state.suspended = false
      clearReconnectTimer()
      state.socket?.close()
      state.socket = null
      state.closingForPageHide = null
      state.clientId = message.clientId
      state.origin = message.origin
      state.peerId = createRandomPeerId()
      state.reconnectDelayMs = HOME_COLLAB_RECONNECT_BASE_MS
      state.ready = false
      resetDocState()
      connect()
      return
    case 'apply-local-text': {
      if (!state.ready || !state.doc) {
        return
      }
      const text = state.doc.getText('text')
      if (text.toString() === message.text) {
        return
      }
      text.update(message.text)
      state.doc.commit({ origin: 'home-collab-input' })
      return
    }
    case 'suspend':
      suspend()
      return
    case 'resume':
      resume()
      return
    case 'destroy':
      destroy()
      return
  }
})
