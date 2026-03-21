import {
  HOME_COLLAB_ROOT_SELECTOR,
  HOME_COLLAB_STATUS_SELECTOR,
  HOME_COLLAB_TEXTAREA_SELECTOR,
  setHomeCollabStatus,
  setHomeCollabTextareaState
} from './home-collab-shared'
import {
  createHomeCollabWorker,
  type HomeCollabWorkerLike
} from './home-collab-worker-loader'
import type {
  HomeCollabWorkerInboundMessage,
  HomeCollabWorkerOutboundMessage
} from './home-collab-worker-protocol'

type HomeCollaborativeTextManager = {
  observeWithin: (root: ParentNode) => void
  destroy: () => void
}

type BindHomeCollaborativeTextOptions = {
  root?: ParentNode | null
  win?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'> | null
  ObserverImpl?: typeof MutationObserver | undefined
  createWorker?: typeof createHomeCollabWorker
}

type AttachHomeCollaborativeEditorRootOptions = {
  root?: HTMLElement | null
  win?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'> | null
  createWorker?: typeof createHomeCollabWorker
}

type HomeCollabBinding = {
  root: HTMLElement
  destroy: () => void
}

const createClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const syncTextareaValue = (textarea: HTMLTextAreaElement, text: string) => {
  if (textarea.value !== text) {
    textarea.value = text
  }
}

const attachRoot = ({
  root,
  win,
  createWorker
}: {
  root: HTMLElement
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'>
  createWorker: typeof createHomeCollabWorker
}): HomeCollabBinding | null => {
  const textarea = root.querySelector<HTMLTextAreaElement>(HOME_COLLAB_TEXTAREA_SELECTOR)
  if (!textarea) {
    return null
  }

  const status = root.querySelector<HTMLElement>(HOME_COLLAB_STATUS_SELECTOR)
  const worker = createWorker()
  if (!worker) {
    setHomeCollabStatus(root, status, 'error')
    setHomeCollabTextareaState({ textarea, busy: false, editable: false })
    return null
  }

  let destroyed = false
  let suspended = false

  const postToWorker = (message: HomeCollabWorkerInboundMessage) => {
    if (destroyed) {
      return
    }
    worker.postMessage(message)
  }

  const handleWorkerMessage = (event: MessageEvent<HomeCollabWorkerOutboundMessage>) => {
    const message = event.data
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return
    }

    if (message.type === 'remote-update') {
      syncTextareaValue(textarea, message.text)
      return
    }

    if (message.type === 'status') {
      setHomeCollabStatus(root, status, message.status)
      setHomeCollabTextareaState({
        textarea,
        busy: message.busy,
        editable: message.editable
      })
    }
  }

  const handleWorkerError = () => {
    if (destroyed) {
      return
    }
    setHomeCollabStatus(root, status, 'error')
    setHomeCollabTextareaState({ textarea, busy: false, editable: false })
  }

  const handleInput = () => {
    postToWorker({
      type: 'apply-local-text',
      text: textarea.value
    })
  }

  const handlePageHide = () => {
    if (destroyed) {
      return
    }
    suspended = true
    postToWorker({ type: 'suspend' })
  }

  const handlePageShow = () => {
    if (destroyed || !suspended) {
      return
    }
    suspended = false
    postToWorker({ type: 'resume' })
  }

  textarea.disabled = false
  setHomeCollabTextareaState({ textarea, busy: true, editable: false })
  setHomeCollabStatus(root, status, 'connecting')

  worker.addEventListener('message', handleWorkerMessage as EventListener)
  worker.addEventListener('error', handleWorkerError as EventListener)
  textarea.addEventListener('input', handleInput)
  win.addEventListener('pagehide', handlePageHide)
  win.addEventListener('pageshow', handlePageShow)

  postToWorker({
    type: 'init',
    clientId: createClientId(),
    origin: win.location.origin
  })

  return {
    root,
    destroy: () => {
      if (destroyed) {
        return
      }
      destroyed = true
      worker.removeEventListener('message', handleWorkerMessage as EventListener)
      worker.removeEventListener('error', handleWorkerError as EventListener)
      textarea.removeEventListener('input', handleInput)
      win.removeEventListener('pagehide', handlePageHide)
      win.removeEventListener('pageshow', handlePageShow)
      worker.postMessage({ type: 'destroy' } satisfies HomeCollabWorkerInboundMessage)
      worker.terminate()
    }
  }
}

export const attachHomeCollaborativeEditorRoot = ({
  root,
  win = typeof window !== 'undefined' ? window : null,
  createWorker = createHomeCollabWorker
}: AttachHomeCollaborativeEditorRootOptions = {}) => {
  if (!root || !win) {
    return () => undefined
  }

  const binding = attachRoot({
    root,
    win,
    createWorker
  })
  return binding ? binding.destroy : () => undefined
}

export const bindHomeCollaborativeText = ({
  root = typeof document !== 'undefined' ? document : null,
  win = typeof window !== 'undefined' ? window : null,
  ObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : undefined,
  createWorker = createHomeCollabWorker
}: BindHomeCollaborativeTextOptions = {}): HomeCollaborativeTextManager => {
  if (!root || !win) {
    return {
      observeWithin: () => undefined,
      destroy: () => undefined
    }
  }

  const bindings = new Map<HTMLElement, HomeCollabBinding>()

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
      const binding = attachRoot({
        root: element,
        win,
        createWorker
      })
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
