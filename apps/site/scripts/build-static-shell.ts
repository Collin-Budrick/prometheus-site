import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getStaticShellRouteConfigs, STATIC_SHELL_REGION_ATTR } from '../src/shell/core/constants'
import type { StaticShellSnapshot, StaticShellSnapshotManifest } from '../src/shell/core/seed'
import { supportedLanguages, type Lang } from '../src/lang/manifest'
import {
  createStaticSnapshotManifestEntry,
  STATIC_SHELL_SNAPSHOT_MANIFEST_PATH,
  toStaticSnapshotAssetPath,
  toStaticSnapshotKey
} from '../src/shell/core/snapshot'

type PreviewMiddleware = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (error?: unknown) => void
) => void | Promise<void>

type PreviewModule = {
  staticFile?: PreviewMiddleware
  router?: PreviewMiddleware
  notFound?: PreviewMiddleware
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const distRoot = path.resolve(siteRoot, 'dist')
const staticShellOutDir = path.resolve(distRoot, 'build', 'static-shell')
const snapshotOutDir = path.resolve(distRoot, path.dirname(STATIC_SHELL_SNAPSHOT_MANIFEST_PATH))
const previewEntryPath = path.resolve(siteRoot, 'server', 'entry.preview.js')
const buildEnv = {
  ...process.env,
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0'
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const runPreviewBuild = () => {
  rmSync(path.resolve(siteRoot, 'server'), { recursive: true, force: true })
  const result = spawnSync(
    process.execPath,
    ['run', 'scripts/vite-run.ts', '--', 'build', '--ssr', 'src/entry.preview.tsx'],
    {
      cwd: siteRoot,
      stdio: 'inherit',
      env: buildEnv
    }
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const extractHtmlTitle = (html: string) => {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i)
  return match?.[1]?.trim() ?? ''
}

const extractElementByAttribute = (html: string, attributeName: string, attributeValue: string) => {
  const opener = new RegExp(
    `<([a-zA-Z][\\w:-]*)\\b[^>]*\\b${escapeRegex(attributeName)}=(["'])${escapeRegex(attributeValue)}\\2[^>]*>`,
    'i'
  )
  const match = opener.exec(html)
  if (!match || !match[1]) return null

  const tagName = match[1]
  const tagPattern = new RegExp(`<(/?)${escapeRegex(tagName)}\\b[^>]*>`, 'gi')
  tagPattern.lastIndex = match.index
  let depth = 0

  for (;;) {
    const tagMatch = tagPattern.exec(html)
    if (!tagMatch) break
    const source = tagMatch[0]
    const closing = tagMatch[1] === '/'
    const selfClosing = source.endsWith('/>')

    if (!closing && !selfClosing) {
      depth += 1
    } else if (closing) {
      depth -= 1
    }

    if (depth === 0) {
      return html.slice(match.index, tagPattern.lastIndex)
    }
  }

  return null
}

const createPreviewServer = async () => {
  const previewModule = (await import(pathToFileURL(previewEntryPath).href)) as { default?: PreviewModule }
  const app = previewModule.default
  if (!app) {
    throw new Error('Missing preview entry default export.')
  }

  const middlewares = [app.staticFile, app.router, app.notFound].filter(
    (entry): entry is PreviewMiddleware => typeof entry === 'function'
  )

  const server = http.createServer((req, res) => {
    let index = 0

    const next = (error?: unknown) => {
      if (error) {
        if (!res.headersSent) {
          res.statusCode = 500
        }
        if (!res.writableEnded) {
          res.end(error instanceof Error ? error.message : 'Preview middleware failed')
        }
        return
      }

      const middleware = middlewares[index]
      index += 1
      if (!middleware) {
        if (!res.writableEnded) {
          res.statusCode = 404
          res.end('Not found')
        }
        return
      }

      try {
        const result = middleware(req, res, next)
        if (result && typeof (result as Promise<void>).then === 'function') {
          ;(result as Promise<void>).catch(next)
        }
      } catch (caughtError) {
        next(caughtError)
      }
    }

    next()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Unable to resolve preview server address.')
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  }
}

const fetchRouteSnapshot = async (origin: string, routePath: string, lang: Lang): Promise<StaticShellSnapshot> => {
  const url = new URL(routePath, origin)
  url.searchParams.set('lang', lang)
  const response = await fetch(url, {
    headers: {
      accept: 'text/html'
    }
  })
  if (!response.ok) {
    throw new Error(`Snapshot fetch failed for ${routePath} (${lang}): ${response.status}`)
  }

  const html = await response.text()
  const header = extractElementByAttribute(html, STATIC_SHELL_REGION_ATTR, 'header')
  const main = extractElementByAttribute(html, STATIC_SHELL_REGION_ATTR, 'main')
  const dock = extractElementByAttribute(html, STATIC_SHELL_REGION_ATTR, 'dock')
  if (!header || !main || !dock) {
    throw new Error(`Snapshot extraction failed for ${routePath} (${lang})`)
  }

  return {
    path: routePath,
    lang,
    title: extractHtmlTitle(html),
    regions: {
      header,
      main,
      dock
    }
  }
}

const writeSnapshots = async (origin: string) => {
  rmSync(snapshotOutDir, { recursive: true, force: true })
  mkdirSync(snapshotOutDir, { recursive: true })

  const manifest: StaticShellSnapshotManifest = {}

  for (const routeConfig of getStaticShellRouteConfigs()) {
    const snapshotKey = toStaticSnapshotKey(routeConfig.snapshotKey)
    for (const lang of supportedLanguages) {
      const snapshot = await fetchRouteSnapshot(origin, routeConfig.path, lang)
      const assetPath = path.resolve(distRoot, toStaticSnapshotAssetPath(snapshotKey, lang))
      mkdirSync(path.dirname(assetPath), { recursive: true })
      writeFileSync(assetPath, `${JSON.stringify(snapshot)}\n`)
      createStaticSnapshotManifestEntry(manifest, snapshotKey, lang)
    }
  }

  writeFileSync(path.resolve(distRoot, STATIC_SHELL_SNAPSHOT_MANIFEST_PATH), `${JSON.stringify(manifest)}\n`)
}

runPreviewBuild()

const previewServer = await createPreviewServer()
try {
  await writeSnapshots(previewServer.origin)
} finally {
  await previewServer.close()
}
