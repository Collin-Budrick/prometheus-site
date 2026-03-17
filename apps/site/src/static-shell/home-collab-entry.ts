import { primeTrustedTypesPolicies } from '../security/client'
import { loadHomeCollabEditorRuntime } from './home-collab-editor-entry-loader'
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

type HomeCollabEntryWindow = Window & {
  __PROM_STATIC_HOME_COLLAB_ENTRY__?: boolean
}

type HomeCollabListenerEvent =
  | {
      type: 'home-collab:text-init'
      text: string
    }
  | {
      type: 'home-collab:text-update'
      text: string
      clientId?: string
    }
  | {
      type: 'error'
      error: string
    }

export type HomeCollabBinding = {
  root: HTMLElement
  destroy: () => void
}

type HomeCollabBindingState = {
  root: HTMLElement
  textarea: HTMLTextAreaElement
  status: HTMLElement | null
  socket: WebSocket | null
  closingForPageHide: WebSocket | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectDelayMs: number
  ready: boolean
  destroyed: boolean
  suspended: boolean
  promotingEditor: boolean
  editorCleanup: (() => void) | null
}

type InstallHomeCollabEntryOptions = {
  win?: HomeCollabEntryWindow | null
  doc?: Document | null
  initialTarget?: EventTarget | null
  loadEditorRuntime?: typeof loadHomeCollabEditorRuntime
}

export type AttachHomeCollabRootOptions = {
  root: HTMLElement
  win?: HomeCollabEntryWindow | null
  initialTarget?: EventTarget | null
  loadEditorRuntime?: typeof loadHomeCollabEditorRuntime
}

const matchesRootTarget = (root: HTMLElement, target: EventTarget | null) =>
  typeof Node !== 'undefined' && target instanceof Node && root.contains(target)

const parseListenerEvent = (value: MessageEvent['data']): HomeCollabListenerEvent | null => {
  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<HomeCollabListenerEvent>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null
    }

    if (parsed.type === 'home-collab:text-init' && typeof parsed.text === 'string') {
      return parsed as HomeCollabListenerEvent
    }

    if (parsed.type === 'home-collab:text-update' && typeof parsed.text === 'string') {
      return parsed as HomeCollabListenerEvent
    }

    if (parsed.type === 'error' && typeof parsed.error === 'string') {
      return parsed as HomeCollabListenerEvent
    }
  } catch {
    return null
  }

  return null
}

const applyListenerText = (state: HomeCollabBindingState, text: string) => {
  if (state.textarea.value !== text) {
    state.textarea.value = text
  }
  state.ready = true
  setHomeCollabTextareaState({
    textarea: state.textarea,
    busy: false,
    editable: false
  })
  setHomeCollabStatus(state.root, state.status, 'live')
}

