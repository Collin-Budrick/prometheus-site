import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const workspaceRoot = path.resolve(siteRoot, '..', '..')
const resolveFirstExisting = (candidates: string[]) => candidates.find((candidate) => existsSync(candidate)) || candidates[0]

const viteBin = resolveFirstExisting([
  path.resolve(siteRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  path.resolve(workspaceRoot, 'node_modules', 'vite', 'bin', 'vite.js')
])
const viteNodeModulesDir = path.resolve(path.dirname(viteBin), '..', '..')

const rolldownIndexCandidates = [
  path.resolve(siteRoot, 'node_modules', 'rolldown', 'dist', 'index.mjs'),
  path.resolve(workspaceRoot, 'node_modules', 'rolldown', 'dist', 'index.mjs')
]
const qwikOptimizerCandidates = [
  path.resolve(siteRoot, 'node_modules', '@builder.io', 'qwik', 'dist', 'optimizer.mjs'),
  path.resolve(workspaceRoot, 'apps', 'site', 'node_modules', '@builder.io', 'qwik', 'dist', 'optimizer.mjs'),
  path.resolve(workspaceRoot, 'node_modules', '@builder.io', 'qwik', 'dist', 'optimizer.mjs')
]

type WinBindingStatus = {
  targetArch: 'x64' | 'arm64'
  missingRolldown: boolean
  missingOxide: boolean
  missingRollup: boolean
  missingLightningcss: boolean
  missingTailwindLightningcss: boolean
  missingEsbuild: boolean
  missingSharp: boolean
}

type EsbuildBindingTarget = {
  packagePathParts: string[]
  expectedVersion: string
}

const resolveNodeRuntime = () => {
  const nodeBinary = process.env.PROMETHEUS_NODE_BINARY?.trim() || 'node'
  const result = spawnSync(nodeBinary, ['-p', 'process.arch'], { encoding: 'utf8' })
  if (result.status === 0 && typeof result.stdout === 'string') {
    const arch = result.stdout.trim()
    if (arch) return { bin: nodeBinary, arch }
  }
  return null
}

const hasWinBinding = (nodeModulesDir: string, packageName: string, bindingFile: string) =>
  existsSync(path.resolve(nodeModulesDir, packageName, bindingFile))

const rolldownPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', 'vite', 'node_modules', 'rolldown', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'vite', 'node_modules', 'rolldown', 'package.json'),
  path.resolve(siteRoot, 'node_modules', 'rolldown', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'rolldown', 'package.json')
]

const tailwindPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', 'tailwindcss', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'tailwindcss', 'package.json')
]

const rollupPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', 'rollup', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'rollup', 'package.json')
]

const lightningcssPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', 'lightningcss', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'lightningcss', 'package.json')
]

const tailwindLightningcssPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', '@tailwindcss', 'node', 'node_modules', 'lightningcss', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', '@tailwindcss', 'node', 'node_modules', 'lightningcss', 'package.json')
]

const esbuildPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', 'esbuild', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'esbuild', 'package.json')
]

const sharpPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', 'sharp', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'sharp', 'package.json')
]

const serwistViteEsbuildPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', '@serwist', 'vite', 'node_modules', 'vite', 'node_modules', 'esbuild', 'package.json'),
  path.resolve(
    workspaceRoot,
    'node_modules',
    '@serwist',
    'vite',
    'node_modules',
    'vite',
    'node_modules',
    'esbuild',
    'package.json'
  )
]

const tailwindViteEsbuildPackageVersionCandidates = [
  path.resolve(
    siteRoot,
    'node_modules',
    '@tailwindcss',
    'vite',
    'node_modules',
    'vite',
    'node_modules',
    'esbuild',
    'package.json'
  ),
  path.resolve(
    workspaceRoot,
    'node_modules',
    '@tailwindcss',
    'vite',
    'node_modules',
    'vite',
    'node_modules',
    'esbuild',
    'package.json'
  )
]

