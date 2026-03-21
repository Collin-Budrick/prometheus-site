import { expect, test, type Page } from '@playwright/test'

const expectLinkVisible = async (page: Page, name: string) => {
  await expect(page.getByRole('link', { name }).first()).toBeVisible()
}

const expectRouteReachable = async (status: number) => {
  expect(status).toBeGreaterThanOrEqual(200)
  expect(status).toBeLessThan(400)
}

test('full preset exposes showcase routes and dock links', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expectLinkVisible(page, 'Home')
  await expectLinkVisible(page, 'Login')

  await expectRouteReachable((await request.get('/')).status())
  await expectRouteReachable((await request.get('/store/')).status())
  await expectRouteReachable((await request.get('/lab/')).status())
  await expectRouteReachable((await request.get('/login/')).status())
  await expectRouteReachable((await request.get('/offline/')).status())

  await page.goto('/store/', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/store\/?(?:\?[^#]*)?$/)

  await page.goto('/lab/', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/lab\/?(?:\?[^#]*)?$/)

  await page.goto('/chat/', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login\/?(?:\?[^#]*)?$/)
})
