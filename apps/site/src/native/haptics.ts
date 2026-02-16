import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNativeCapacitorRuntime } from './runtime'

let userActionScopeDepth = 0

const runIfUserAction = async (operation: () => Promise<void>) => {
  if (!isNativeCapacitorRuntime()) return
  if (userActionScopeDepth <= 0) return
  try {
    await operation()
  } catch {
    // no-op: haptics may be unavailable on some devices.
  }
}

export const withUserActionHaptics = async <T>(operation: () => T | Promise<T>) => {
  userActionScopeDepth += 1
  try {
    return await operation()
  } finally {
    userActionScopeDepth = Math.max(0, userActionScopeDepth - 1)
  }
}

export const triggerHapticTap = async () => {
  await runIfUserAction(() => Haptics.impact({ style: ImpactStyle.Light }))
}

export const triggerHapticSelection = async () => {
  await runIfUserAction(() => Haptics.selectionStart().then(() => Haptics.selectionChanged()).then(() => Haptics.selectionEnd()))
}

export const triggerHapticConfirmation = async (kind: 'success' | 'warning' | 'error' = 'success') => {
  const type =
    kind === 'error'
      ? NotificationType.Error
      : kind === 'warning'
        ? NotificationType.Warning
        : NotificationType.Success

  await runIfUserAction(() => Haptics.notification({ type }))
}