const qwikViteEsbuildPackageVersionCandidates = [
  path.resolve(
    siteRoot,
    'node_modules',
    '@builder.io',
    'qwik',
    'node_modules',
    'vite',
    'node_modules',
    'esbuild',
    'package.json'
  ),
  path.resolve(
    workspaceRoot,
    'node_modules',
    '@builder.io',
    'qwik',
    'node_modules',
    'vite',
    'node_modules',
    'esbuild',
    'package.json'
  )
]

const qwikCityViteEsbuildPackageVersionCandidates = [
  path.resolve(
    siteRoot,
    'node_modules',
    '@builder.io',
    'qwik-city',
    'node_modules',
    'vite',
    'node_modules',
    'esbuild',
    'package.json'
  ),
  path.resolve(
    workspaceRoot,
    'node_modules',
    '@builder.io',
    'qwik-city',
    'node_modules',
    'vite',
    'node_modules',
    'esbuild',
    'package.json'
  )
]

const tsxEsbuildPackageVersionCandidates = [
  path.resolve(siteRoot, 'node_modules', 'tsx', 'node_modules', 'esbuild', 'package.json'),
  path.resolve(workspaceRoot, 'node_modules', 'tsx', 'node_modules', 'esbuild', 'package.json')
]

const resolveStorePackageDir = (nodeModulesDir: string, storePrefix: string, packagePathParts: string[]) => {
  const storeDir = path.resolve(nodeModulesDir, '.bun')
  if (!existsSync(storeDir)) return null
  const entries = readdirSync(storeDir).filter((name) => name.startsWith(`${storePrefix}@`))
  if (!entries.length) return null
  return { storeDir, entries, packagePathParts }
}

const resolveStorePackagePath = (
  nodeModulesDir: string,
  storePrefix: string,
  packagePathParts: string[],
  expectedVersion?: string
) => {
  const store = resolveStorePackageDir(nodeModulesDir, storePrefix, packagePathParts)
  if (!store) return null
  const { storeDir, entries } = store
  const preferredEntry =
    (expectedVersion && entries.find((name) => name === `${storePrefix}@${expectedVersion}`)) || entries[0]
  const candidate = path.resolve(storeDir, preferredEntry, 'node_modules', ...packagePathParts)
  return existsSync(candidate) ? candidate : null
}

const resolvePackageVersion = (packageJsonCandidates: string[]) => {
  for (const candidate of packageJsonCandidates) {
    if (!existsSync(candidate)) continue
    try {
      const source = readFileSync(candidate, 'utf8')
      const parsed = JSON.parse(source) as { version?: string }
      if (typeof parsed.version === 'string' && parsed.version.trim()) return parsed.version.trim()
    } catch {
      // ignore parse errors and continue
    }
  }
  return null
}

const resolveEsbuildBindingTargets = (targetArch: 'x64' | 'arm64'): EsbuildBindingTarget[] => {
  const esbuildPackageNamePart = targetArch === 'x64' ? 'win32-x64' : 'win32-arm64'
  const contexts = [
    { packageJsonCandidates: esbuildPackageVersionCandidates, packagePathPrefix: [] as string[] },
    {
      packageJsonCandidates: serwistViteEsbuildPackageVersionCandidates,
      packagePathPrefix: ['@serwist', 'vite', 'node_modules', 'vite', 'node_modules', 'esbuild', 'node_modules'] as string[]
    },
    {
      packageJsonCandidates: tailwindViteEsbuildPackageVersionCandidates,
      packagePathPrefix: ['@tailwindcss', 'vite', 'node_modules', 'vite', 'node_modules', 'esbuild', 'node_modules'] as string[]
    },
    {
      packageJsonCandidates: qwikViteEsbuildPackageVersionCandidates,
      packagePathPrefix: ['@builder.io', 'qwik', 'node_modules', 'vite', 'node_modules', 'esbuild', 'node_modules'] as string[]
    },
    {
      packageJsonCandidates: qwikCityViteEsbuildPackageVersionCandidates,
      packagePathPrefix: ['@builder.io', 'qwik-city', 'node_modules', 'vite', 'node_modules', 'esbuild', 'node_modules'] as string[]
    },
    {
      packageJsonCandidates: tsxEsbuildPackageVersionCandidates,
      packagePathPrefix: ['tsx', 'node_modules', 'esbuild', 'node_modules'] as string[]
    }
  ]
  const targets: EsbuildBindingTarget[] = []
  for (const context of contexts) {
    const expectedVersion = resolvePackageVersion(context.packageJsonCandidates)
    if (!expectedVersion) continue
    targets.push({
      expectedVersion,
      packagePathParts: [...context.packagePathPrefix, '@esbuild', esbuildPackageNamePart]
    })
  }
  return targets
}

