import { expect, test, type Page } from '@playwright/test'

const expectLinkHidden = async (page: Page, name: string) => {
  await expect(page.getByRole('link', { name })).toHaveCount(0)
}

test('core preset hides optional bundles and returns 404 for disabled routes', async ({ page, request }) => {
  test.slow()

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Login' }).first()).toBeVisible()
  await expectLinkHidden(page, 'Store')
  await expectLinkHidden(page, 'Lab')
  await expectLinkHidden(page, 'Chat')
  await expectLinkHidden(page, 'Offline')

  const [rootOk, loginOk, storeStatus, labStatus, chatStatus, offlineStatus] = await Promise.all([
    request.get('/').then((response) => response.ok()),
    request.get('/login/').then((response) => response.ok()),
    request.get('/store/').then((response) => response.status()),
    request.get('/lab/').then((response) => response.status()),
    request.get('/chat/').then((response) => response.status()),
    request.get('/offline/').then((response) => response.status())
  ])

  await expect(rootOk).toBeTruthy()
  await expect(loginOk).toBeTruthy()
  expect(storeStatus).toBe(404)
  expect(labStatus).toBe(404)
  expect(chatStatus).toBe(404)
  expect(offlineStatus).toBe(404)
})
