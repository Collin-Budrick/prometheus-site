import { expect, test } from '@playwright/test'

const routes = [
  {
    path: '/',
    slug: 'home',
    budget: {
      fcp: 1_800,
      lcp: 2_500,
      tbt: 150
    }
  },
  {
    path: '/store',
    slug: 'store',
    budget: {
      fcp: 2_000,
      lcp: 2_800,
      tbt: 175
    }
  }
]

type WebVitals = {
  fcp: number
  lcp: number
  tbt: number
}

const collectWebVitals = async (page: import('@playwright/test').Page): Promise<WebVitals> => {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)

  return page.evaluate(() => {
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0]
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint')
    const longTasks = performance.getEntriesByType('longtask')

    const fcp = fcpEntry?.startTime ?? 0
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : 0
    const tbt = longTasks.reduce((total, entry) => {
      const blockingTime = entry.duration - 50
      return blockingTime > 0 ? total + blockingTime : total
    }, 0)

    return { fcp, lcp, tbt }
  })
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.WEB_PORT ?? '4173'}`

test.describe('performance budgets', () => {
  test('meets Web Vitals budgets on key routes @perf', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      baseURL,
      recordHar: { path: testInfo.outputPath('perf.har') }
    })

    await context.tracing.start({
      screenshots: true,
      snapshots: true
    })

    const metricsByRoute: Record<string, WebVitals> = {}

    try {
      for (const route of routes) {
        const page = await context.newPage()
        await page.goto(route.path, { waitUntil: 'networkidle' })

        const metrics = await collectWebVitals(page)
        metricsByRoute[route.slug] = metrics

        await test.step(`budget check for ${route.path}`, async () => {
          expect(metrics.fcp, `${route.path} FCP missing`).toBeGreaterThan(0)
          expect(metrics.lcp, `${route.path} LCP missing`).toBeGreaterThan(0)
          expect(metrics.fcp, `${route.path} FCP ${metrics.fcp.toFixed(0)}ms`).toBeLessThanOrEqual(route.budget.fcp)
          expect(metrics.lcp, `${route.path} LCP ${metrics.lcp.toFixed(0)}ms`).toBeLessThanOrEqual(route.budget.lcp)
          expect(metrics.tbt, `${route.path} TBT ${metrics.tbt.toFixed(0)}ms`).toBeLessThanOrEqual(route.budget.tbt)
        })

        await page.close()
      }
    } finally {
      await context.tracing.stop({ path: testInfo.outputPath('perf-trace.zip') })
      await context.close()
    }

    testInfo.attachments.push({
      name: 'web-vitals.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(metricsByRoute, null, 2))
    })
  })
})