const ensureModuleLinkFromStore = (
  nodeModulesDir: string,
  packagePathParts: string[],
  storePrefix: string,
  verifyFile: string,
  expectedVersion?: string,
  sourcePackagePathParts: string[] = packagePathParts
) => {
  const destination = path.resolve(nodeModulesDir, ...packagePathParts)
  const resolvedFile = path.resolve(destination, verifyFile)
  if (existsSync(resolvedFile)) {
    if (!expectedVersion) return true
    const currentVersion = resolvePackageVersion([path.resolve(destination, 'package.json')])
    if (currentVersion === expectedVersion) return true
  }
  const source = resolveStorePackagePath(nodeModulesDir, storePrefix, sourcePackagePathParts, expectedVersion)
  if (!source) return false

  mkdirSync(path.dirname(destination), { recursive: true })
  try {
    rmSync(destination, { recursive: true, force: true })
  } catch {
    // ignore and continue with best effort
  }

  if (process.platform === 'win32') {
    try {
      cpSync(source, destination, { recursive: true })
      return existsSync(resolvedFile)
    } catch {
      return false
    }
  }

  try {
    symlinkSync(source, destination, 'dir')
    return existsSync(resolvedFile)
  } catch {
    try {
      cpSync(source, destination, { recursive: true })
      return existsSync(resolvedFile)
    } catch {
      return false
    }
  }
}

const repairWinBindingLinks = (nodeModulesDir: string, targetArch: 'x64' | 'arm64') => {
  const rolldownName = targetArch === 'x64' ? 'binding-win32-x64-msvc' : 'binding-win32-arm64-msvc'
  const oxideName = targetArch === 'x64' ? 'oxide-win32-x64-msvc' : 'oxide-win32-arm64-msvc'
  const rollupName = targetArch === 'x64' ? 'rollup-win32-x64-msvc' : 'rollup-win32-arm64-msvc'
  const lightningcssName = targetArch === 'x64' ? 'lightningcss-win32-x64-msvc' : 'lightningcss-win32-arm64-msvc'
  const lightningcssFile = targetArch === 'x64' ? 'lightningcss.win32-x64-msvc.node' : 'lightningcss.win32-arm64-msvc.node'
  const esbuildName = targetArch === 'x64' ? 'win32-x64' : 'win32-arm64'
  const esbuildStorePrefix = `@esbuild+${esbuildName}`
  const sharpName = targetArch === 'x64' ? 'sharp-win32-x64' : 'sharp-win32-arm64'
  const sharpFile = targetArch === 'x64' ? 'lib/sharp-win32-x64.node' : 'lib/sharp-win32-arm64.node'
  const rolldownVersion = resolvePackageVersion(rolldownPackageVersionCandidates)
  const tailwindVersion = resolvePackageVersion(tailwindPackageVersionCandidates)
  const rollupVersion = resolvePackageVersion(rollupPackageVersionCandidates)
  const lightningcssVersion = resolvePackageVersion(lightningcssPackageVersionCandidates)
  const tailwindLightningcssVersion = resolvePackageVersion(tailwindLightningcssPackageVersionCandidates)
  const sharpVersion = resolvePackageVersion(sharpPackageVersionCandidates)
  const esbuildTargets = resolveEsbuildBindingTargets(targetArch)
  ensureModuleLinkFromStore(
    nodeModulesDir,
    ['@rolldown', rolldownName],
    `@rolldown+${rolldownName}`,
    targetArch === 'x64' ? 'rolldown-binding.win32-x64-msvc.node' : 'rolldown-binding.win32-arm64-msvc.node',
    rolldownVersion
  )
  ensureModuleLinkFromStore(
    nodeModulesDir,
    ['@tailwindcss', oxideName],
    `@tailwindcss+${oxideName}`,
    targetArch === 'x64' ? 'tailwindcss-oxide.win32-x64-msvc.node' : 'tailwindcss-oxide.win32-arm64-msvc.node',
    tailwindVersion
  )
  ensureModuleLinkFromStore(
    nodeModulesDir,
    ['@rollup', rollupName],
    `@rollup+${rollupName}`,
    targetArch === 'x64' ? 'rollup.win32-x64-msvc.node' : 'rollup.win32-arm64-msvc.node',
    rollupVersion
  )
  ensureModuleLinkFromStore(nodeModulesDir, [lightningcssName], lightningcssName, lightningcssFile, lightningcssVersion)
  ensureModuleLinkFromStore(
    nodeModulesDir,
    ['@tailwindcss', 'node', 'node_modules', 'lightningcss', 'node_modules', lightningcssName],
    lightningcssName,
    lightningcssFile,
    tailwindLightningcssVersion,
    [lightningcssName]
  )
  ensureModuleLinkFromStore(
    nodeModulesDir,
    ['@img', sharpName],
    `@img+${sharpName}`,
    sharpFile,
    sharpVersion
  )
  for (const target of esbuildTargets) {
    ensureModuleLinkFromStore(
      nodeModulesDir,
      target.packagePathParts,
      esbuildStorePrefix,
      'esbuild.exe',
      target.expectedVersion,
      ['@esbuild', esbuildName]
    )
  }
}

