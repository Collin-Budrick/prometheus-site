import type { Meta, StoryObj } from 'storybook-framework-qwik'
import { HomeDemoPreview } from './HomeDemoPreview'
import {
  noopActivate,
  storybookDemoUi,
  storybookLanguagePack,
  type HomeDemoPreviewProps
} from './HomeDemoPreview.story-helpers'

const meta: Meta<HomeDemoPreviewProps> = {
  title: 'Site/Home Demos/Planner',
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
      ui={storybookDemoUi}
      planner={storybookLanguagePack.demos.planner}
      activating={false}
      onActivate$={noopActivate}
    />
  )
}
