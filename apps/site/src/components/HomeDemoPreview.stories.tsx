import { $ } from '@builder.io/qwik'
import type { Component } from '@builder.io/qwik'
import type { Meta, StoryObj } from 'storybook-framework-qwik'
import { defaultLanguage, getLanguagePack } from '../lang'
import { HomeDemoPreview } from './HomeDemoPreview'

type PropsOf<TComponent> = TComponent extends Component<infer TProps> ? TProps : never
type HomeDemoPreviewProps = PropsOf<typeof HomeDemoPreview>

const pack = getLanguagePack(defaultLanguage)
const ui = {
  demoActivate: pack.ui.demoActivate,
  demoActivating: pack.ui.demoActivating
}
const noopActivate = $(() => {})

const meta: Meta<HomeDemoPreviewProps> = {
  title: 'Site/HomeDemoPreview',
  component: HomeDemoPreview,
  parameters: {
    layout: 'padded'
  },
  tags: ['autodocs']
}

export default meta

type Story = StoryObj<HomeDemoPreviewProps>

export const Planner: Story = {
  render: () => (
    <HomeDemoPreview
      kind="planner"
      ui={ui}
      planner={pack.demos.planner}
      activating={false}
      onActivate$={noopActivate}
    />
  )
}

export const WasmRenderer: Story = {
  render: () => (
    <HomeDemoPreview
      kind="wasm-renderer"
      ui={ui}
      wasmRenderer={pack.demos.wasmRenderer}
      activating={false}
      onActivate$={noopActivate}
    />
  )
}
