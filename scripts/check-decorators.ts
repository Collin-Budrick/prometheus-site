import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'android', 'coverage'])
const LEGACY_DECORATOR_FLAG = 'experimentalDecorators'

const collectFiles = async (dir: string, acc: string[] = []) => {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      await collectFiles(join(dir, entry.name), acc)
      continue
    }
    if (!entry.isFile()) continue
    if (entry.name.endsWith('tsconfig.json') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.mts') || entry.name.endsWith('.cts')) {
      acc.push(join(dir, entry.name))
    }
  }
  return acc
}

const hasLegacyDecoratorFlag = async (filePath: string) => {
  const raw = await readFile(filePath, 'utf8')
  if (!raw.includes(LEGACY_DECORATOR_FLAG)) return false
  if (/\s*"experimentalDecorators"\s*:\s*true/.test(raw)) return true
  try {
    const config = JSON.parse(raw) as { compilerOptions?: Record<string, unknown> }
    return config.compilerOptions?.[LEGACY_DECORATOR_FLAG] === true
  } catch {
    return false
  }
}

const decoratorTokenPattern = /^@[A-Za-z_$][A-Za-z0-9_$]*/
const hasDecoratorSyntax = async (filePath: string) => {
  const raw = await readFile(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  let inTemplate = false
  let inSingle = false
  let inDouble = false
  let inBlockComment = false
  let inLineComment = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    let lineHasDecorator = false
    inLineComment = false
    let escaped = false

    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j]
      const prev = j > 0 ? line[j - 1] : ''

      if (!escaped && ch === '/' && prev === '/' && !inTemplate && !inSingle && !inDouble && !inBlockComment) {
        inLineComment = true
      }
      if (inLineComment) break

      if (!inSingle && !inDouble && ch === '/' && prev === '*' && inBlockComment) {
        inBlockComment = false
        continue
      }
      if (!inSingle && !inDouble && !inTemplate && !inBlockComment && ch === '*' && prev === '/') {
        inBlockComment = true
        continue
      }
      if (inBlockComment) continue

      if (!escaped && ch === '`' && !inSingle && !inDouble) {
        inTemplate = !inTemplate
        continue
      }
      if (inTemplate) continue

      if (!escaped && ch === "'" && !inDouble) {
        inSingle = !inSingle
        continue
      }
      if (!escaped && ch === '"' && !inSingle) {
        inDouble = !inDouble
        continue
      }
      if (!inSingle && !inDouble && ch === '@') {
        const previous = prev
        const tail = line.slice(j)
        const boundary = previous === '' || /\s|[({\[:,;]/.test(previous)
        if (boundary && decoratorTokenPattern.test(tail)) {
          lineHasDecorator = true
          break
        }
      }
      escaped = ch === '\\' && !escaped
      if (!escaped && ch !== '\\') {
        escaped = false
      }
    }
    if (lineHasDecorator) {
      console.error(`${filePath}:${i + 1}: potential decorator usage detected`)
      return true
    }
  }
  return false
}

const main = async () => {
  const files = await collectFiles(ROOT, [])
  const tsConfigFiles = files.filter((file) => file.endsWith('tsconfig.json'))
  const tsFiles = files.filter((file) => {
    const ext = file.slice(file.lastIndexOf('.'))
    return TS_EXTENSIONS.has(ext)
  })

  const configOffenders = (await Promise.all(tsConfigFiles.map(async (file) => (await hasLegacyDecoratorFlag(file) ? file : null)))).filter(Boolean) as string[]
  const decoratorOffenders = (await Promise.all(tsFiles.map(async (file) => (await hasDecoratorSyntax(file) ? file : null)))).filter(Boolean) as string[]

  if (configOffenders.length === 0 && decoratorOffenders.length === 0) {
    console.log('[decorator-check] legacy decorator config and decorator syntax checks passed')
    return
  }

  if (configOffenders.length > 0) {
    console.error('[decorator-check] Found experimentalDecorators=true in:')
    for (const file of configOffenders) {
      console.error(` - ${file}`)
    }
  }
  if (decoratorOffenders.length > 0) {
    console.error('[decorator-check] Potential decorator syntax detected in:')
    for (const file of decoratorOffenders) {
      console.error(` - ${file}`)
    }
    console.error(
      '[decorator-check] If adding decorators, prefer standard TS decorator syntax and keep experimentalDecorators disabled unless explicitly required.'
    )
  }
  process.exit(1)
}

await main()
