import { READY_STAGGER_DURATION_MS } from '../ready-stagger'

export type FragmentCardInitialStage =
  | 'waiting-payload'
  | 'waiting-css'
  | 'waiting-islands'
  | 'waiting-client-tasks'
  | 'waiting-assets'
  | 'ready'

export type FragmentCardRevealPhase = 'holding' | 'queued' | 'visible'

type ResolveFragmentCardRevealDecisionOptions = {
  baseStage: FragmentCardInitialStage
  loaded: boolean
  inView: boolean
  cssSettled: boolean
  taskCount: number
  taskKeys: string
  forced: boolean
  settled: boolean
  revealPhase: FragmentCardRevealPhase
}

export type FragmentCardRevealDecision = {
  stage: FragmentCardInitialStage
  fragmentReady: boolean
  revealPhase: FragmentCardRevealPhase
  shouldWaitForAssets: boolean
}

export const resolveFragmentCardRevealDecision = ({
  baseStage,
  loaded,
  inView,
  cssSettled,
  taskCount,
  taskKeys,
  forced,
  settled,
  revealPhase
}: ResolveFragmentCardRevealDecisionOptions): FragmentCardRevealDecision => {
  if (settled) {
    return {
      stage: 'ready',
      fragmentReady: true,
      revealPhase,
      shouldWaitForAssets: false
    }
  }

  if (baseStage === 'waiting-payload' || !loaded) {
    return {
      stage: 'waiting-payload',
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: false
    }
  }

  if (!inView) {
    return {
      stage: baseStage,
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: false
    }
  }

  if (!cssSettled && !forced) {
    return {
      stage: 'waiting-css',
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: false
    }
  }

  if (!forced && taskCount > 0) {
    return {
      stage: taskKeys.includes('island:') ? 'waiting-islands' : 'waiting-client-tasks',
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: false
    }
  }

  return {
    stage: forced ? 'ready' : 'waiting-assets',
    fragmentReady: false,
    revealPhase: 'holding',
    shouldWaitForAssets: true
  }
}

export const resolveFragmentCardUnlockDelay = ({
  delayMs,
  durationMs = READY_STAGGER_DURATION_MS,
  immediate = false
}: {
  delayMs: number
  durationMs?: number
  immediate?: boolean
}) => {
  if (immediate) {
    return 0
  }

  return Math.max(delayMs, 0) + Math.max(durationMs, 0) + 40
}
