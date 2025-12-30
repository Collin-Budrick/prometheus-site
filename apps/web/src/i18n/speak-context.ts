import type { SpeakState } from 'qwik-speak'

let clientSpeakState: SpeakState | null = null

export const registerSpeakContext = (state: SpeakState) => {
  if (typeof document === 'undefined') return
  clientSpeakState = state
}

export const getClientSpeakContext = () => clientSpeakState
