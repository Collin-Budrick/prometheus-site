import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { templateBranding } from '../packages/template-config/src/index.ts'
import { resolveComposeCommand } from './compose-utils'

const root = fileURLToPath(new URL('..', import.meta.url))
const defaultCliImage = 'clockworklabs/spacetime:v2.0.4'
const defaultRustImage = 'rust:1.93-bookworm'
const defaultModuleName = process.env.SPACETIMEDB_MODULE?.trim() || templateBranding.ids.spacetimeModule
const defaultServerUri = process.env.SPACETIMEDB_URI?.trim() || 'http://127.0.0.1:3000'
const keysDir = path.join(root, 'infra', 'spacetimedb', 'keys')
const cliConfigDir = path.join(root, 'infra', 'spacetimedb', 'config')
const rustCacheDir = path.join(root, '.cache', 'spacetimedb-rust')
const rustCargoRegistryDir = path.join(rustCacheDir, 'cargo-registry')
const rustCargoGitDir = path.join(rustCacheDir, 'cargo-git')
const rustRustupDir = path.join(rustCacheDir, 'rustup')
const rustupCacheHome = '/var/cache/rustup'
const publicKeyPath = path.join(keysDir, 'jwt.pub')
const privateKeyPath = path.join(keysDir, 'jwt.key')
const modulePath = 'extras/spacetimedb-module'
const moduleManifestPath = `${modulePath}/Cargo.toml`
const moduleWasmPath = `${modulePath}/target/wasm32-unknown-unknown/release/prometheus_spacetimedb_module.wasm`
const generatedBindingsPath = 'packages/spacetimedb-client/src/generated'
const localDockerHosts = new Set(['127.0.0.1', 'localhost', '::1'])

const toDockerMountPath = (value: string) => value.replace(/\\/g, '/')
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const defaultComposeProjectName = templateBranding.composeProjectName
const resolveComposeProjectName = () =>
  process.env.COMPOSE_PROJECT_NAME?.trim() || defaultComposeProjectName || templateBranding.composeProjectName
const isLocalComposeServer = (serverUri: string) => {
  try {
    const parsed = new URL(serverUri)
    return localDockerHosts.has(parsed.hostname)
  } catch {
    return false
  }
}

const resolveDockerServerUri = (serverUri: string) => {
  try {
    const parsed = new URL(serverUri)
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1') {
      parsed.hostname = 'host.docker.internal'
    }
    return parsed.toString()
  } catch {
    return serverUri
  }
}

const runDocker = (
  image: string,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
  extraMounts: Array<[string, string]> = [],
  extraDockerArgs: string[] = []
) => {
  const envArgs = Object.entries(extraEnv).flatMap(([key, value]) => (value ? ['-e', `${key}=${value}`] : []))
  const mountArgs = [
    ['-v', `${toDockerMountPath(root)}:/workspace`],
    ...extraMounts.map(([hostPath, containerPath]) => ['-v', `${toDockerMountPath(hostPath)}:${containerPath}`])
  ].flat()
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--add-host',
      'host.docker.internal:host-gateway',
      ...extraDockerArgs,
      ...mountArgs,
      '-w',
      '/workspace',
      ...envArgs,
      image,
      ...args
    ],
    {
      cwd: root,
      stdio: 'inherit',
      shell: false
    }
  )

  if (result.status !== 0) {
    throw new Error(`[spacetimedb] Docker command failed with status ${result.status ?? 'unknown'}.`)
  }
}

const resolveDockerServerTarget = (serverUri: string) => {
  try {
    const parsed = new URL(serverUri)
    if (localDockerHosts.has(parsed.hostname)) {
      const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
      parsed.hostname = 'spacetimedb'
      parsed.port = port
      return {
        dockerArgs: ['--network', `${resolveComposeProjectName()}_prometheus_net`],
        serverUri: parsed.toString()
      }
    }
  } catch {
    // fall back to the original URI handling below
  }

  return {
    dockerArgs: [] as string[],
    serverUri: resolveDockerServerUri(serverUri)
  }
}

export const ensureSpacetimeJwtKeys = () => {
  mkdirSync(cliConfigDir, { recursive: true })
  if (existsSync(publicKeyPath) && existsSync(privateKeyPath)) {
    return { publicKeyPath, privateKeyPath }
  }

  mkdirSync(keysDir, { recursive: true })
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  })

  writeFileSync(privateKeyPath, privateKey, { encoding: 'ascii' })
  writeFileSync(publicKeyPath, publicKey, { encoding: 'ascii' })
  return { publicKeyPath, privateKeyPath }
}

const runDockerSpacetime = (
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
  extraDockerArgs: string[] = []
) =>
  runDocker(defaultCliImage, args, {
    HOME: '/tmp',
    XDG_CONFIG_HOME: '/tmp/.config',
    ...extraEnv
  }, [[cliConfigDir, '/tmp/.config']], extraDockerArgs)

