import { mkdir, readdir, copyFile, link, symlink, lstat, unlink } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.join(process.cwd(), 'dist')
const buildDir = path.join(distDir, 'build')

const locales = Bun.argv.slice(2).flatMap((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean))

if (locales.length === 0) {
  console.error('Usage: bun run scripts/emit-locale-build-dirs.ts <locale...>')
  process.exit(1)
}

const isIgnorableMissing = (error: unknown) => {
  return typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'ENOENT'
}

const ensureEmpty = async (filePath: string) => {
  try {
    await unlink(filePath)
  } catch (error) {
    if (!isIgnorableMissing(error)) throw error
  }
}

const ensureDir = async (dirPath: string) => {
  await mkdir(dirPath, { recursive: true })
}

const listBuildFiles = async () => {
  const entries = await readdir(buildDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.length > 0)
}

const exists = async (filePath: string) => {
  try {
    await lstat(filePath)
    return true
  } catch (error) {
    if (isIgnorableMissing(error)) return false
    throw error
  }
}

const mirrorFile = async (sourcePath: string, targetPath: string, relativeTarget: string) => {
  if (await exists(targetPath)) return

  await ensureEmpty(targetPath)

  try {
    await symlink(relativeTarget, targetPath, 'file')
    return
  } catch {}

  try {
    await link(sourcePath, targetPath)
    return
  } catch {}

  await copyFile(sourcePath, targetPath)
}

await ensureDir(buildDir)

const files = await listBuildFiles()
if (files.length === 0) {
  console.warn(`No build artifacts found in ${buildDir}`)
  process.exit(0)
}

for (const locale of locales) {
  const localeDir = path.join(buildDir, locale)
  await ensureDir(localeDir)

  for (const file of files) {
    const sourcePath = path.join(buildDir, file)
    const targetPath = path.join(localeDir, file)
    await mirrorFile(sourcePath, targetPath, path.join('..', file))
  }
}

console.log(`Mirrored ${files.length} build files into: ${locales.map((locale) => `build/${locale}/`).join(', ')}`)

