import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { withResolvedAuthEnv } from './auth-config'
import { root, runSync, runSyncCapture } from './compose-utils'

const cacheDir = path.join(root, '.cache')
const adminKeyPath = path.join(cacheDir, 'convex-admin-key.txt')
const envFilePath = path.join(cacheDir, 'convex-self-hosted.env')

const normalizeOptionalString = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const readCachedAdminKey = () => {
  if (!existsSync(adminKeyPath)) return undefined
  return normalizeOptionalString(readFileSync(adminKeyPath, 'utf8'))
}

const writeCachedAdminKey = (value: string) => {
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(adminKeyPath, `${value}\n`, 'utf8')
}

const readLastNonEmptyLine = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)

export const ensureConvexAdminKey = ({
  command,
  prefix,
  env,
  service = 'convex-backend'
}: {
  command: string
  prefix: string[]
  env: NodeJS.ProcessEnv
  service?: string
}) => {
  const explicit = normalizeOptionalString(env.CONVEX_SELF_HOSTED_ADMIN_KEY)
  if (explicit) return explicit

  const cached = readCachedAdminKey()
  if (cached) return cached

  const result = runSyncCapture(command, [...prefix, 'exec', '-T', service, './generate_admin_key.sh'], env)
  if (result.status !== 0) {
    const stderr = normalizeOptionalString(result.stderr ?? '') ?? '(no stderr)'
    throw new Error(`[convex] Failed to generate admin key via ${service}: ${stderr}`)
  }

  const generated = readLastNonEmptyLine(result.stdout ?? '')
  if (!generated) {
    throw new Error('[convex] Convex backend did not return an admin key.')
  }

  writeCachedAdminKey(generated)
  return generated
}

export const writeConvexEnvFile = (env: NodeJS.ProcessEnv, adminKey: string) => {
  const resolved = withResolvedAuthEnv({
    ...env,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey
  })
  mkdirSync(cacheDir, { recursive: true })
  const content = [
    `CONVEX_SELF_HOSTED_URL=${resolved.CONVEX_SELF_HOSTED_URL}`,
    `CONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}`
  ].join('\n')
  writeFileSync(envFilePath, `${content}\n`, 'utf8')
  return envFilePath
}

const resolveBunBin = () => {
  const bunGlobal = globalThis as typeof globalThis & { Bun?: { execPath?: string } }
  return (
    (bunGlobal.Bun?.execPath && typeof bunGlobal.Bun.execPath === 'string' && bunGlobal.Bun.execPath) ||
    (typeof process.execPath === 'string' && process.execPath) ||
    'bun'
  )
}

export const deployConvexProject = ({
  command,
  prefix,
  env
}: {
  command: string
  prefix: string[]
  env: NodeJS.ProcessEnv
}) => {
  const adminKey = ensureConvexAdminKey({ command, prefix, env })
  const envFile = writeConvexEnvFile(env, adminKey)
  const convexEnv: NodeJS.ProcessEnv = {
    ...env,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey
  }
  const bunBin = resolveBunBin()
  const result = runSync(
    bunBin,
    ['x', 'convex', 'dev', '--once', '--typecheck', 'disable', '--tail-logs', 'disable', '--env-file', envFile],
    convexEnv
  )
  if (result.status !== 0) {
    throw new Error(`[convex] Failed to deploy the Convex auth project (status ${result.status ?? 1}).`)
  }
  return { adminKey, envFile }
}
