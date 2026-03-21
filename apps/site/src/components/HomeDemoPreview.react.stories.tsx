import type { Meta, StoryObj } from 'storybook-framework-qwik'
import { HomeDemoPreview } from './HomeDemoPreview'
import {
  noopActivate,
  storybookDemoUi,
  storybookLanguagePack,
  type HomeDemoPreviewProps
} from './HomeDemoPreview.story-helpers'

const meta: Meta<HomeDemoPreviewProps> = {
  title: 'Site/Home Demos/React',
  component: HomeDemoPreview,
  parameters: {
    layout: 'padded'
  },
  tags: ['autodocs']
}

export default meta

type Story = StoryObj<HomeDemoPreviewProps>

export const ReactBinary: Story = {
  render: () => (
    <HomeDemoPreview
      kind="react-binary"
      ui={storybookDemoUi}
      reactBinary={storybookLanguagePack.demos.reactBinary}
      activating={false}
      onActivate$={noopActivate}
    />
  )
}
