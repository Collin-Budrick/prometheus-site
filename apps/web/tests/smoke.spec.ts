import { expect, test } from '@playwright/test'

test.describe('smoke', () => {
  test('renders landing page hero copy @smoke', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: /Microscopic first load/i })).toBeVisible()
    await expect(page.getByText(/Performance first/i)).toBeVisible()
  })

  test('navigates to store and exposes interactive controls @smoke', async ({ page }) => {
    await page.goto('/store')
    await expect(page.getByRole('heading', { level: 1, name: /Fast browsing with tiny payloads/i })).toBeVisible()

    const refreshButton = page.getByRole('button', { name: /Refresh/i })
    await expect(refreshButton).toBeVisible()
    await refreshButton.click()

    await expect(page.getByText('Inventory', { exact: true })).toBeVisible()
    await expect(page.getByText(/Add an item/i)).toBeVisible()
  })
})
