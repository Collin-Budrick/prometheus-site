import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getSiteEnvFilePaths, loadSiteEnvFiles } from './load-site-env'

describe('loadSiteEnvFiles', () => {
  let tempRoot: string | null = null

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('loads cached convex auth env values into empty keys', () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'prom-site-env-'))
    const siteRoot = path.join(tempRoot, 'apps', 'site')
    const cacheRoot = path.join(tempRoot, '.cache')
    mkdirSync(siteRoot, { recursive: true })
    mkdirSync(cacheRoot, { recursive: true })
    writeFileSync(
      path.join(cacheRoot, 'convex-self-hosted.env'),
      ['AUTH_SOCIAL_PROVIDERS=google, facebook, twitter, github', 'AUTH_GOOGLE_CLIENT_ID=test-google-id'].join('\n'),
      'utf8'
    )
    const env: NodeJS.ProcessEnv = {}

    loadSiteEnvFiles({
      siteRoot,
      workspaceRoot: tempRoot,
      targetEnv: env
    })

    expect(env.AUTH_SOCIAL_PROVIDERS).toBe('google, facebook, twitter, github')
    expect(env.AUTH_GOOGLE_CLIENT_ID).toBe('test-google-id')
  })

  it('does not override an explicit environment value', () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'prom-site-env-'))
    const siteRoot = path.join(tempRoot, 'apps', 'site')
    const cacheRoot = path.join(tempRoot, '.cache')
    mkdirSync(siteRoot, { recursive: true })
    mkdirSync(cacheRoot, { recursive: true })
    writeFileSync(path.join(cacheRoot, 'convex-self-hosted.env'), 'AUTH_SOCIAL_PROVIDERS=google, github\n', 'utf8')
    const env: NodeJS.ProcessEnv = {
      AUTH_SOCIAL_PROVIDERS: 'facebook'
    }

    loadSiteEnvFiles({
      siteRoot,
      workspaceRoot: tempRoot,
      targetEnv: env
    })

    expect(env.AUTH_SOCIAL_PROVIDERS).toBe('facebook')
  })

  it('includes the cached convex env file in the site load order', () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'prom-site-env-'))
    const siteRoot = path.join(tempRoot, 'apps', 'site')
    mkdirSync(siteRoot, { recursive: true })

    const filePaths = getSiteEnvFilePaths({
      siteRoot,
      workspaceRoot: tempRoot
    })

    expect(filePaths).toContain(path.join(tempRoot, '.cache', 'convex-self-hosted.env'))
  })
})
