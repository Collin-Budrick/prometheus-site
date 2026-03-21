import type { Meta, StoryObj } from 'storybook-framework-qwik'
import { HomeDemoPreview } from './HomeDemoPreview'
import {
  noopActivate,
  storybookDemoUi,
  storybookLanguagePack,
  type HomeDemoPreviewProps
} from './HomeDemoPreview.story-helpers'

const meta: Meta<HomeDemoPreviewProps> = {
  title: 'Site/Home Demos/Preact',
  component: HomeDemoPreview,
  parameters: {
    layout: 'padded'
  },
  tags: ['autodocs']
}

export default meta

type Story = StoryObj<HomeDemoPreviewProps>

export const PreactIsland: Story = {
  render: () => (
    <HomeDemoPreview
      kind="preact-island"
      ui={storybookDemoUi}
      preactIsland={storybookLanguagePack.demos.preactIsland}
      activating={false}
      onActivate$={noopActivate}
    />
  )
}
