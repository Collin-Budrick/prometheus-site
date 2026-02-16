import { signal } from '@preact/signals-core'
import { type PluginListenerHandle } from '@capacitor/core'
import { Network, type ConnectionStatus } from '@capacitor/network'
import { isNativeCapacitorRuntime } from './runtime'

type ConnectivitySource = 'navigator' | 'network-plugin' | 'event'

export type ConnectivityState = {
  online: boolean
  connected: boolean
  connectionType: ConnectionStatus['connectionType'] | 'unknown'
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
let networkHandle: PluginListenerHandle | null = null

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
    connectionType: connectivityState.value.connectionType,
    source: 'event'
  })
}

const handleWebOffline = () => {
  updateConnectivity({
    online: false,
    connected: false,
    connectionType: connectivityState.value.connectionType,
    source: 'event'
  })
}

const hydrateFromNetworkPlugin = async () => {
  const status = await Network.getStatus()
  updateConnectivity({
    online: status.connected,
    connected: status.connected,
    connectionType: status.connectionType,
    source: 'network-plugin'
  })

  networkHandle = await Network.addListener('networkStatusChange', (event) => {
    updateConnectivity({
      online: event.connected,
      connected: event.connected,
      connectionType: event.connectionType,
      source: 'network-plugin'
    })
  })
}

export const initConnectivityStore = async () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('online', handleWebOnline)
  window.addEventListener('offline', handleWebOffline)

  if (isNativeCapacitorRuntime()) {
    await hydrateFromNetworkPlugin()
    return
  }

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
  if (networkHandle) {
    await networkHandle.remove()
    networkHandle = null
  }
}
