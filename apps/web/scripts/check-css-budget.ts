import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

const maxBytes = 2048
const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../src/global.css')
const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '../.cache')
const cachePath = join(cacheDir, 'css-budget.json')

const cssBuffer = readFileSync(cssPath)
const cssMtimeMs = Math.floor(statSync(cssPath).mtimeMs)
if (existsSync(cachePath)) {
  try {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as {
      mtimeMs: number
      sizeBytes: number
      maxBytes: number
    }
    if (cached.mtimeMs === cssMtimeMs && cached.maxBytes === maxBytes) {
      const sizeKb = (cached.sizeBytes / 1024).toFixed(2)
      console.log(`Global CSS budget OK (cached): ${cached.sizeBytes}b (${sizeKb}kb) after Lightning CSS.`)
      process.exit(0)
    }
  } catch {
    // Ignore cache parse errors and proceed with real check.
  }
}

const { code } = transform({
  filename: cssPath,
  code: cssBuffer,
  minify: true,
  drafts: {
    nesting: true,
    customMedia: true
  }
})

if (code.byteLength > maxBytes) {
  console.error(`Global CSS exceeded ${maxBytes}b (${code.byteLength}b). Trim global styles or move them to a route.`)
  process.exit(1)
}

const sizeKb = (code.byteLength / 1024).toFixed(2)
console.log(`Global CSS budget OK: ${code.byteLength}b (${sizeKb}kb) after Lightning CSS.`)

mkdirSync(cacheDir, { recursive: true })
writeFileSync(cachePath, JSON.stringify({ mtimeMs: cssMtimeMs, sizeBytes: code.byteLength, maxBytes }))