const resolveWinBindingStatus = (nodeModulesDirs: string[], arch: string): WinBindingStatus | null => {
  if (process.platform !== 'win32') return null
  const primaryNodeModulesDir = nodeModulesDirs[0]
  if (!primaryNodeModulesDir) return null
  const targetArch = arch === 'x64' || arch === 'arm64' ? arch : 'arm64'
  const rolldownPackage =
    targetArch === 'x64' ? '@rolldown/binding-win32-x64-msvc' : '@rolldown/binding-win32-arm64-msvc'
  const rolldownFile =
    targetArch === 'x64' ? 'rolldown-binding.win32-x64-msvc.node' : 'rolldown-binding.win32-arm64-msvc.node'
  const oxidePackage =
    targetArch === 'x64' ? '@tailwindcss/oxide-win32-x64-msvc' : '@tailwindcss/oxide-win32-arm64-msvc'
  const oxideFile =
    targetArch === 'x64' ? 'tailwindcss-oxide.win32-x64-msvc.node' : 'tailwindcss-oxide.win32-arm64-msvc.node'
  const rollupPackage =
    targetArch === 'x64' ? '@rollup/rollup-win32-x64-msvc' : '@rollup/rollup-win32-arm64-msvc'
  const rollupFile = targetArch === 'x64' ? 'rollup.win32-x64-msvc.node' : 'rollup.win32-arm64-msvc.node'
  const lightningcssPackage = targetArch === 'x64' ? 'lightningcss-win32-x64-msvc' : 'lightningcss-win32-arm64-msvc'
  const lightningcssFile = targetArch === 'x64' ? 'lightningcss.win32-x64-msvc.node' : 'lightningcss.win32-arm64-msvc.node'
  const tailwindLightningcssPackage = path.join(
    '@tailwindcss',
    'node',
    'node_modules',
    'lightningcss',
    'node_modules',
    lightningcssPackage
  )
  const rolldownExpectedVersion = resolvePackageVersion(rolldownPackageVersionCandidates)
  const tailwindExpectedVersion = resolvePackageVersion(tailwindPackageVersionCandidates)
  const rollupExpectedVersion = resolvePackageVersion(rollupPackageVersionCandidates)
  const lightningcssExpectedVersion = resolvePackageVersion(lightningcssPackageVersionCandidates)
  const tailwindLightningcssExpectedVersion = resolvePackageVersion(tailwindLightningcssPackageVersionCandidates)
  const esbuildTargets = resolveEsbuildBindingTargets(targetArch)
  const sharpPackage = targetArch === 'x64' ? '@img/sharp-win32-x64' : '@img/sharp-win32-arm64'
  const sharpFile = targetArch === 'x64' ? 'lib/sharp-win32-x64.node' : 'lib/sharp-win32-arm64.node'
  const sharpExpectedVersion = resolvePackageVersion(sharpPackageVersionCandidates)

  const missingRolldown = !(() => {
    if (!hasWinBinding(primaryNodeModulesDir, rolldownPackage, rolldownFile)) return false
    if (!rolldownExpectedVersion) return true
    const current = resolvePackageVersion([path.resolve(primaryNodeModulesDir, rolldownPackage, 'package.json')])
    return current === rolldownExpectedVersion
  })()
  const missingOxide = !(() => {
    if (!hasWinBinding(primaryNodeModulesDir, oxidePackage, oxideFile)) return false
    if (!tailwindExpectedVersion) return true
    const current = resolvePackageVersion([path.resolve(primaryNodeModulesDir, oxidePackage, 'package.json')])
    return current === tailwindExpectedVersion
  })()
  const missingRollup = !(() => {
    if (!hasWinBinding(primaryNodeModulesDir, rollupPackage, rollupFile)) return false
    if (!rollupExpectedVersion) return true
    const current = resolvePackageVersion([path.resolve(primaryNodeModulesDir, rollupPackage, 'package.json')])
    return current === rollupExpectedVersion
  })()
  const missingLightningcss = !(() => {
    if (!hasWinBinding(primaryNodeModulesDir, lightningcssPackage, lightningcssFile)) return false
    if (!lightningcssExpectedVersion) return true
    const current = resolvePackageVersion([path.resolve(primaryNodeModulesDir, lightningcssPackage, 'package.json')])
    return current === lightningcssExpectedVersion
  })()
  const missingTailwindLightningcss = !(() => {
    if (!hasWinBinding(primaryNodeModulesDir, tailwindLightningcssPackage, lightningcssFile)) return false
    if (!tailwindLightningcssExpectedVersion) return true
    const current = resolvePackageVersion([
      path.resolve(primaryNodeModulesDir, tailwindLightningcssPackage, 'package.json')
    ])
    return current === tailwindLightningcssExpectedVersion
  })()
  const missingEsbuild = !esbuildTargets.every((target) => {
    const packagePath = path.join(...target.packagePathParts)
    if (!hasWinBinding(primaryNodeModulesDir, packagePath, 'esbuild.exe')) return false
    const current = resolvePackageVersion([path.resolve(primaryNodeModulesDir, packagePath, 'package.json')])
    return current === target.expectedVersion
  })
  const missingSharp = !(() => {
    if (!hasWinBinding(primaryNodeModulesDir, sharpPackage, sharpFile)) return false
    if (!sharpExpectedVersion) return true
    const current = resolvePackageVersion([path.resolve(primaryNodeModulesDir, sharpPackage, 'package.json')])
    return current === sharpExpectedVersion
  })()
  return {
    targetArch,
    missingRolldown,
    missingOxide,
    missingRollup,
    missingLightningcss,
    missingTailwindLightningcss,
    missingEsbuild,
    missingSharp
  }
}

