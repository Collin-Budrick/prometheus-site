import { delimiter, dirname } from 'node:path'

const bunBin = process.execPath
const bunDir = dirname(bunBin)
const env = { ...process.env, PATH: `${bunDir}${delimiter}${process.env.PATH ?? ''}` }

const commands = [
  { name: 'web', cwd: 'apps/web', args: ['scripts/dev.ts'] },
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
