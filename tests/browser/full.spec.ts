import { expect, test, type Page } from '@playwright/test'

const expectLinkVisible = async (page: Page, name: string) => {
  await expect(page.getByRole('link', { name }).first()).toBeVisible()
}

const expectRouteReachable = async (status: number) => {
  expect(status).toBeGreaterThanOrEqual(200)
  expect(status).toBeLessThan(400)
}

test('full preset exposes showcase routes and dock links', async ({ page, request }) => {
  test.slow()

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expectLinkVisible(page, 'Home')
  await expectLinkVisible(page, 'Login')

  const [rootStatus, storeStatus, labStatus, loginStatus, offlineStatus] = await Promise.all([
    request.get('/').then((response) => response.status()),
    request.get('/store/').then((response) => response.status()),
    request.get('/lab/').then((response) => response.status()),
    request.get('/login/').then((response) => response.status()),
    request.get('/offline/').then((response) => response.status())
  ])

  await expectRouteReachable(rootStatus)
  await expectRouteReachable(storeStatus)
  await expectRouteReachable(labStatus)
  await expectRouteReachable(loginStatus)
  await expectRouteReachable(offlineStatus)

  await page.goto('/store/', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/store\/?(?:\?[^#]*)?$/)

  await page.goto('/lab/', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/lab\/?(?:\?[^#]*)?$/)

  await page.goto('/chat/', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login\/?(?:\?[^#]*)?$/)
})
