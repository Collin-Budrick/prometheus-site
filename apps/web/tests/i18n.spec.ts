import { expect, test } from '@playwright/test'

test.describe('i18n', () => {
  test.use({ ignoreHTTPSErrors: true })

  test('switches locale without navigation @i18n', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: /Microscopic first load/i })).toBeVisible()

    await page.getByLabel(/Settings/i).click()
    await expect(page.locator('.settings-panel')).toBeVisible()
    await page.locator('summary.settings-group-trigger', { hasText: /Language/i }).click()

    const japaneseOption = page.getByRole('button', { name: /Japanese|日本語/i })
    await expect(japaneseOption).toBeVisible()

    const navigationPromise = page.waitForNavigation({ timeout: 2000 }).then(() => true).catch(() => false)
    await japaneseOption.click()

    await expect(page.getByRole('heading', { level: 1, name: /初回ロードは極小、機能は大きく/ })).toBeVisible()

    const navigated = await navigationPromise
    expect(navigated).toBe(false)
  })
})
