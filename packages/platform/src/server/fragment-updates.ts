import { normalizePlanPath } from '@core/fragment/planner'
import type { FragmentLang } from '@core/fragment/i18n'

export type FragmentUpdateEvent =
  | {
      type: 'path'
      path: string
      lang?: FragmentLang
    }
  | {
      type: 'fragment'
      id: string
      lang: FragmentLang
      updatedAt?: number
    }

type FragmentUpdateListener = (event: FragmentUpdateEvent) => void

export type FragmentUpdateBroadcaster = {
  notifyFragment: (event: Extract<FragmentUpdateEvent, { type: 'fragment' }>) => void
  notifyPath: (path: string, lang?: FragmentLang) => void
  subscribe: (listener: FragmentUpdateListener) => () => void
}

export const createFragmentUpdateBroadcaster = (): FragmentUpdateBroadcaster => {
  const listeners = new Set<FragmentUpdateListener>()

  const emit = (event: FragmentUpdateEvent) => {
    listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('Fragment update listener failed', error)
      }
    })
  }

  return {
    notifyFragment(event) {
      emit(event)
    },
    notifyPath(path, lang) {
      emit({
        type: 'path',
        path: normalizePlanPath(path),
        ...(lang ? { lang } : {})
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
