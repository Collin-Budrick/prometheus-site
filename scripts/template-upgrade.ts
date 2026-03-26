import { buildTemplateReport, collectGeneratedTemplateFileDiffs } from './template-lib.ts'
import { readArgMap } from './template-cli-utils.ts'

const argMap = readArgMap(process.argv.slice(2))
const jsonMode = argMap.has('json')
const checkMode = argMap.has('check')
const report = buildTemplateReport()
const changedFiles = collectGeneratedTemplateFileDiffs().filter((diff) => diff.status !== 'unchanged')
const migrationNotes = report.bundles.flatMap((bundle) =>
  bundle.migrations.map((note) => ({
    bundleId: bundle.id,
    title: bundle.title,
    note
  }))
)

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: report.generatedAt,
        changedFiles: changedFiles.map((entry) => ({ relativePath: entry.relativePath, status: entry.status })),
        migrationNotes
      },
      null,
      2
    )}\n`
  )
  process.exit(checkMode && changedFiles.length > 0 ? 1 : 0)
}

const lines = [
  `${report.branding.site.name} template upgrade report`,
  '',
  'Template-managed drift:',
  ...(changedFiles.length > 0
    ? changedFiles.map((entry) => `- ${entry.relativePath} (${entry.status})`)
    : ['- none']),
  '',
  'Bundle migration notes:',
  ...migrationNotes.map((entry) => `- [${entry.bundleId}] ${entry.note}`)
]

process.stdout.write(`${lines.join('\n')}\n`)

if (checkMode && changedFiles.length > 0) {
  process.exit(1)
}
