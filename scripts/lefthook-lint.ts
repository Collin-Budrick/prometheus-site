import path from 'node:path'

const root = process.cwd()
const apiRoot = path.join(root, 'packages', 'platform')

const oxlintProbe = Bun.spawnSync(['bun', 'x', 'oxlint', '--version'], {
  cwd: apiRoot,
  stdio: ['ignore', 'ignore', 'pipe']
})

if ((oxlintProbe.exitCode ?? 1) !== 0) {
  const errorOutput = oxlintProbe.stderr.toString()
  if (errorOutput.includes('Cannot find native binding') || errorOutput.includes('MODULE_NOT_FOUND')) {
    console.warn('[lefthook] oxlint native binding missing; skipping lint for pre-commit.')
    process.exit(0)
  }
}

const result = Bun.spawnSync(['bun', 'x', 'oxlint', '.'], {
  cwd: apiRoot,
  stdio: ['inherit', 'inherit', 'inherit']
})

process.exit(result.exitCode ?? 1)
