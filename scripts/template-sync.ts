import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  collectGeneratedTemplateFileDiffs,
  normalizeTemplateFileContent,
  relativeTemplatePath
} from './template-lib.ts'

const checkMode = process.argv.includes('--check')
const changedPaths: string[] = []

for (const diff of collectGeneratedTemplateFileDiffs()) {
  if (diff.status === 'unchanged') continue
  changedPaths.push(diff.relativePath)
  if (checkMode) continue

  mkdirSync(path.dirname(diff.absolutePath), { recursive: true })
  writeFileSync(diff.absolutePath, normalizeTemplateFileContent(diff.nextContent), 'utf8')
}

if (checkMode && changedPaths.length > 0) {
  throw new Error(
    `Template-managed files are out of date:\n${changedPaths.map((entry) => `- ${entry}`).join('\n')}\nRun \`bun run template:sync\`.`
  )
}

if (!checkMode && changedPaths.length > 0) {
  process.stdout.write(`Synced template-managed files:\n${changedPaths.map((entry) => `- ${entry}`).join('\n')}\n`)
}
