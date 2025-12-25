import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const formatViolations = (violations: Array<{ id: string; impact: string | null; nodes: { target: string[] }[] }>) =>
  violations
    .map((violation) => {
      const targets = violation.nodes.flatMap((node) => node.target).join(', ')
      return `${violation.id} (${violation.impact ?? 'impact:unknown'}) ${targets}`
    })
    .join('\n')

test.describe('accessibility smoke', () => {
  test('home route passes basic axe checks @a11y', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze()

    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })
})
