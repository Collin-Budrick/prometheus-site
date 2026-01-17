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

const resolveRolldownBindingPath = (rootDir: string, arch: string) => {
  if (process.platform !== 'win32') return null
  if (process.env.NAPI_RS_NATIVE_LIBRARY_PATH) return null
  const bindingPackage =
    arch === 'x64'
      ? '@rolldown/binding-win32-x64-msvc'
      : arch === 'arm64'
        ? '@rolldown/binding-win32-arm64-msvc'
        : null
  if (!bindingPackage) return null
  const bindingFile =
    arch === 'x64' ? 'rolldown-binding.win32-x64-msvc.node' : 'rolldown-binding.win32-arm64-msvc.node'
  const candidate = path.resolve(rootDir, 'node_modules', bindingPackage, bindingFile)
  return existsSync(candidate) ? candidate : null
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

const bindingPath = resolveRolldownBindingPath(workspaceRoot, runtime.arch)
if (bindingPath) {
  env.NAPI_RS_NATIVE_LIBRARY_PATH = bindingPath
} else if (process.platform === 'win32' && !env.NAPI_RS_NATIVE_LIBRARY_PATH) {
  const hintArch = runtime.arch === 'arm64' || runtime.arch === 'x64' ? runtime.arch : 'arm64'
  const hintCpu = hintArch === 'x64' ? 'x64' : 'arm64'
  console.warn(
    `[rolldown] Native binding not found for ${hintArch}. ` +
      `Run: bun install --cpu ${hintCpu} --os win32 --filter site`
  )
}

if (!existsSync(viteBin)) {
  console.error('[vite] CLI not found. Run bun install before starting dev or preview.')
  process.exit(1)
}

patchRolldownIndex()

const args = process.argv.slice(2)
const child = spawn(runtime.bin, [viteBin, ...args], {
  stdio: 'inherit',
  env
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
