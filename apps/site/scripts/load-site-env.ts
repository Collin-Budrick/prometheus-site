import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

type LoadSiteEnvOptions = {
  siteRoot: string
  workspaceRoot: string
  targetEnv?: NodeJS.ProcessEnv
}

const readEnvFile = (filePath: string, targetEnv: NodeJS.ProcessEnv) => {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) return
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1)
    if (!key || targetEnv[key]?.trim()) return
    targetEnv[key] = value
  })
}

export const getSiteEnvFilePaths = ({ siteRoot, workspaceRoot }: Pick<LoadSiteEnvOptions, 'siteRoot' | 'workspaceRoot'>) => [
  path.resolve(workspaceRoot, '.env'),
  path.resolve(workspaceRoot, '.env.local'),
  path.resolve(workspaceRoot, '.cache', 'convex-self-hosted.env'),
  path.resolve(siteRoot, '.env'),
  path.resolve(siteRoot, '.env.local')
]

export const loadSiteEnvFiles = ({
  siteRoot,
  workspaceRoot,
  targetEnv = process.env
}: LoadSiteEnvOptions) => {
  for (const filePath of getSiteEnvFilePaths({ siteRoot, workspaceRoot })) {
    readEnvFile(filePath, targetEnv)
  }
}
