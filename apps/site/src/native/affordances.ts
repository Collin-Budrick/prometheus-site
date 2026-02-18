export type ActionSheetOption = {
  title: string
  style?: 'default' | 'cancel' | 'destructive'
}

export const showNativeToast = async (_text: string, _duration: 'short' | 'long' = 'short') => false

export const showNativeAlert = async (title: string, message: string) => {
  if (typeof window === 'undefined') return false
  const content = title.trim() ? `${title}\n\n${message}` : message
  window.alert(content)
  return true
}

export const confirmNativeDialog = async (title: string, message: string) => {
  if (typeof window === 'undefined') return null
  const content = title.trim() ? `${title}\n\n${message}` : message
  return window.confirm(content)
}

export const shareNativeContent = async (payload: { title?: string; text?: string; url?: string }) => {
  if (typeof navigator === 'undefined') return false
  const maybeShare = navigator as Navigator & {
    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>
  }
  if (typeof maybeShare.share !== 'function') return false
  try {
    await maybeShare.share(payload)
    return true
  } catch {
    return false
  }
}

export const showNativeActionSheet = async (_title: string, _options: ActionSheetOption[]) => null