const resolveBunBin = () => {
  const bunGlobal = globalThis as typeof globalThis & { Bun?: { execPath?: string } }
  return (
    (bunGlobal.Bun?.execPath && typeof bunGlobal.Bun.execPath === 'string' && bunGlobal.Bun.execPath) ||
    (typeof process.execPath === 'string' && process.execPath) ||
    'bun'
  )
}

const resolveStoreBackedNodeModulesDir = (nodeModulesDirs: string[]) => {
  for (const dir of nodeModulesDirs) {
    if (existsSync(path.resolve(dir, '.bun'))) return dir
  }
  return nodeModulesDirs[0]
}

const ensureWinBindings = (nodeModulesDirs: string[], arch: string) => {
  const initial = resolveWinBindingStatus(nodeModulesDirs, arch)
  if (
    !initial ||
    (!initial.missingRolldown &&
      !initial.missingOxide &&
      !initial.missingRollup &&
      !initial.missingLightningcss &&
      !initial.missingTailwindLightningcss &&
      !initial.missingEsbuild &&
      !initial.missingSharp)
  ) {
    return initial
  }
  if (process.env.PROMETHEUS_SKIP_NATIVE_REPAIR?.trim() === '1') return initial

  const bunBin = resolveBunBin()
  const commonArgs = ['--cpu', initial.targetArch, '--os', 'win32']
  const installEnv = { ...process.env, PROMETHEUS_SKIP_NATIVE_REPAIR: '1' }
  const tryInstall = (args: string[]) =>
    spawnSync(bunBin, args, { stdio: 'inherit', cwd: workspaceRoot, env: installEnv })

  const filtered = tryInstall(['install', ...commonArgs, '--filter', 'site'])
  if (filtered.status !== 0) {
    tryInstall(['install', ...commonArgs])
  }
  for (const nodeModulesDir of nodeModulesDirs) {
    repairWinBindingLinks(nodeModulesDir, initial.targetArch)
  }

  return resolveWinBindingStatus(nodeModulesDirs, arch)
}

