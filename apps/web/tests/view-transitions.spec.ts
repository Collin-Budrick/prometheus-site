import { test } from '@playwright/test'

test.describe('view transitions', () => {
  test('animates page transitions via Swup @smoke', async ({ page }) => {
    await page.addInitScript(() => {
      const win = window as Window & { __vtCalls?: number; __swupTransitionSeen?: boolean }
      win.__vtCalls = 0
      if (typeof document.startViewTransition === 'function') {
        const original = document.startViewTransition.bind(document)
        document.startViewTransition = ((callback: () => void) => {
          win.__vtCalls = (win.__vtCalls ?? 0) + 1
          return original(callback)
        }) as typeof document.startViewTransition
      }

      win.__swupTransitionSeen = false
      const observer = new MutationObserver((entries) => {
        for (const entry of entries) {
          if (entry.type !== 'attributes' || entry.attributeName !== 'class') continue
          const target = entry.target
          if (!(target instanceof Element)) continue
          const nowChanging = target.classList.contains('is-changing')
          const oldValue = entry.oldValue ?? ''
          const wasChanging = oldValue.split(' ').includes('is-changing')
          if (nowChanging && !wasChanging) {
            win.__swupTransitionSeen = true
            return
          }
        }
      })
      const observeRoot = () => {
        const root = document.documentElement
        if (!root) return
        observer.observe(root, {
          attributes: true,
          attributeOldValue: true,
          subtree: true,
          attributeFilter: ['class']
        })
      }
      if (document.documentElement) {
        observeRoot()
      } else {
        document.addEventListener('DOMContentLoaded', observeRoot, { once: true })
      }
    })

    await page.goto('/')
    await page.waitForFunction(() => document.documentElement.classList.contains('swup-enabled'))

    const navigateAndAssert = async (path: string) => {
      const startCalls = await page.evaluate(() => {
        const win = window as Window & { __vtCalls?: number; __swupTransitionSeen?: boolean }
        win.__swupTransitionSeen = false
        return win.__vtCalls ?? 0
      })

      await page.locator(`a[href="${path}"]`).click({ noWaitAfter: true })
      await page.waitForFunction((nextPath) => window.location.pathname === nextPath, path)
      await page.waitForFunction(() => !(window as Window & { __swup?: { navigating?: boolean } }).__swup?.navigating)

      await page.waitForFunction((initialCalls) => {
        const root = document.documentElement
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        const isNative = root.classList.contains('swup-native') && !reduced
        const win = window as Window & { __vtCalls?: number; __swupTransitionSeen?: boolean }
        if (isNative) {
          return (win.__vtCalls ?? 0) > initialCalls
        }
        return Boolean(win.__swupTransitionSeen)
      }, startCalls)
    }

    await navigateAndAssert('/store')
    await navigateAndAssert('/labs')
    await navigateAndAssert('/ai')
    await navigateAndAssert('/chat')
    await navigateAndAssert('/')
  })
})
