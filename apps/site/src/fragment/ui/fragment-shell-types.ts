import type { FragmentPayloadValue, FragmentPlan, FragmentPlanValue } from '../types'
import type { Lang } from '../../shared/lang-store'
import type { FragmentShellState as ShellState } from './shell-cache'

export type FragmentShellProps = {
  plan: FragmentPlanValue
  initialFragments: FragmentPayloadValue
  path: string
  initialLang: Lang
  initialHtml?: Record<string, string>
  introMarkdown?: string
  preserveFragmentEffects?: boolean
  initialShellState?: ShellState
}

export type FragmentPlanEntry = FragmentPlan['fragments'][number]

export type BentoSlot = {
  id: string
  size: 'small' | 'big' | 'tall'
  column: string
  row: string
}

export type SlottedEntry = {
  entry: FragmentPlanEntry | undefined
  slot: BentoSlot
  isSolo: boolean
}

export type FragmentDragState = {
  active: boolean
  suppressUntil: number
  draggingId: string | null
}
