import type { Component } from '@builder.io/qwik'
import type { Meta, StoryObj } from 'storybook-framework-qwik'
import { defaultLanguage, getLanguagePack } from '../../../../apps/site/src/lang'
import { ThemeToggle } from './ThemeToggle'

type PropsOf<TComponent> = TComponent extends Component<infer TProps> ? TProps : never
type ThemeToggleProps = PropsOf<typeof ThemeToggle>

const pack = getLanguagePack(defaultLanguage)
const labels = {
  ariaToDark: pack.ui.themeAriaToDark,
  ariaToLight: pack.ui.themeAriaToLight
}

const syncPreviewTheme = (theme: 'light' | 'dark') => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  window.localStorage.setItem('prometheus-theme', theme)
}

const meta: Meta<ThemeToggleProps> = {
  title: 'UI/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'centered'
  },
  tags: ['autodocs']
}

export default meta

type Story = StoryObj<ThemeToggleProps>

export const Light: Story = {
  render: () => {
    syncPreviewTheme('light')
    return <ThemeToggle labels={labels} initialTheme="light" />
  }
}

export const Dark: Story = {
  render: () => {
    syncPreviewTheme('dark')
    return <ThemeToggle labels={labels} initialTheme="dark" />
  }
}
