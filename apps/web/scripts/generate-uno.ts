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
const force =
  process.env.UNO_FORCE === '1' ||
  process.env.UNO_FORCE === 'true' ||
  process.env.CI === '1' ||
  process.env.CI === 'true'

if (!force && outputMtime >= inputLatest && outputMtime > 0) {
  console.log('UnoCSS output up-to-date; skipping generation.')
  process.exit(0)
}

const unocssArgs = ['src/**/*.{ts,tsx,js,jsx,mdx,md}', 'index.html', '-c', 'uno.config.ts', '-o', 'public/assets/app.css', '-m']
const binCandidates = [
  path.resolve(projectRoot, '..', '..', 'node_modules', '.bin', 'unocss'),
  path.resolve(projectRoot, 'node_modules', '.bin', 'unocss')
]
const cliCandidates = [
  path.resolve(projectRoot, '..', '..', 'node_modules', '@unocss', 'cli', 'bin', 'unocss.mjs'),
  path.resolve(projectRoot, 'node_modules', '@unocss', 'cli', 'bin', 'unocss.mjs')
]

const unocssBin = binCandidates.find((candidate) => fs.existsSync(candidate))
const unocssCli = cliCandidates.find((candidate) => fs.existsSync(candidate))

let command = 'unocss'
let args = unocssArgs

if (unocssBin) {
  command = unocssBin
} else if (unocssCli) {
  command = process.execPath
  args = [unocssCli, ...unocssArgs]
}

const result = spawnSync(command, args, { stdio: 'inherit' })

if (result.error) {
  console.error(`Failed to run UnoCSS: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
