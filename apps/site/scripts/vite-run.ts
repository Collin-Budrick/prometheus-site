import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const workspaceRoot = path.resolve(siteRoot, '..', '..')
const viteBin = path.resolve(workspaceRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const rolldownIndex = path.resolve(workspaceRoot, 'node_modules', 'rolldown', 'dist', 'index.mjs')
const qwikOptimizerCandidates = [
  path.resolve(siteRoot, 'node_modules', '@builder.io', 'qwik', 'dist', 'optimizer.mjs'),
  path.resolve(workspaceRoot, 'apps', 'site', 'node_modules', '@builder.io', 'qwik', 'dist', 'optimizer.mjs'),
  path.resolve(workspaceRoot, 'node_modules', '@builder.io', 'qwik', 'dist', 'optimizer.mjs')
]

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

const restoreQwikOptimizerDevServerData = () => {
  const legacySerializeMarkers = [
    /const serverData = JSON\.parse\(\$\{JSON\.stringify\(JSON\.stringify\(serverData\)\)\}\)\s*;?/g,
    /const serverData = JSON\.parse\(stringifyDevServerData\(serverData\)\)\s*;?/g
  ]
  const safeSerializedLine = '        const serverData = JSON.parse(${JSON.stringify(safeServerData)});'
  const safeServerDataLine = '  const safeServerData = stringifyDevServerData(serverData);'
  const helperName = 'function stringifyDevServerData(serverData)'
  const helperTemplate = `
function stringifyDevServerData(serverData) {
  const seen = new WeakSet();
  const replacer = (_key, value) => {
    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  };

  try {
    const serialized = JSON.stringify(serverData, replacer);
    if (serialized) {
      return serialized;
    }
  } catch (error) {
    console.warn('Failed to stringify Qwik optimizer payload for dev server data fallback:', error)
    // continue to fallback payload below
  }

  const safeServerData = serverData && typeof serverData === "object" ? serverData : {};
  const fallback = {
    ...safeServerData,
    qwikcity: {
      routeName: safeServerData.qwikcity?.routeName,
      ev: safeServerData.qwikcity?.ev,
      params: safeServerData.qwikcity?.params ?? {},
      loadedRoute: safeServerData.qwikcity?.loadedRoute,
      response: {
        status: safeServerData.qwikcity?.response?.status ?? 200,
        loaders: safeServerData.qwikcity?.response?.loaders ?? {},
        action: safeServerData.qwikcity?.response?.action,
        formData: safeServerData.qwikcity?.response?.formData ?? null
      }
    }
  }

  try {
    return JSON.stringify(fallback)
  } catch (error) {
    console.warn('Failed to fallback stringify Qwik optimizer payload:', error)
    return '{}'
  }
}

`
  const getViteIndexFunction = /\r?\nfunction getViteDevIndexHtml\(entryUrl, serverData\) \{/

  for (const optimizerPath of qwikOptimizerCandidates) {
    if (!existsSync(optimizerPath)) continue
    const source = readFileSync(optimizerPath, 'utf8')
    let next = source

    if (!next.includes(helperName)) {
      const match = next.match(getViteIndexFunction)
      if (match) {
        next = next.replace(match[0], `${helperTemplate}${match[0]}`)
      }
    }

    for (const marker of legacySerializeMarkers) {
      next = next.replace(marker, safeSerializedLine)
    }

    if (next.includes(helperName) && !next.includes(safeServerDataLine) && next.includes('function getViteDevIndexHtml(entryUrl, serverData) {')) {
      next = next.replace(getViteIndexFunction, (getMatch) => `${getMatch}\n${safeServerDataLine}`)
    }
    if (next !== source) {
      writeFileSync(optimizerPath, next, 'utf8')
    }
  }
}

const nodeRuntime = resolveNodeRuntime()
const runtime = nodeRuntime ?? { bin: process.execPath, arch: process.arch }
const env = { ...process.env }
if (env.NODE_OPTIONS && typeof env.NODE_OPTIONS === 'string') {
  if (!env.NODE_OPTIONS.includes('--use-system-ca')) {
    env.NODE_OPTIONS = `${env.NODE_OPTIONS} --use-system-ca`
  }
} else {
  env.NODE_OPTIONS = '--use-system-ca'
}

if (!existsSync(viteBin)) {
  console.error('[vite] CLI not found. Run bun install before starting dev or preview.')
  process.exit(1)
}

patchRolldownIndex()
restoreQwikOptimizerDevServerData()
warnMissingBindings(workspaceRoot, runtime.arch)

const args = process.argv.slice(2)
const hasConfigLoader = args.some((arg) => arg === '--configLoader' || arg.startsWith('--configLoader='))
const hasConfigArg = args.some((arg) => arg === '--config' || arg.startsWith('--config='))
if (!hasConfigLoader) {
  args.push('--configLoader', 'runner')
}
if (!hasConfigArg) {
  args.push('--config', path.resolve(siteRoot, 'vite.config.ts'))
}
const child = spawn(runtime.bin, [viteBin, ...args], {
  stdio: 'inherit',
  env,
  cwd: siteRoot
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
