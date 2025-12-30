export type StorageGuardResult = {
  blocked: boolean
  freeBytes: number | null
  unavailable: boolean
}

export const checkStorageGuard = async (modelSizeBytes?: number): Promise<StorageGuardResult> => {
  if (typeof navigator === 'undefined') {
    return { blocked: false, freeBytes: null, unavailable: true }
  }
  if (!navigator.storage?.estimate) {
    console.warn('Storage API unavailable; skipping storage guard check.')
    return { blocked: false, freeBytes: null, unavailable: true }
  }

  try {
    const { quota, usage } = await navigator.storage.estimate()
    if (!quota || typeof usage !== 'number') {
      return { blocked: false, freeBytes: null, unavailable: true }
    }
    const free = quota - usage
    const blocked = typeof modelSizeBytes === 'number' && modelSizeBytes > 0 && free < modelSizeBytes
    return { blocked, freeBytes: free, unavailable: false }
  } catch (error) {
    console.warn('Storage estimate failed; skipping guard.', error)
    return { blocked: false, freeBytes: null, unavailable: true }
  }
}
