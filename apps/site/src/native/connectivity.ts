import { signal } from '@preact/signals-core'

type ConnectivitySource = 'navigator' | 'event'

export type ConnectivityState = {
  online: boolean
  connected: boolean
  connectionType: 'unknown'
  source: ConnectivitySource
}

const fallbackOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

const initialState: ConnectivityState = {
  online: fallbackOnline(),
  connected: fallbackOnline(),
  connectionType: 'unknown',
  source: 'navigator'
}

export const connectivityState = signal<ConnectivityState>(initialState)

let initialized = false

const emitConnectivityEvent = (state: ConnectivityState) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('prom:network-status', { detail: { ...state, key: 'client', source: state.source } }))
}

const updateConnectivity = (state: ConnectivityState) => {
  const previous = connectivityState.value
  connectivityState.value = state
  if (
    previous.online !== state.online ||
    previous.connected !== state.connected ||
    previous.connectionType !== state.connectionType
  ) {
    emitConnectivityEvent(state)
  }
}

const handleWebOnline = () => {
  updateConnectivity({
    online: true,
    connected: true,
    connectionType: 'unknown',
    source: 'event'
  })
}

const handleWebOffline = () => {
  updateConnectivity({
    online: false,
    connected: false,
    connectionType: 'unknown',
    source: 'event'
  })
}

export const initConnectivityStore = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('online', handleWebOnline)
  window.addEventListener('offline', handleWebOffline)
  updateConnectivity({
    online: fallbackOnline(),
    connected: fallbackOnline(),
    connectionType: 'unknown',
    source: 'navigator'
  })
}

export const isOnline = () => connectivityState.value.online

export const resetConnectivityForTests = async () => {
  initialized = false
  connectivityState.value = initialState
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleWebOnline)
    window.removeEventListener('offline', handleWebOffline)
  }
}
