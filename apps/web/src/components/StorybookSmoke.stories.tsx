import { component$ } from '@builder.io/qwik'
import type { Meta, StoryObj } from 'storybook-framework-qwik'

const StorybookSmoke = component$(() => (
  <div
    style="padding: 16px; border: 1px solid #334155; border-radius: 12px; background: #0f172a; color: #e2e8f0;"
  >
    Storybook is running.
  </div>
))

const meta = {
  title: 'Dev/StorybookSmoke',
  component: StorybookSmoke
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