const runDockerRust = (args: string[]) => {
  mkdirSync(rustCargoRegistryDir, { recursive: true })
  mkdirSync(rustCargoGitDir, { recursive: true })
  mkdirSync(rustRustupDir, { recursive: true })
  runDocker(
    defaultRustImage,
    args,
    {
      CARGO_HOME: '/usr/local/cargo',
      CARGO_BUILD_JOBS: process.env.SPACETIMEDB_CARGO_BUILD_JOBS?.trim() || '1',
      RUSTUP_HOME: rustupCacheHome
    },
    [
      [rustCargoRegistryDir, '/usr/local/cargo/registry'],
      [rustCargoGitDir, '/usr/local/cargo/git'],
      [rustRustupDir, rustupCacheHome]
    ]
  )
}
const runComposeSpacetimePublish = (moduleName: string) => {
  const { command, prefix } = resolveComposeCommand()
  const result = spawnSync(command, [...prefix, 'run', '--rm', 'spacetimedb-publish'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      COMPOSE_PROJECT_NAME: resolveComposeProjectName(),
      SPACETIMEDB_MODULE: moduleName
    }
  })

  if (result.status !== 0) {
    throw new Error(`[spacetimedb] Compose publish failed with status ${result.status ?? 'unknown'}.`)
  }
}

export const waitForSpacetimeServer = (serverUri = defaultServerUri, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs
  const target = resolveDockerServerTarget(serverUri)

  while (Date.now() < deadline) {
    const result = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--add-host',
        'host.docker.internal:host-gateway',
        ...target.dockerArgs,
        '-v',
        `${toDockerMountPath(root)}:/workspace`,
        '-v',
        `${toDockerMountPath(cliConfigDir)}:/tmp/.config`,
        '-w',
        '/workspace',
        '-e',
        'HOME=/tmp',
        '-e',
        'XDG_CONFIG_HOME=/tmp/.config',
        defaultCliImage,
        'server',
        'ping',
        target.serverUri
      ],
      {
        cwd: root,
        stdio: 'ignore',
        shell: false
      }
    )

    if (result.status === 0) {
      return
    }

    sleep(1000)
  }

  throw new Error(`[spacetimedb] Timed out waiting for ${serverUri}.`)
}

export const hasPublishedSpacetimeModule = (
  moduleName = defaultModuleName,
  serverUri = defaultServerUri
) => {
  const target = resolveDockerServerTarget(serverUri)
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--add-host',
      'host.docker.internal:host-gateway',
      ...target.dockerArgs,
      '-v',
      `${toDockerMountPath(root)}:/workspace`,
      '-v',
      `${toDockerMountPath(cliConfigDir)}:/tmp/.config`,
      '-w',
      '/workspace',
      '-e',
      'HOME=/tmp',
      '-e',
      'XDG_CONFIG_HOME=/tmp/.config',
      defaultCliImage,
      'describe',
      moduleName,
      '--json',
      '--server',
      target.serverUri,
      '--yes'
    ],
    {
      cwd: root,
      stdio: 'ignore',
      shell: false
    }
  )

  return result.status === 0
}

export const buildSpacetimeModule = () =>
  runDockerRust([
    'sh',
    '-lc',
    [
      'export PATH=/usr/local/cargo/bin:$PATH',
      `mkdir -p "${rustupCacheHome}"`,
      [
        `if [ ! -d "${rustupCacheHome}/toolchains" ]`,
        `|| ! find "${rustupCacheHome}/toolchains" -mindepth 1 -maxdepth 1 -type d | grep -q .`,
        `|| ! grep -q '^default_toolchain = ' "${rustupCacheHome}/settings.toml" 2>/dev/null;`,
        `then cp -a /usr/local/rustup/. "${rustupCacheHome}/"; fi`
      ].join(' '),
      "if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then rustup target add wasm32-unknown-unknown; fi",
      `cargo build --manifest-path ${moduleManifestPath} --locked --target wasm32-unknown-unknown --release`
    ].join(' && ')
  ])

export const generateSpacetimeBindings = () => {
  buildSpacetimeModule()
  runDockerSpacetime(
    [
      'generate',
      '--bin-path',
      moduleWasmPath,
      '--lang',
      'typescript',
      '--out-dir',
      generatedBindingsPath,
      '--yes'
    ],
    {
      SPACETIMEAUTH_AUTHORITY: process.env.SPACETIMEAUTH_AUTHORITY,
      SPACETIMEAUTH_CLIENT_ID: process.env.SPACETIMEAUTH_CLIENT_ID
    }
  )
}

export const publishSpacetimeModule = (
  moduleName = defaultModuleName,
  serverUri = defaultServerUri
) => {
  waitForSpacetimeServer(serverUri)
  buildSpacetimeModule()
  if (isLocalComposeServer(serverUri)) {
    runComposeSpacetimePublish(moduleName)
    return
  }

  const target = resolveDockerServerTarget(serverUri)
  runDockerSpacetime(
    [
      'publish',
      moduleName,
      '--server',
      target.serverUri,
      '--bin-path',
      moduleWasmPath,
      '--yes',
      '--delete-data=on-conflict'
    ],
    {
      SPACETIMEAUTH_AUTHORITY: process.env.SPACETIMEAUTH_AUTHORITY,
      SPACETIMEAUTH_CLIENT_ID: process.env.SPACETIMEAUTH_CLIENT_ID
    },
    target.dockerArgs
  )
}

if (import.meta.main) {
  const command = process.argv[2]?.trim().toLowerCase() || 'help'

  if (command === 'ensure-keys') {
    ensureSpacetimeJwtKeys()
  } else if (command === 'build') {
    buildSpacetimeModule()
  } else if (command === 'generate') {
    generateSpacetimeBindings()
  } else if (command === 'publish') {
    publishSpacetimeModule()
  } else {
    process.stdout.write(
      [
        'Usage:',
        'bun run scripts/spacetimedb.ts ensure-keys',
        'bun run scripts/spacetimedb.ts build',
        'bun run scripts/spacetimedb.ts generate',
        'bun run scripts/spacetimedb.ts publish'
      ].join('\n')
    )
  }
}
