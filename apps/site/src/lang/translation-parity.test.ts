import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LanguagePack } from './types'
import {
  allDemoKeys,
  homeUiKeys,
  loginUiKeys,
  offlineUiKeys,
  profileUiKeys,
  protectedUiKeys,
  settingsUiKeys,
  shellUiKeys,
  storeUiKeys
} from './selection'

const readLanguagePack = (lang: string): LanguagePack =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'apps/site/src/lang', `${lang}.json`), 'utf-8')
  ) as LanguagePack

const en = readLanguagePack('en')
const ja = readLanguagePack('ja')
const ko = readLanguagePack('ko')

const flattenKeys = (value: unknown, prefix = ''): string[] => {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return flattenKeys(entry, nextPrefix)
    }
    return [nextPrefix]
  })
}

const requiredUiKeys = Array.from(
  new Set([
    ...shellUiKeys,
    ...homeUiKeys,
    ...storeUiKeys,
    ...loginUiKeys,
    ...protectedUiKeys,
    ...profileUiKeys,
    ...settingsUiKeys,
    ...offlineUiKeys
  ])
)

const expectCoverage = (
  section: string,
  requiredKeys: string[],
  value: Record<string, unknown> | undefined,
  lang: string
) => {
  const available = new Set(flattenKeys(value))
  const missing = requiredKeys.filter((key) => !available.has(key))
  expect(missing, `${lang} is missing ${section} keys`).toEqual([])
}

describe('language pack parity', () => {
  it('covers every live english ui, lab, demo, fragment header, and fragment text key in japanese', () => {
    expectCoverage('ui', requiredUiKeys.map((key) => `${key}`), ja.ui, 'ja')
    expectCoverage('lab', flattenKeys(en.lab), ja.lab, 'ja')
    expectCoverage('demos', allDemoKeys.flatMap((key) => flattenKeys(en.demos[key], key)), ja.demos, 'ja')
    expectCoverage('fragmentHeaders', flattenKeys(en.fragmentHeaders), ja.fragmentHeaders, 'ja')
    expectCoverage('fragments', Object.keys(en.fragments ?? {}), ja.fragments, 'ja')
  })

  it('covers every live english ui, lab, demo, fragment header, and fragment text key in korean', () => {
    expectCoverage('ui', requiredUiKeys.map((key) => `${key}`), ko.ui, 'ko')
    expectCoverage('lab', flattenKeys(en.lab), ko.lab, 'ko')
    expectCoverage('demos', allDemoKeys.flatMap((key) => flattenKeys(en.demos[key], key)), ko.demos, 'ko')
    expectCoverage('fragmentHeaders', flattenKeys(en.fragmentHeaders), ko.fragmentHeaders, 'ko')
    expectCoverage('fragments', Object.keys(en.fragments ?? {}), ko.fragments, 'ko')
  })
})
