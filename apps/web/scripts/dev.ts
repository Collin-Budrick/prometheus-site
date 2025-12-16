import os from 'node:os'
import { execSync, spawn } from 'node:child_process'

const port = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)

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

const dev = spawn('bunx vite dev', {
  shell: true,
  stdio: 'inherit',
  env: process.env
})

dev.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
