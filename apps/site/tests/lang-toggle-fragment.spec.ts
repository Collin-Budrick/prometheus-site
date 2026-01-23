import { expect, test } from '@playwright/test'
import { decodeFragmentPayload } from '@core/fragments'

test('updates planner fragment copy when language toggles', async ({ page }) => {
  await page.goto('/')

  const plannerTitle = page.locator('.planner-demo-title')
  const plannerRun = page.locator('.planner-demo-action')
  const plannerShuffle = page.locator('.planner-demo-secondary')
  const plannerStatus = page.locator('.planner-demo-status')
  const plannerHeading = page
    .locator('[data-fragment-id="fragment://page/home/planner@v1"] h2')
    .first()
  const plannerDescription = page
    .locator('[data-fragment-id="fragment://page/home/planner@v1"] p')
    .first()
  const plannerMetaLine = page
    .locator('[data-fragment-id="fragment://page/home/planner@v1"] .meta-line')
    .first()

  await expect(plannerTitle).toHaveText('Planner simulation')
  await expect(plannerRun).toHaveText('Run plan')
  await expect(plannerShuffle).toHaveText('Shuffle cache')
  await expect(plannerStatus).toHaveText('Waiting on planner execution.')
  await expect(plannerHeading).toHaveText('Planner executes before rendering.')
  await expect(plannerDescription).toHaveText(
    'Dependency resolution, cache hit checks, and runtime selection happen up front. Rendering only occurs on cache miss; revalidation runs asynchronously.'
  )
  await expect(plannerMetaLine).toContainText('fragment planner')

  await page.waitForFunction(() => (window as any).__PROM_REFRESH_FRAGMENTS)

  const fragmentRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return (
      url.pathname.endsWith('/fragments') &&
      url.searchParams.get('lang') === 'ko' &&
      url.searchParams.get('id') === 'fragment://page/home/planner@v1'
    )
  })

  const toggle = page.locator('.lang-toggle')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await toggle.click()
    const lang = await page.locator('html').getAttribute('lang')
    if (lang === 'ko') break
  }

  const request = await fragmentRequest
  const response = await request.response()
  expect(response?.ok()).toBeTruthy()
  const body = await response?.body()
  expect(body).toBeTruthy()
  if (body) {
    const payload = decodeFragmentPayload(new Uint8Array(body))
    const texts: string[] = []
    const walk = (node: typeof payload.tree) => {
      if (node?.type === 'text' && node.text) texts.push(node.text)
      if (node?.children) node.children.forEach(walk)
    }
    walk(payload.tree)
    expect(texts).toContain('플래너는 렌더링 전에 실행됩니다.')
  }

  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
  await expect(plannerTitle).toHaveText('플래너 시뮬레이션')
  await expect(plannerRun).toHaveText('플랜 실행')
  await expect(plannerShuffle).toHaveText('캐시 섞기')
  await expect(plannerStatus).toHaveText('플래너 실행을 기다리는 중입니다.')
  await expect(plannerHeading).toHaveText('플래너는 렌더링 전에 실행됩니다.')
  await expect(plannerDescription).toHaveText(
    '의존성 해소, 캐시 히트 확인, 런타임 선택이 먼저 이뤄집니다. 렌더링은 캐시 미스일 때만 수행되며 재검증은 비동기로 실행됩니다.'
  )
  await expect(plannerMetaLine).toContainText('프래그먼트 플래너')
})
