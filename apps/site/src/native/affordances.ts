import { ActionSheet, type ActionSheetOption } from '@capacitor/action-sheet'
import { Dialog } from '@capacitor/dialog'
import { Share } from '@capacitor/share'
import { Toast } from '@capacitor/toast'
import { isNativeCapacitorRuntime } from './runtime'

export const showNativeToast = async (text: string, duration: 'short' | 'long' = 'short') => {
  if (!isNativeCapacitorRuntime()) return false
  await Toast.show({ text, duration })
  return true
}

export const showNativeAlert = async (title: string, message: string) => {
  if (!isNativeCapacitorRuntime()) return false
  await Dialog.alert({ title, message })
  return true
}

export const confirmNativeDialog = async (title: string, message: string) => {
  if (!isNativeCapacitorRuntime()) return null
  const result = await Dialog.confirm({ title, message })
  return result.value
}

export const shareNativeContent = async (payload: { title?: string; text?: string; url?: string }) => {
  if (!isNativeCapacitorRuntime()) return false
  await Share.share(payload)
  return true
}

export const showNativeActionSheet = async (title: string, options: ActionSheetOption[]) => {
  if (!isNativeCapacitorRuntime()) return null
  const result = await ActionSheet.showActions({ title, options })
  return result.index
}
