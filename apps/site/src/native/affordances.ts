export type ActionSheetOption = {
  title: string
  style?: 'default' | 'cancel' | 'destructive'
}

const asText = (title: string, message: string) => (title.trim() ? `${title}\n\n${message}` : message)

export const showNativeToast = async (text: string, duration: 'short' | 'long' = 'short') => {
  void text
  void duration
  return false
}

export const showNativeAlert = async (title: string, message: string) => {
  if (typeof window === 'undefined') return false
  window.alert(asText(title, message))
  return true
}

export const confirmNativeDialog = async (title: string, message: string) => {
  if (typeof window === 'undefined') return null
  return window.confirm(asText(title, message))
}

export const shareNativeContent = async (payload: { title?: string; text?: string; url?: string }) => {
  if (typeof navigator !== 'undefined') {
    const maybeShare = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>
    }
    if (typeof maybeShare.share === 'function') {
      try {
        await maybeShare.share(payload)
        return true
      } catch {
        // keep URL fallback below
      }
    }
  }

  if (!payload.url || typeof window === 'undefined') return false
  window.location.href = payload.url
  return true
}

export const showNativeActionSheet = async (title: string, options: ActionSheetOption[]) => {
  void title
  void options
  return null
}
