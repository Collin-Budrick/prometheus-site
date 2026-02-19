import { invokeNativeCommand, loadNativePlugin } from './bridge'
import { isNativeShellRuntime } from './runtime'

export type ActionSheetOption = {
  title: string
  style?: 'default' | 'cancel' | 'destructive'
}

const asText = (title: string, message: string) => (title.trim() ? `${title}\n\n${message}` : message)

export const showNativeToast = async (text: string, duration: 'short' | 'long' = 'short') => {
  if (!isNativeShellRuntime()) return false
  const result = await invokeNativeCommand<boolean>('native_show_toast', { text, duration })
  return result === true
}

export const showNativeAlert = async (title: string, message: string) => {
  if (isNativeShellRuntime()) {
    const dialogPlugin = await loadNativePlugin<{ message?: (content: string, options?: { title?: string }) => Promise<void> }>(
      '@tauri-apps/plugin-dialog'
    )
    if (dialogPlugin?.message) {
      try {
        await dialogPlugin.message(message, { title: title.trim() || undefined })
        return true
      } catch {
        // web fallback below
      }
    }
  }

  if (typeof window === 'undefined') return false
  window.alert(asText(title, message))
  return true
}

export const confirmNativeDialog = async (title: string, message: string) => {
  if (isNativeShellRuntime()) {
    const dialogPlugin = await loadNativePlugin<{
      confirm?: (content: string, options?: { title?: string; kind?: 'info' | 'warning' | 'error' }) => Promise<boolean>
    }>('@tauri-apps/plugin-dialog')
    if (dialogPlugin?.confirm) {
      try {
        return await dialogPlugin.confirm(message, { title: title.trim() || undefined })
      } catch {
        // web fallback below
      }
    }
  }

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
        // keep native/url fallback below
      }
    }
  }

  if (!isNativeShellRuntime() || !payload.url) return false
  const shellPlugin = await loadNativePlugin<{ open?: (value: string) => Promise<void> }>('@tauri-apps/plugin-shell')
  if (!shellPlugin?.open) return false
  try {
    await shellPlugin.open(payload.url)
    return true
  } catch {
    return false
  }
}

export const showNativeActionSheet = async (title: string, options: ActionSheetOption[]) => {
  if (!isNativeShellRuntime() || options.length === 0) return null
  const index = await invokeNativeCommand<number | null>('native_action_sheet', { title, options })
  return typeof index === 'number' && Number.isFinite(index) && index >= 0 ? Math.trunc(index) : null
}
