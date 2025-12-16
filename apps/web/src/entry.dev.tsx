import { render, type RenderOptions } from '@builder.io/qwik'
import Root from './root'

declare global {
  // eslint-disable-next-line no-var
  var __prometheusDevCachePurged: boolean | undefined
}

const purgeDevCaches = async () => {
  if (!import.meta.env.DEV) return
  if (globalThis.__prometheusDevCachePurged) return
  globalThis.__prometheusDevCachePurged = true

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }

  if ('caches' in globalThis) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

export default async function renderEntry(opts: RenderOptions = {}) {
  await purgeDevCaches()
  return render(document, <Root />, opts)
}
