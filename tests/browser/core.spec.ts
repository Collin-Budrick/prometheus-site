import { expect, test, type Page } from '@playwright/test'

const expectLinkHidden = async (page: Page, name: string) => {
  await expect(page.getByRole('link', { name })).toHaveCount(0)
}

test('core preset hides optional bundles and returns 404 for disabled routes', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Login' }).first()).toBeVisible()
  await expectLinkHidden(page, 'Store')
  await expectLinkHidden(page, 'Lab')
  await expectLinkHidden(page, 'Chat')
  await expectLinkHidden(page, 'Offline')

  await expect((await request.get('/')).ok()).toBeTruthy()
  await expect((await request.get('/login/')).ok()).toBeTruthy()
  expect((await request.get('/store/')).status()).toBe(404)
  expect((await request.get('/lab/')).status()).toBe(404)
  expect((await request.get('/chat/')).status()).toBe(404)
  expect((await request.get('/offline/')).status()).toBe(404)
})
