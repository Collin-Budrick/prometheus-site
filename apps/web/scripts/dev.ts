import os from 'node:os'
import { execSync, spawn } from 'node:child_process'
import path from 'node:path'

const port = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)
const auditMode = process.env.VITE_DEV_AUDIT === '1' || process.env.DEV_AUDIT === '1'
const bunBin = process.execPath
const bunEnv = { ...process.env, PATH: `${path.dirname(bunBin)}${path.delimiter}${process.env.PATH ?? ''}` }
const devEnv = {
  ...bunEnv,
  VITE_QWIK_HMR: bunEnv.VITE_QWIK_HMR ?? '1'
}
const viteBin = path.resolve(process.cwd(), '..', '..', 'node_modules', 'vite', 'bin', 'vite.js')

const tryExec = (command: string) => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
  } catch {
    return ''
  }
}

const killWindowsPort = (targetPort: number) => {
  const netstat = tryExec(`netstat -ano -p tcp | findstr :${targetPort}`)
  const pids: string[] = []

  for (const line of netstat.split(/\r?\n/)) {
    if (!line) continue
    if (!new RegExp(`:${targetPort}\\b`).test(line)) continue
    const parts = line.trim().split(/\s+/)
    const pid = parts[parts.length - 1]
    if (pid && /^\d+$/.test(pid) && !pids.includes(pid)) {
      pids.push(pid)
    }
  }

  for (let i = 0; i < pids.length; i += 1) {
    const pid = pids[i]
    tryExec(`taskkill /PID ${pid} /T /F`)
    console.log(`Killed process ${pid} holding port ${targetPort}`)
  }

  // If the listener lives inside WSL, clear it there as well.
  tryExec(
    `wsl.exe -e sh -c "command -v fuser >/dev/null 2>&1 && fuser -k ${targetPort}/tcp || command -v lsof >/dev/null 2>&1 && lsof -t -i:${targetPort} -sTCP:LISTEN | xargs -r kill || true"`
  )
}

const killPosixPort = (targetPort: number) => {
  // Prefer fuser; fall back to lsof.
  tryExec(
    `(command -v fuser >/dev/null 2>&1 && fuser -k ${targetPort}/tcp) || (command -v lsof >/dev/null 2>&1 && lsof -t -i:${targetPort} -sTCP:LISTEN | xargs -r kill) || true`
  )
}

const freePort = (targetPort: number) => {
  if (Number.isNaN(targetPort)) {
    console.warn(`Invalid WEB_PORT value: ${process.env.WEB_PORT ?? '(empty)'}`)
    return
  }

  if (os.platform() === 'win32') {
    killWindowsPort(targetPort)
  } else {
    killPosixPort(targetPort)
  }
}

freePort(port)

if (auditMode) {
  console.log('Audit mode enabled: building once and serving preview without HMR or the Vite client.')
  const buildEnv = { ...bunEnv, VITE_DEV_AUDIT: '1' }
  if (!('SKIP_PRERENDER' in buildEnv)) {
    buildEnv.SKIP_PRERENDER = '1'
  }
  try {
    execSync(`${bunBin} run build`, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: buildEnv
    })
  } catch (err) {
    console.error('Failed to build before audit preview.', err)
    process.exit(typeof err === 'object' && err && 'status' in err ? Number(err.status) || 1 : 1)
  }

  const preview = spawn(bunBin, [viteBin, 'preview', '--host', '0.0.0.0', '--port', String(port)], {
    stdio: 'inherit',
    env: { ...bunEnv, VITE_DEV_AUDIT: '1' }
  })

  preview.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
} else {
  const dev = spawn(bunBin, [viteBin, 'dev'], {
    stdio: 'inherit',
    env: devEnv
  })

  dev.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}
