import { collectGeneratedTemplateFileDiffs } from './template-lib.ts'
import { renderUnifiedDiff } from './template-diff-utils.ts'
import { readArgMap } from './template-cli-utils.ts'

const argMap = readArgMap(process.argv.slice(2))
const jsonMode = argMap.has('json')
const nameOnlyMode = argMap.has('name-only')
const changedDiffs = collectGeneratedTemplateFileDiffs().filter((diff) => diff.status !== 'unchanged')

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify(
      changedDiffs.map((diff) => ({ relativePath: diff.relativePath, status: diff.status })),
      null,
      2
    )}\n`
  )
  process.exit(changedDiffs.length > 0 ? 1 : 0)
}

if (changedDiffs.length === 0) {
  process.stdout.write('Template-managed files are up to date.\n')
  process.exit(0)
}

if (nameOnlyMode) {
  process.stdout.write(`${changedDiffs.map((diff) => diff.relativePath).join('\n')}\n`)
  process.exit(1)
}

const output = changedDiffs
  .map((diff) => {
    const header = `# ${diff.relativePath} (${diff.status})`
    const body = renderUnifiedDiff(diff.relativePath, diff.currentContent, diff.nextContent)
    return `${header}\n${body}`
  })
  .join('\n\n')

process.stdout.write(`${output}\n`)
process.exit(1)
