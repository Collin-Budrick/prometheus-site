import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

const maxBytes = 2048
const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../src/global.css')
const css = readFileSync(cssPath)

const { code } = transform({
  filename: cssPath,
  code: css,
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
