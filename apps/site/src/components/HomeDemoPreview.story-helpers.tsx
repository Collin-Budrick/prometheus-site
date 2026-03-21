import { $ } from '@builder.io/qwik'
import type { Component } from '@builder.io/qwik'
import { defaultLanguage, getLanguagePack } from '../lang'
import { HomeDemoPreview } from './HomeDemoPreview'

type PropsOf<TComponent> = TComponent extends Component<infer TProps> ? TProps : never

export type HomeDemoPreviewProps = PropsOf<typeof HomeDemoPreview>

const pack = getLanguagePack(defaultLanguage)

export const storybookDemoUi = {
  demoActivate: pack.ui.demoActivate,
  demoActivating: pack.ui.demoActivating
}

export const storybookLanguagePack = pack

export const noopActivate = $(() => {})
