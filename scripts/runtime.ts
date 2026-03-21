import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, createWriteStream } from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { getTemplatePresetDescriptor, templateBranding } from '../packages/template-config/src/index.ts'
import { resolveComposeCommand, root, runSync } from './compose-utils'

const bunGlobal = globalThis as typeof globalThis & { Bun?: { execPath?: string } }
const bunBin =
  (bunGlobal.Bun?.execPath && typeof bunGlobal.Bun.execPath === 'string' && bunGlobal.Bun.execPath) ||
  (typeof process.execPath === 'string' && process.execPath) ||
  'bun'

const command = process.argv[2]?.trim() || 'dev'

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

const runBrowserSmoke = async () => {
  const allowedPresets = new Set(['full', 'core'])
  const requestedPreset = process.argv[3]?.trim() || process.env.PROMETHEUS_TEMPLATE_PRESET?.trim() || 'full'

  if (!allowedPresets.has(requestedPreset)) {
    throw new Error(`[runtime] Unsupported preset '${requestedPreset}'. Expected one of: full, core.`)
  }

  const preset = requestedPreset as 'full' | 'core'
  const presetDescriptor = getTemplatePresetDescriptor(preset)
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || `https://${templateBranding.domains.webProd}`
  const specPath = `tests/browser/${preset}.spec.ts`
  const env = {
    ...process.env,
    COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME?.trim() || templateBranding.composeProjectName,
    PROMETHEUS_TEMPLATE_PRESET: preset,
    PROMETHEUS_TEMPLATE_HOME_MODE: process.env.PROMETHEUS_TEMPLATE_HOME_MODE?.trim() || presetDescriptor.homeMode,
    VITE_TEMPLATE_PRESET: preset,
    VITE_TEMPLATE_HOME_MODE: process.env.VITE_TEMPLATE_HOME_MODE?.trim() || presetDescriptor.homeMode,
    PROMETHEUS_DEVICE_HOST: process.env.PROMETHEUS_DEVICE_HOST?.trim() || '0',
    PLAYWRIGHT_BASE_URL: baseURL
  }

  const { command: composeCommand, prefix } = resolveComposeCommand()

  const runComposeDown = () => {
    const down = runSync(composeCommand, [...prefix, 'down', '--remove-orphans'], env)
    if (down.status !== 0) {
      throw new Error(`[runtime] Compose down failed with status ${down.status ?? 'unknown'}.`)
    }
  }

  const logDir = path.join(root, 'tmp')
  mkdirSync(logDir, { recursive: true })
  const outLog = createWriteStream(path.join(logDir, `browser-preview-${preset}.out.log`), { flags: 'w' })
  const errLog = createWriteStream(path.join(logDir, `browser-preview-${preset}.err.log`), { flags: 'w' })

  runComposeDown()

  const preview = spawn(bunBin, ['run', 'scripts/runtime.ts', 'preview'], {
    cwd: root,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  preview.stdout?.pipe(outLog)
  preview.stderr?.pipe(errLog)

  try {
    await waitForUrl(baseURL, 240000)

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
