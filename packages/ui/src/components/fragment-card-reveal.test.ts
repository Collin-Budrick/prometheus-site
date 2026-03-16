import { describe, expect, it } from 'bun:test'

import {
  resolveFragmentCardRevealDecision,
  resolveFragmentCardUnlockDelay
} from './fragment-card-reveal'

describe('fragment-card reveal helpers', () => {
  it('keeps the whole card in holding while CSS is still settling', () => {
    expect(
      resolveFragmentCardRevealDecision({
        baseStage: 'ready',
        loaded: true,
        inView: true,
        cssSettled: false,
        taskCount: 0,
        taskKeys: '',
        forced: false,
        settled: false,
        revealPhase: 'holding'
      })
    ).toEqual({
      stage: 'waiting-css',
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: false
    })
  })

  it('keeps the whole card in holding while initial client tasks are pending', () => {
    expect(
      resolveFragmentCardRevealDecision({
        baseStage: 'ready',
        loaded: true,
        inView: true,
        cssSettled: true,
        taskCount: 2,
        taskKeys: 'client:init|client:chart',
        forced: false,
        settled: false,
        revealPhase: 'holding'
      })
    ).toEqual({
      stage: 'waiting-client-tasks',
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: false
    })
  })

  it('keeps the whole card in holding while island tasks are pending', () => {
    expect(
      resolveFragmentCardRevealDecision({
        baseStage: 'ready',
        loaded: true,
        inView: true,
        cssSettled: true,
        taskCount: 1,
        taskKeys: 'island:store-create',
        forced: false,
        settled: false,
        revealPhase: 'holding'
      })
    ).toEqual({
      stage: 'waiting-islands',
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: false
    })
  })

  it('waits for assets before entering the reveal queue', () => {
    expect(
      resolveFragmentCardRevealDecision({
        baseStage: 'ready',
        loaded: true,
        inView: true,
        cssSettled: true,
        taskCount: 0,
        taskKeys: '',
        forced: false,
        settled: false,
        revealPhase: 'holding'
      })
    ).toEqual({
      stage: 'waiting-assets',
      fragmentReady: false,
      revealPhase: 'holding',
      shouldWaitForAssets: true
    })
  })

  it('marks the card ready only after stable-height settle completes', () => {
    expect(
      resolveFragmentCardRevealDecision({
        baseStage: 'waiting-assets',
        loaded: true,
        inView: true,
        cssSettled: true,
        taskCount: 0,
        taskKeys: '',
        forced: false,
        settled: true,
        revealPhase: 'queued'
      })
    ).toEqual({
      stage: 'ready',
      fragmentReady: true,
      revealPhase: 'queued',
      shouldWaitForAssets: false
    })
  })

  it('uses an immediate unlock delay for critical or reduced-motion reveals', () => {
    expect(resolveFragmentCardUnlockDelay({ delayMs: 0, immediate: true })).toBe(0)
  })

  it('keeps the height lock until the stagger animation finishes', () => {
    expect(resolveFragmentCardUnlockDelay({ delayMs: 72 })).toBe(292)
  })
})
