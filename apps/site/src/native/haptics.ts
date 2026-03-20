let userActionScopeDepth = 0

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // no-op
  }
}

const runIfUserAction = async (operation: () => Promise<void> | void) => {
  if (userActionScopeDepth <= 0) return
  await operation()
}

const runNativeHaptic = async (kind: 'tap' | 'selection' | 'success' | 'warning' | 'error') => {
  void kind
  return false
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
  await runIfUserAction(async () => {
    const handled = await runNativeHaptic('tap')
    if (!handled) vibrate(10)
  })
}

export const triggerHapticSelection = async () => {
  await runIfUserAction(async () => {
    const handled = await runNativeHaptic('selection')
    if (!handled) vibrate([8, 16, 8])
  })
}

export const triggerHapticConfirmation = async (kind: 'success' | 'warning' | 'error' = 'success') => {
  await runIfUserAction(async () => {
    const handled = await runNativeHaptic(kind)
    if (handled) return
    if (kind === 'error') {
      vibrate([20, 40, 20])
      return
    }
    if (kind === 'warning') {
      vibrate([16, 32, 12])
      return
    }
    vibrate([12, 20, 12])
  })
}
