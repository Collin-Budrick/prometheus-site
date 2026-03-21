import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { templateBuildOutputs, templateGeneratedArtifacts } from '../packages/template-config/src/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const documentationPath = path.join(root, 'docs', 'template-reference.md')
const documentation = readFileSync(documentationPath, 'utf8')

const GENERATED_MARKERS = ['auto-generated', 'generated artifact', 'generated file'] as const

const getTrackedEntries = (relativePath: string) => {
  const result = spawnSync('git', ['ls-files', '--', relativePath], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) {
    throw new Error(`Failed to inspect git tracking state for ${relativePath}`)
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const getTrackedEntriesStillPresent = (relativePath: string) =>
  getTrackedEntries(relativePath).filter((entry) => existsSync(path.join(root, entry)))

const hasGeneratedMarker = (relativePath: string) => {
  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) return true
  const content = readFileSync(absolutePath, 'utf8').toLowerCase()
  return GENERATED_MARKERS.some((marker) => content.includes(marker))
}

for (const relativePath of templateGeneratedArtifacts) {
  const trackedEntriesStillPresent = getTrackedEntriesStillPresent(relativePath)
  if (trackedEntriesStillPresent.length > 0 && !hasGeneratedMarker(relativePath)) {
    throw new Error(`Tracked generated source is missing a generated marker: ${relativePath}`)
  }
  if (!documentation.includes(relativePath)) {
    throw new Error(`Generated artifact is not documented in docs/template-reference.md: ${relativePath}`)
  }
}

for (const relativePath of templateBuildOutputs) {
  const trackedEntriesStillPresent = getTrackedEntriesStillPresent(relativePath)
  if (trackedEntriesStillPresent.length > 0) {
    throw new Error(`Build output is tracked in git: ${relativePath}`)
  }
  if (!documentation.includes(relativePath)) {
    throw new Error(`Generated artifact is not documented in docs/template-reference.md: ${relativePath}`)
  }
}
