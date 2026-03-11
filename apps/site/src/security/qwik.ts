import { useServerData } from '@builder.io/qwik'

export const useCspNonce = () => useServerData<string>('nonce', '')

