const parsePort = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const run = (cmd: string, args: string[]) => {
  try {
    return Bun.spawnSync({ cmd: [cmd, ...args], stdout: 'pipe', stderr: 'pipe' })
  } catch {
    return null
  }
}

const decode = (buffer: Uint8Array | undefined) => (buffer ? new TextDecoder().decode(buffer) : '')

const listPids = (port: number) => {
  const pids = new Set<number>()

  const lsof = run('lsof', ['-ti', `tcp:${port}`])
  if (lsof && lsof.exitCode === 0) {
    decode(lsof.stdout)
      .split('\n')
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0)
      .forEach((pid) => pids.add(pid))
  }

  if (pids.size === 0) {
    const fuser = run('fuser', ['-n', 'tcp', String(port)])
    if (fuser && (fuser.exitCode === 0 || fuser.exitCode === 1)) {
      const combined = `${decode(fuser.stdout)}\n${decode(fuser.stderr)}`
      Array.from(combined.matchAll(/\b\d+\b/g))
        .map(([value]) => Number.parseInt(value, 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== port)
        .forEach((pid) => pids.add(pid))
    }
  }

  if (pids.size === 0) {
    const ss = run('ss', ['-ltnp'])
    if (ss && ss.exitCode === 0) {
      const lines = `${decode(ss.stdout)}\n${decode(ss.stderr)}`.split('\n')
      for (const line of lines) {
        if (!line.includes(`:${port}`)) continue
        for (const match of line.matchAll(/pid=(\d+)/g)) {
          const pid = Number.parseInt(match[1] ?? '', 10)
          if (Number.isFinite(pid) && pid > 0) pids.add(pid)
        }
      }
    }
  }

  return Array.from(pids)
}

const isPortBusy = (port: number) => listPids(port).length > 0

const killPids = async (pids: number[], signal: 'SIGTERM' | 'SIGKILL') => {
  for (const pid of pids) {
    try {
      process.kill(pid, signal)
    } catch {}
  }

  await new Promise((resolve) => setTimeout(resolve, 300))
}

const port = parsePort(Bun.argv[2], 4173)

if (!isPortBusy(port)) {
  process.exit(0)
}

const initial = listPids(port)
if (initial.length === 0) {
  process.exit(0)
}

console.log(`Freeing port ${port} (pids: ${initial.join(', ')})`)

await killPids(initial, 'SIGTERM')

if (isPortBusy(port)) {
  const remaining = listPids(port)
  if (remaining.length > 0) {
    console.log(`Port ${port} still busy, forcing kill (pids: ${remaining.join(', ')})`)
    await killPids(remaining, 'SIGKILL')
  }
}

if (isPortBusy(port)) {
  console.error(`Failed to free port ${port}`)
  process.exit(1)
}
