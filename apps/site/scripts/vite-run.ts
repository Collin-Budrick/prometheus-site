import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const viteBin = path.resolve(workspaceRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const rolldownIndex = path.resolve(workspaceRoot, 'node_modules', 'rolldown', 'dist', 'index.mjs')

const resolveNodeRuntime = () => {
  const nodeBinary = process.env.PROMETHEUS_NODE_BINARY?.trim() || 'node'
  const result = spawnSync(nodeBinary, ['-p', 'process.arch'], { encoding: 'utf8' })
  if (result.status === 0 && typeof result.stdout === 'string') {
    const arch = result.stdout.trim()
    if (arch) return { bin: nodeBinary, arch }
  }
  return null
}

const hasWinBinding = (rootDir: string, packageName: string, bindingFile: string) =>
  existsSync(path.resolve(rootDir, 'node_modules', packageName, bindingFile))

const warnMissingBindings = (rootDir: string, arch: string) => {
  if (process.platform !== 'win32') return
  const targetArch = arch === 'x64' || arch === 'arm64' ? arch : 'arm64'
  const rolldownPackage =
    targetArch === 'x64' ? '@rolldown/binding-win32-x64-msvc' : '@rolldown/binding-win32-arm64-msvc'
  const rolldownFile =
    targetArch === 'x64' ? 'rolldown-binding.win32-x64-msvc.node' : 'rolldown-binding.win32-arm64-msvc.node'
  const oxidePackage =
    targetArch === 'x64' ? '@tailwindcss/oxide-win32-x64-msvc' : '@tailwindcss/oxide-win32-arm64-msvc'
  const oxideFile =
    targetArch === 'x64' ? 'tailwindcss-oxide.win32-x64-msvc.node' : 'tailwindcss-oxide.win32-arm64-msvc.node'

  const missingRolldown = !hasWinBinding(rootDir, rolldownPackage, rolldownFile)
  const missingOxide = !hasWinBinding(rootDir, oxidePackage, oxideFile)
  if (!missingRolldown && !missingOxide) return

  const hintCpu = targetArch === 'x64' ? 'x64' : 'arm64'
  const parts = []
  if (missingRolldown) parts.push('rolldown')
  if (missingOxide) parts.push('tailwind oxide')
  console.warn(
    `[native] Missing ${parts.join(' + ')} binding(s) for ${targetArch}. ` +
      `Run: bun install --cpu ${hintCpu} --os win32 --filter site`
  )
}

const patchRolldownIndex = () => {
  if (!existsSync(rolldownIndex)) return
  const source = readFileSync(rolldownIndex, 'utf8')
  if (!source.includes('initTraceSubscriber')) return
  if (source.includes('typeof initTraceSubscriber') || source.includes('typeof import_binding.initTraceSubscriber')) {
    return
  }
  const marker = 'const subscriberGuard = (0, import_binding.initTraceSubscriber)();'
  if (!source.includes(marker)) return
  const patched = source.replace(
    marker,
    'const initTraceSubscriber = import_binding.initTraceSubscriber;\n\tconst subscriberGuard = typeof initTraceSubscriber === "function" ? initTraceSubscriber() : null;'
  )
  writeFileSync(rolldownIndex, patched, 'utf8')
}

const nodeRuntime = resolveNodeRuntime()
const runtime = nodeRuntime ?? { bin: process.execPath, arch: process.arch }
const env = { ...process.env }

if (!existsSync(viteBin)) {
  console.error('[vite] CLI not found. Run bun install before starting dev or preview.')
  process.exit(1)
}

patchRolldownIndex()
warnMissingBindings(workspaceRoot, runtime.arch)

const args = process.argv.slice(2)
const child = spawn(runtime.bin, [viteBin, ...args], {
  stdio: 'inherit',
  env
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
