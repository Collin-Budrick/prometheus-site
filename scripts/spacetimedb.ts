import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const defaultImage = 'clockworklabs/spacetime:v2.0.4'
const defaultModuleName = process.env.SPACETIMEDB_MODULE?.trim() || 'prometheus-site-local'
const defaultServerUri = process.env.SPACETIMEDB_URI?.trim() || 'http://127.0.0.1:3000'
const keysDir = path.join(root, 'infra', 'spacetimedb', 'keys')
const cliConfigDir = path.join(root, 'infra', 'spacetimedb', 'config')
const publicKeyPath = path.join(keysDir, 'jwt.pub')
const privateKeyPath = path.join(keysDir, 'jwt.key')

const toDockerMountPath = (value: string) => value.replace(/\\/g, '/')

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

const runDockerSpacetime = (args: string[], extraEnv: Record<string, string | undefined> = {}) => {
  const envArgs = Object.entries({
    HOME: '/tmp',
    XDG_CONFIG_HOME: '/tmp/.config',
    ...extraEnv
  }).flatMap(([key, value]) =>
    value ? ['-e', `${key}=${value}`] : []
  )
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${toDockerMountPath(root)}:/workspace`,
      '-v',
      `${toDockerMountPath(cliConfigDir)}:/tmp/.config`,
      '-w',
      '/workspace',
      ...envArgs,
      defaultImage,
      ...args
    ],
    {
      cwd: root,
      stdio: 'inherit',
      shell: false
    }
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

export const buildSpacetimeModule = () =>
  runDockerSpacetime(
    ['build', '--module-path', 'packages/spacetimedb-module'],
    {
      SPACETIMEAUTH_AUTHORITY: process.env.SPACETIMEAUTH_AUTHORITY,
      SPACETIMEAUTH_CLIENT_ID: process.env.SPACETIMEAUTH_CLIENT_ID
    }
  )

export const generateSpacetimeBindings = () =>
  runDockerSpacetime(
    [
      'generate',
      '--module-path',
      'packages/spacetimedb-module',
      '--lang',
      'typescript',
      '--out-dir',
      'packages/spacetimedb-client/src/generated',
      '--yes'
    ],
    {
      SPACETIMEAUTH_AUTHORITY: process.env.SPACETIMEAUTH_AUTHORITY,
      SPACETIMEAUTH_CLIENT_ID: process.env.SPACETIMEAUTH_CLIENT_ID
    }
  )

export const publishSpacetimeModule = (
  moduleName = defaultModuleName,
  serverUri = defaultServerUri
) =>
  runDockerSpacetime(
    [
      'publish',
      moduleName,
      '--server',
      serverUri,
      '--module-path',
      'packages/spacetimedb-module',
      '--anonymous',
      '--yes',
      '--delete-data=on-conflict'
    ],
    {
      SPACETIMEAUTH_AUTHORITY: process.env.SPACETIMEAUTH_AUTHORITY,
      SPACETIMEAUTH_CLIENT_ID: process.env.SPACETIMEAUTH_CLIENT_ID
    }
  )

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