const warnMissingBindings = (status: WinBindingStatus | null) => {
  if (
    !status ||
    (!status.missingRolldown &&
      !status.missingOxide &&
      !status.missingRollup &&
      !status.missingLightningcss &&
      !status.missingTailwindLightningcss &&
      !status.missingEsbuild &&
      !status.missingSharp)
  ) {
    return
  }

  const hintCpu = status.targetArch === 'x64' ? 'x64' : 'arm64'
  const parts = []
  if (status.missingRolldown) parts.push('rolldown')
  if (status.missingOxide) parts.push('tailwind oxide')
  if (status.missingRollup) parts.push('rollup')
  if (status.missingLightningcss) parts.push('lightningcss')
  if (status.missingTailwindLightningcss) parts.push('tailwind lightningcss')
  if (status.missingEsbuild) parts.push('esbuild')
  if (status.missingSharp) parts.push('sharp')
  console.warn(
    `[native] Missing ${parts.join(' + ')} binding(s) for ${status.targetArch}. ` +
      `Run: bun install --cpu ${hintCpu} --os win32 --filter site`
  )
}

const patchRolldownIndex = () => {
  for (const rolldownIndex of rolldownIndexCandidates) {
    if (!existsSync(rolldownIndex)) continue
    const source = readFileSync(rolldownIndex, 'utf8')
    if (!source.includes('initTraceSubscriber')) continue
    if (source.includes('typeof initTraceSubscriber') || source.includes('typeof import_binding.initTraceSubscriber')) {
      continue
    }
    const marker = 'const subscriberGuard = (0, import_binding.initTraceSubscriber)();'
    if (!source.includes(marker)) continue
    const patched = source.replace(
      marker,
      'const initTraceSubscriber = import_binding.initTraceSubscriber;\n\tconst subscriberGuard = typeof initTraceSubscriber === "function" ? initTraceSubscriber() : null;'
    )
    writeFileSync(rolldownIndex, patched, 'utf8')
  }
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
const bindingNodeModulesCandidates = [
  viteNodeModulesDir,
  path.resolve(siteRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
]
const bindingNodeModulesDirs = Array.from(
  new Set([resolveStoreBackedNodeModulesDir(bindingNodeModulesCandidates), ...bindingNodeModulesCandidates])
)
const bindingStatus = ensureWinBindings(bindingNodeModulesDirs, runtime.arch)
warnMissingBindings(bindingStatus)

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
