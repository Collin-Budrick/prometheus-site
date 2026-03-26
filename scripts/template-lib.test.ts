import { describe, expect, it } from 'bun:test'
import { buildTemplateReport, collectGeneratedTemplateFileDiffs, generatedTemplateFiles } from './template-lib.ts'

describe('generatedTemplateFiles', () => {
  it('includes the expanded docs and env surfaces', () => {
    const files = generatedTemplateFiles()

    expect(files.has('docs/template-reference.md')).toBe(true)
    expect(files.has('docs/template-preset-guide.md')).toBe(true)
    expect(files.has('docs/template-bundle-cookbook.md')).toBe(true)
    expect(files.has('docs/template-site/index.html')).toBe(true)
    expect(files.has('docs/template-report.json')).toBe(true)
    expect(files.has('.env.marketing.example')).toBe(true)
    expect(files.has('.env.community.example')).toBe(true)
    expect(files.get('docs/template-site/index.html')).toContain('Generated Template Docs')
  })

  it('builds diff metadata for every generated file', () => {
    const files = generatedTemplateFiles()
    const diffs = collectGeneratedTemplateFileDiffs()

    expect(diffs).toHaveLength(files.size)
    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'docs/template-reference.md'
        }),
        expect.objectContaining({
          relativePath: '.env.example'
        })
      ])
    )
  })
})

describe('buildTemplateReport', () => {
  it('exposes the richer preset and artifact report surface', () => {
    const report = buildTemplateReport()
    const presetIds = report.presets.map((preset) => preset.id)

    expect(presetIds).toEqual(['full', 'core', 'marketing', 'saas', 'commerce', 'community'])
    expect(report.generatedArtifacts).toEqual(
      expect.arrayContaining([
        'docs/template-reference.md',
        'docs/template-report.json',
        '.env.marketing.example',
        '.env.community.example'
      ])
    )
    expect(report.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: '/', bundleId: 'demo-home' }),
        expect.objectContaining({ route: '/offline', bundleId: 'pwa' })
      ])
    )
  })
})
