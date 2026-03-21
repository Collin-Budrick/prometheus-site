import type { Meta, StoryObj } from 'storybook-framework-qwik'
import { HomeDemoPreview } from './HomeDemoPreview'
import {
  noopActivate,
  storybookDemoUi,
  storybookLanguagePack,
  type HomeDemoPreviewProps
} from './HomeDemoPreview.story-helpers'

const meta: Meta<HomeDemoPreviewProps> = {
  title: 'Site/Home Demos/WASM',
  component: HomeDemoPreview,
  parameters: {
    layout: 'padded'
  },
  tags: ['autodocs']
}

export default meta

type Story = StoryObj<HomeDemoPreviewProps>

export const WasmRenderer: Story = {
  render: () => (
    <HomeDemoPreview
      kind="wasm-renderer"
      ui={storybookDemoUi}
      wasmRenderer={storybookLanguagePack.demos.wasmRenderer}
      activating={false}
      onActivate$={noopActivate}
    />
  )
}
