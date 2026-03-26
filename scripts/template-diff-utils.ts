import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const renderUnifiedDiff = (relativePath: string, currentContent: string, nextContent: string) => {
  const tempDirectory = mkdtempSync(path.join(tmpdir(), 'template-diff-'))
  const beforePath = path.join(tempDirectory, 'before')
  const afterPath = path.join(tempDirectory, 'after')

  try {
    writeFileSync(beforePath, currentContent, 'utf8')
    writeFileSync(afterPath, nextContent, 'utf8')
    const result = spawnSync('git', ['diff', '--no-index', '--no-color', '--', beforePath, afterPath], {
      encoding: 'utf8',
      shell: false
    })

    if (result.status !== 0 && result.status !== 1) {
      throw new Error(result.stderr?.trim() || `Failed to diff ${relativePath}`)
    }

    const diff = (result.stdout || '')
      .replaceAll(`a/${beforePath}`, `a/${relativePath}`)
      .replaceAll(`b/${afterPath}`, `b/${relativePath}`)
      .replaceAll(beforePath, relativePath)
      .replaceAll(afterPath, relativePath)
    return diff.trim()
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true })
  }
}
