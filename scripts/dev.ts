import { delimiter, dirname } from 'node:path'
import net from 'node:net'

const bunBin = process.execPath
const bunDir = dirname(bunBin)
const env = { ...process.env, PATH: `${bunDir}${delimiter}${process.env.PATH ?? ''}` }

const parsePort = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const isPortAvailable = async (port: number) =>
  await new Promise<boolean>((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', (err) => {
      const code = (err as NodeJS.ErrnoException)?.code
      resolve(code !== 'EADDRINUSE')
    })
    server.listen(port, '0.0.0.0', () => {
      server.close(() => resolve(true))
    })
  })

const isLikelyViteDevServer = async (port: number) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 750)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal })
    const html = await response.text()
    return html.includes('/@vite/client')
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

const webPort = parsePort(process.env.WEB_PORT, 4173)
const shouldStartWeb = await (async () => {
  const available = await isPortAvailable(webPort)
  if (available) return true
  const isVite = await isLikelyViteDevServer(webPort)
  if (isVite) {
    console.log(`Web dev server already running on port ${webPort}; skipping spawn.`)
    return false
  }
  console.warn(`WEB_PORT ${webPort} is already in use; skipping web dev. Stop the process or set WEB_PORT.`)
  return false
})()

const commands = [
  ...(shouldStartWeb ? [{ name: 'web', cwd: 'apps/web', args: ['scripts/dev.ts'] }] : []),
  { name: 'api', cwd: 'apps/api', args: ['run', 'dev'] }
]

const processes = commands.map(({ name, cwd, args }) => ({
  name,
  proc: Bun.spawn([bunBin, ...args], { cwd, stdout: 'inherit', stderr: 'inherit', stdin: 'inherit', env })
}))

const stopAll = (signal: 'SIGINT' | 'SIGTERM') => {
  for (const { proc } of processes) {
    try {
      proc.kill(signal)
    } catch (error) {
      console.error('Failed to stop process', proc.pid, error)
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => stopAll(signal))
}

const codes = await Promise.all(
  processes.map(async ({ name, proc }) => {
    const code = await proc.exited
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`)
    }
    return code
  })
)

process.exit(codes.find((code) => code !== 0) ?? 0)
