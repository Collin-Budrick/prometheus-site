import { expect, test } from '@playwright/test'

test('updates static route copy when language toggles', async ({ page }) => {
  await page.goto('/store')

  const card = page.locator('.fragment-card')
  const title = card.locator('h1')
  const description = card.locator('p')
  const action = card.locator('.action-button')

  const initialTitle = (await title.textContent())?.trim() || ''
  const initialDescription = (await description.textContent())?.trim() || ''
  const initialAction = (await action.textContent())?.trim() || ''

  expect(initialTitle).not.toBe('')
  expect(initialDescription).not.toBe('')
  expect(initialAction).not.toBe('')

  const toggle = page.locator('.lang-toggle')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await toggle.click()
    const lang = await page.locator('html').getAttribute('lang')
    if (lang === 'ko') break
  }

  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await expect(title).not.toHaveText(initialTitle)
  await expect(description).not.toHaveText(initialDescription)
  await expect(action).not.toHaveText(initialAction)
})
