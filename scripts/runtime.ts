import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { getTemplatePresetDescriptor, templateBranding } from '../packages/template-config/src/index.ts'
import { getRunningServices, resolveComposeCommand, root, runSync } from './compose-utils'
import { getRuntimeConfig } from './runtime-config'
import { assertHostedAuthConfigForNonDevelopmentHosts } from './spacetime-auth-config'

const bunGlobal = globalThis as typeof globalThis & { Bun?: { execPath?: string } }
const bunBin =
  (bunGlobal.Bun?.execPath && typeof bunGlobal.Bun.execPath === 'string' && bunGlobal.Bun.execPath) ||
  (typeof process.execPath === 'string' && process.execPath) ||
  'bun'

const command = process.argv[2]?.trim() || 'dev'

const loadEnvFile = (relativePath: string) => {
  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) return
  const content = readFileSync(absolutePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) return
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1)
    if (!key || process.env[key]?.trim()) return
    process.env[key] = value
  })
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const importLocalScript = async (scriptPath: string) => {
  await import(new URL(scriptPath, import.meta.url).href)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const requestStatus = (url: string) =>
  new Promise<number>((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    request.on('error', reject)
  })

const waitForUrl = async (url: string, timeoutMs: number) => {
  const startedAt = Date.now()
  let lastError = 'unavailable'
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const status = await requestStatus(url)
      if (status === 200) return
      lastError = `status ${status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await wait(1000)
  }

  throw new Error(`[runtime] Timed out waiting for ${url} (${lastError}).`)
}

const waitForExit = (child: ReturnType<typeof spawn>, timeoutMs: number) =>
  new Promise<boolean>((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(false)
    }, timeoutMs)

    child.once('exit', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(true)
    })
  })

const previewWarningPatterns = [
  /didn't resolve at build time, it will remain unchanged to be resolved at runtime/i
]

const assertNoPreviewWarnings = (output: string, outputPath: string) => {
  const warnings = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && previewWarningPatterns.some((pattern) => pattern.test(line)))

  if (!warnings.length) return

  throw new Error(
    `[runtime] Preview emitted unresolved build warnings:\n${warnings.map((warning) => `- ${warning}`).join('\n')}\nlog: ${outputPath}`
  )
}

const readPositiveIntEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const killChildTree = (pid: number | undefined) => {
  if (!pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', `${pid}`, '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // ignore cleanup failures
  }
}

const waitForPreviewProject = async ({
  composeCommand,
  prefix,
  env,
  requiredServices,
  preview,
  previewExitState,
  previewStdoutPath,
  previewStderrPath,
  url,
  timeoutMs
}: {
  composeCommand: string
  prefix: string[]
  env: NodeJS.ProcessEnv
  requiredServices: string[]
  preview: ReturnType<typeof spawn>
  previewExitState: { code: number | null; signal: NodeJS.Signals | null } | null
  previewStdoutPath: string
  previewStderrPath: string
  url: string
  timeoutMs: number
}) => {
  const startedAt = Date.now()
  let lastState = 'preview project not ready'

  while (Date.now() - startedAt < timeoutMs) {
    const runningServices = getRunningServices(composeCommand, prefix, env)
    const missingServices = requiredServices.filter((service) => !runningServices.has(service))

    if (!missingServices.length) {
      try {
        const status = await requestStatus(url)
        if (status === 200) return
        lastState = `status ${status}`
      } catch (error) {
        lastState = error instanceof Error ? error.message : String(error)
      }
    } else {
      lastState = `waiting for services: ${missingServices.join(', ')}`
    }

    if (preview.exitCode !== null || preview.signalCode !== null || previewExitState) {
      const exitSummary = previewExitState
        ? `code=${previewExitState.code ?? 'null'} signal=${previewExitState.signal ?? 'null'}`
        : `code=${preview.exitCode ?? 'null'} signal=${preview.signalCode ?? 'null'}`
      throw new Error(
        `[runtime] Preview exited before its Compose services were ready (${exitSummary}). ` +
          `stdout: ${previewStdoutPath} stderr: ${previewStderrPath}`
      )
    }

    await wait(1000)
  }

  throw new Error(`[runtime] Timed out waiting for preview project readiness (${lastState}).`)
}

const runBrowserSmoke = async () => {
  const allowedPresets = new Set(['full', 'core'])
  const requestedPreset = process.argv[3]?.trim() || process.env.PROMETHEUS_TEMPLATE_PRESET?.trim() || 'full'

  if (!allowedPresets.has(requestedPreset)) {
    throw new Error(`[runtime] Unsupported preset '${requestedPreset}'. Expected one of: full, core.`)
  }

  const preset = requestedPreset as 'full' | 'core'
  const presetDescriptor = getTemplatePresetDescriptor(preset)
  const specPath = `tests/browser/${preset}.spec.ts`
  const env = {
    ...process.env,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET?.trim() || 'dev-better-auth-secret-please-change-32',
    COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME?.trim() || templateBranding.composeProjectName,
    PROMETHEUS_TEMPLATE_PRESET: preset,
    PROMETHEUS_TEMPLATE_HOME_MODE: process.env.PROMETHEUS_TEMPLATE_HOME_MODE?.trim() || presetDescriptor.homeMode,
    VITE_TEMPLATE_PRESET: preset,
    VITE_TEMPLATE_HOME_MODE: process.env.VITE_TEMPLATE_HOME_MODE?.trim() || presetDescriptor.homeMode,
    PROMETHEUS_DEVICE_HOST: process.env.PROMETHEUS_DEVICE_HOST?.trim() || '0'
  }
  const runtimeConfig = getRuntimeConfig(env)
  assertHostedAuthConfigForNonDevelopmentHosts({
    context: 'runtime browser smoke',
    env,
    hosts: [runtimeConfig.domains.web, runtimeConfig.domains.webProd]
  })
  const baseURL =
    env.PLAYWRIGHT_BASE_URL?.trim() || env.PW_BASE_URL?.trim() || `https://${runtimeConfig.domains.web}`
  env.PLAYWRIGHT_BASE_URL = baseURL
  const requiredServices = [
    ...runtimeConfig.compose.services.core,
    ...runtimeConfig.compose.services.web,
    ...runtimeConfig.compose.services.proxy,
    ...(runtimeConfig.compose.includeOptionalServices ? runtimeConfig.compose.services.optional : [])
  ]

  const { command: composeCommand, prefix } = resolveComposeCommand()

  const runComposeDown = () => {
    const down = runSync(composeCommand, [...prefix, 'down', '--remove-orphans'], env)
    if (down.status !== 0) {
      throw new Error(`[runtime] Compose down failed with status ${down.status ?? 'unknown'}.`)
    }
  }

  const logDir = path.join(root, 'tmp')
  mkdirSync(logDir, { recursive: true })
  const previewStdoutPath = path.join(logDir, `browser-preview-${preset}.out.log`)
  const previewStderrPath = path.join(logDir, `browser-preview-${preset}.err.log`)
  const outLog = createWriteStream(previewStdoutPath, { flags: 'w' })
  const errLog = createWriteStream(previewStderrPath, { flags: 'w' })
  let previewStderr = ''

  runComposeDown()

  const preview = spawn(bunBin, ['run', 'scripts/runtime.ts', 'preview'], {
    cwd: root,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  let previewExitState: { code: number | null; signal: NodeJS.Signals | null } | null = null
  preview.once('exit', (code, signal) => {
    previewExitState = {
      code,
      signal: signal ?? null
    }
  })

  preview.stdout?.pipe(outLog)
  preview.stderr?.pipe(errLog)
  preview.stderr?.on('data', (chunk: string | Buffer) => {
    previewStderr += chunk.toString()
  })

  try {
    await waitForPreviewProject({
      composeCommand,
      prefix,
      env,
      requiredServices,
      preview,
      previewExitState,
      previewStdoutPath,
      previewStderrPath,
      url: baseURL,
      timeoutMs: readPositiveIntEnv(process.env.PROMETHEUS_BROWSER_PREVIEW_TIMEOUT_MS, 1200000)
    })
    assertNoPreviewWarnings(previewStderr, previewStderrPath)

    const test = spawnSync(bunBin, ['x', 'playwright', 'test', specPath], {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: false
    })

    if (test.status !== 0) {
      process.exit(test.status ?? 1)
    }
  } finally {
    try {
      runComposeDown()
    } finally {
      const exited = await waitForExit(preview, 5000)
      if (!exited) {
        killChildTree(preview.pid)
      }
      outLog.end()
      errLog.end()
    }
  }
}

switch (command) {
  case 'dev':
    await importLocalScript('./dev.ts')
    break
  case 'preview':
    await importLocalScript('./preview.ts')
    break
  case 'browser':
    await runBrowserSmoke()
    break
  default:
    throw new Error(`[runtime] Unknown command '${command}'. Expected dev, preview, or browser.`)
}
