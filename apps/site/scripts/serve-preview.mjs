import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const previewEntryPath = path.resolve(siteRoot, 'server', 'entry.preview.js')
const host = process.env.HOST || '127.0.0.1'
const port = Number.parseInt(process.env.PORT || '4173', 10)

const previewModule = await import(pathToFileURL(previewEntryPath).href)
const app = previewModule.default

if (!app) {
  throw new Error('Missing preview entry default export.')
}

const middlewares = [app.staticFile, app.router, app.notFound].filter(
  (entry) => typeof entry === 'function'
)

const server = http.createServer((req, res) => {
  let index = 0

  const next = (error) => {
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
      if (result && typeof result.then === 'function') {
        result.catch(next)
      }
    } catch (caughtError) {
      next(caughtError)
    }
  }

  next()
})

server.listen(port, host, () => {
  console.log(`Serving preview bundle at http://${host}:${port}`)
})
