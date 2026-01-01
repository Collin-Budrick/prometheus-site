import { existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const apiRoot = path.join(root, 'apps', 'api')

const isWindowsArm64 = process.platform === 'win32' && process.arch === 'arm64'
const bindingFile = path.join(apiRoot, 'node_modules', 'oxlint', 'dist', 'oxlint.win32-arm64-msvc.node')
const bindingPackage = path.join(apiRoot, 'node_modules', '@oxlint', 'win32-arm64')

if (isWindowsArm64 && !existsSync(bindingFile) && !existsSync(bindingPackage)) {
  console.warn('[lefthook] oxlint native binding missing; skipping lint for pre-commit.')
  process.exit(0)
}

const result = Bun.spawnSync(['bun', 'run', '--cwd', 'apps/api', 'lint'], {
  stdio: ['inherit', 'inherit', 'inherit']
})

process.exit(result.exitCode ?? 1)
