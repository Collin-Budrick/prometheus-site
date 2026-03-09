import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const distRoot = path.resolve(siteRoot, 'dist')
const host = process.env.HOST || '127.0.0.1'
const port = Number.parseInt(process.env.PORT || '4173', 10)

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff2', 'font/woff2']
])

const toFilePath = (requestPath) => {
  const decoded = decodeURIComponent(requestPath.split('?')[0] || '/')
  const normalized = decoded === '/' ? '/index.html' : decoded
  const exactPath = path.resolve(distRoot, `.${normalized}`)
  if (existsSync(exactPath)) {
    if (statSync(exactPath).isDirectory()) {
      return path.join(exactPath, 'index.html')
    }
    return exactPath
  }

  const withIndex = path.resolve(distRoot, `.${normalized}`, 'index.html')
  if (existsSync(withIndex)) return withIndex

  const htmlVariant = path.resolve(distRoot, `.${normalized}.html`)
  if (existsSync(htmlVariant)) return htmlVariant

  return path.resolve(distRoot, 'index.html')
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }

  const filePath = toFilePath(req.url || '/')
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const ext = path.extname(filePath)
  const contentType = mimeTypes.get(ext) || 'application/octet-stream'
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  })

  if (method === 'HEAD') {
    res.end()
    return
  }

  createReadStream(filePath).pipe(res)
})

server.listen(port, host, () => {
  console.log(`Serving ${distRoot} at http://${host}:${port}`)
})