const createBinding = ({
  root,
  win,
  initialTarget,
  loadEditorRuntime
}: {
  root: HTMLElement
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'>
  initialTarget: EventTarget | null
  loadEditorRuntime: typeof loadHomeCollabEditorRuntime
}): HomeCollabBinding | null => {
  const textarea = root.querySelector<HTMLTextAreaElement>(HOME_COLLAB_TEXTAREA_SELECTOR)
  if (!textarea) {
    return null
  }

  const status = root.querySelector<HTMLElement>(HOME_COLLAB_STATUS_SELECTOR)
  const state: HomeCollabBindingState = {
    root,
    textarea,
    status,
    socket: null,
    closingForPageHide: null,
    reconnectTimer: null,
    reconnectDelayMs: HOME_COLLAB_RECONNECT_BASE_MS,
    ready: false,
    destroyed: false,
    suspended: false,
    promotingEditor: false,
    editorCleanup: null
  }

  const clearReconnectTimer = () => {
    if (state.reconnectTimer === null) {
      return
    }
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }

  const removePromotionListeners = () => {
    root.removeEventListener('pointerdown', handlePointerDown, true)
    root.removeEventListener('focusin', handleFocusIn, true)
    root.removeEventListener('keydown', handleKeyDown, true)
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

  const connectListener = () => {
    if (state.destroyed || state.suspended || state.promotingEditor || state.editorCleanup) {
      return
    }

    state.suspended = false
    setHomeCollabTextareaState({
      textarea,
      busy: true,
      editable: false
    })
    setHomeCollabStatus(root, status, state.ready ? 'reconnecting' : 'connecting')

    const socket = new WebSocket(resolveHomeCollabWsUrl(win.location.origin, 'listener'))
    state.socket = socket

    socket.addEventListener('message', (event) => {
      const payload = parseListenerEvent(event.data)
      if (!payload || state.destroyed) {
        return
      }

      if (payload.type === 'home-collab:text-init' || payload.type === 'home-collab:text-update') {
        applyListenerText(state, payload.text)
        state.reconnectDelayMs = HOME_COLLAB_RECONNECT_BASE_MS
        return
      }

      if (payload.type === 'error') {
        setHomeCollabStatus(root, status, 'error')
      }
    })

    socket.addEventListener('close', () => {
      if (state.destroyed || state.promotingEditor || state.editorCleanup) {
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
      setHomeCollabTextareaState({
        textarea,
        busy: true,
        editable: false
      })
      setHomeCollabStatus(root, status, 'reconnecting')

      if (state.reconnectTimer !== null) {
        return
      }

      const delay = state.reconnectDelayMs
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null
        connectListener()
      }, delay)
      state.reconnectDelayMs = Math.min(delay * 2, HOME_COLLAB_RECONNECT_MAX_MS)
    })

    socket.addEventListener('error', () => {
      if (state.destroyed || state.promotingEditor || state.editorCleanup) {
        return
      }
      setHomeCollabStatus(root, status, 'reconnecting')
    })
  }

  const promoteToEditor = () => {
    if (state.destroyed || state.promotingEditor || state.editorCleanup) {
      return
    }

    state.promotingEditor = true
    state.suspended = false
    clearReconnectTimer()
    state.socket?.close()
    state.socket = null
    removePromotionListeners()
    setHomeCollabTextareaState({
      textarea,
      busy: true,
      editable: false
    })
    setHomeCollabStatus(root, status, 'connecting')

    void loadEditorRuntime()
      .then(({ installHomeCollabEditor }) => {
        if (state.destroyed) {
          return
        }
        state.editorCleanup = installHomeCollabEditor({ root })
      })
      .catch((error) => {
        console.error('Static home collab editor failed:', error)
        state.promotingEditor = false
        setHomeCollabStatus(root, status, 'error')
        if (!state.suspended) {
          connectListener()
        }
      })
  }

  const handlePointerDown = (event: Event) => {
    if (!matchesRootTarget(root, event.target)) {
      return
    }
    promoteToEditor()
  }

  const handleFocusIn = (event: Event) => {
    if (!matchesRootTarget(root, event.target)) {
      return
    }
    promoteToEditor()
  }

  const handleKeyDown = (event: Event) => {
    if (!matchesRootTarget(root, event.target)) {
      return
    }
    promoteToEditor()
  }

  textarea.disabled = false
  setHomeCollabTextareaState({
    textarea,
    busy: false,
    editable: false
  })
  setHomeCollabStatus(root, status, 'idle')

  root.addEventListener('pointerdown', handlePointerDown, true)
  root.addEventListener('focusin', handleFocusIn, true)
  root.addEventListener('keydown', handleKeyDown, true)

  const handlePageHide = () => {
    if (state.destroyed || state.promotingEditor || state.editorCleanup) {
      return
    }
    if (!state.socket && state.reconnectTimer === null) {
      return
    }
    state.suspended = true
    clearReconnectTimer()
    closeSocketForPageHide()
  }

  const handlePageShow = () => {
    if (
      state.destroyed ||
      !state.suspended ||
      state.promotingEditor ||
      state.editorCleanup ||
      state.socket ||
      state.reconnectTimer !== null
    ) {
      return
    }
    state.suspended = false
    connectListener()
  }

  win.addEventListener('pagehide', handlePageHide)
  win.addEventListener('pageshow', handlePageShow)

  if (matchesRootTarget(root, initialTarget)) {
    promoteToEditor()
  }

  return {
    root,
    destroy: () => {
      state.destroyed = true
      state.suspended = false
      state.closingForPageHide = null
      clearReconnectTimer()
      removePromotionListeners()
      win.removeEventListener('pagehide', handlePageHide)
      win.removeEventListener('pageshow', handlePageShow)
      state.socket?.close()
      state.socket = null
      state.editorCleanup?.()
      state.editorCleanup = null
    }
  }
}

export const attachHomeCollabRoot = ({
  root,
  win = typeof window !== 'undefined'
    ? (window as HomeCollabEntryWindow)
    : null,
  initialTarget = null,
  loadEditorRuntime = loadHomeCollabEditorRuntime
}: AttachHomeCollabRootOptions): HomeCollabBinding | null => {
  if (!win) {
    return null
  }
  primeTrustedTypesPolicies()
  return createBinding({
    root,
    win,
    initialTarget,
    loadEditorRuntime
  })
}

export const installHomeCollabEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeCollabEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  initialTarget = null,
  loadEditorRuntime = loadHomeCollabEditorRuntime
}: InstallHomeCollabEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_HOME_COLLAB_ENTRY__) {
    return () => undefined
  }

  primeTrustedTypesPolicies()
  win.__PROM_STATIC_HOME_COLLAB_ENTRY__ = true

  const bindings = new Map<HTMLElement, HomeCollabBinding>()

  const cleanupDetachedBindings = () => {
    bindings.forEach((binding, element) => {
      if (element.isConnected) {
        return
      }
      binding.destroy()
      bindings.delete(element)
    })
  }

  const scanWithin = (root: ParentNode, nextInitialTarget: EventTarget | null = null) => {
    Array.from(root.querySelectorAll<HTMLElement>(HOME_COLLAB_ROOT_SELECTOR)).forEach((element) => {
      if (bindings.has(element)) {
        return
      }
      const binding = attachHomeCollabRoot({
        root: element,
        win,
        initialTarget: nextInitialTarget,
        loadEditorRuntime
      })
      if (binding) {
        bindings.set(element, binding)
      }
    })
    cleanupDetachedBindings()
  }

  scanWithin(doc, initialTarget)

  const observer =
    typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
          scanWithin(doc)
        })
      : null

  observer?.observe(doc, {
    childList: true,
    subtree: true
  })

  return () => {
    observer?.disconnect()
    bindings.forEach((binding) => binding.destroy())
    bindings.clear()
    win.__PROM_STATIC_HOME_COLLAB_ENTRY__ = false
  }
}

if (typeof window !== 'undefined') {
  installHomeCollabEntry()
}
