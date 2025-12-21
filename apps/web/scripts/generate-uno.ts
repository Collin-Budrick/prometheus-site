import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = process.cwd()
const outputPath = path.join(projectRoot, 'public', 'assets', 'app.css')
const srcDir = path.join(projectRoot, 'src')
const indexHtml = path.join(projectRoot, 'index.html')
const unoConfig = path.join(projectRoot, 'uno.config.ts')

const getLatestMtime = (roots: string[]) => {
  let latest = 0

  for (const root of roots) {
    if (!fs.existsSync(root)) continue

    const stats = fs.statSync(root)
    if (stats.isDirectory()) {
      const queue = [root]
      while (queue.length > 0) {
        const current = queue.pop()
        if (!current) continue
        const currentStats = fs.statSync(current)
        if (currentStats.isDirectory()) {
          const entries = fs.readdirSync(current, { withFileTypes: true })
          for (const entry of entries) {
            queue.push(path.join(current, entry.name))
          }
        } else if (currentStats.isFile()) {
          if (currentStats.mtimeMs > latest) {
            latest = currentStats.mtimeMs
          }
        }
      }
    } else if (stats.isFile()) {
      if (stats.mtimeMs > latest) {
        latest = stats.mtimeMs
      }
    }
  }

  return latest
}

const inputLatest = getLatestMtime([srcDir, indexHtml, unoConfig])
const outputMtime = fs.existsSync(outputPath) ? fs.statSync(outputPath).mtimeMs : 0

if (outputMtime >= inputLatest && outputMtime > 0) {
  console.log('UnoCSS output up-to-date; skipping generation.')
  process.exit(0)
}

const unocssBin = path.resolve(projectRoot, '..', '..', 'node_modules', '.bin', 'unocss')
const unocssCmd = fs.existsSync(unocssBin) ? unocssBin : 'unocss'

const result = spawnSync(
  unocssCmd,
  ['src/**/*.{ts,tsx,js,jsx,mdx,md}', 'index.html', '-c', 'uno.config.ts', '-o', 'public/assets/app.css', '-m'],
  { stdio: 'inherit' }
)

process.exit(result.status ?? 1)
