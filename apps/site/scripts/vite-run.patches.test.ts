import { describe, expect, it } from 'bun:test'
import { patchQwikOptimizerSource } from './vite-run.patches.ts'

const buildFixture = (eol = '\n') =>
  [
    'const prelude = true;',
    'function getViteDevIndexHtml(entryUrl, serverData) {',
    '        const serverData = JSON.parse(${JSON.stringify(JSON.stringify(serverData))});',
    '}',
    'const buildStart = async _ctx => {',
    '  if ("client" === opts.target) {',
    '      const ql = await _ctx.resolve("@builder.io/qwik/qwikloader.js", void 0, {',
    '        skipSelf: true',
    '      });',
    '      ql && _ctx.emitFile({',
    '        id: ql.id,',
    '        type: "chunk",',
    '        preserveSignature: "allow-extension"',
    '      });',
    '  }',
    '};',
    'const resolveId = async (ctx, id2, importerId) => {',
    '      const preloader = await ctx.resolve(QWIK_PRELOADER_ID, importerId, {',
    '        skipSelf: true',
    '      });',
    '      if (preloader) {',
    '        ctx.emitFile({',
    '          id: preloader.id,',
    '          type: "chunk",',
    '          preserveSignature: "allow-extension"',
    '        });',
    '        return preloader;',
    '      }',
    '};'
  ].join(eol)

describe('patchQwikOptimizerSource', () => {
  it('rewrites dev-unsafe emitFile call sites and preserves the dev server data patch', () => {
    const result = patchQwikOptimizerSource(buildFixture())

    expect(result.changed).toBe(true)
    expect(result.source).toContain('ql && !devServer && _ctx.emitFile({')
    expect(result.source).toContain('!devServer && ctx.emitFile({')
    expect(result.source).toContain('function stringifyDevServerData(serverData)')
    expect(result.source).toContain('const safeServerData = stringifyDevServerData(serverData);')
    expect(result.source).toContain('const serverData = JSON.parse(${JSON.stringify(safeServerData)});')
  })

  it('is idempotent when run more than once', () => {
    const first = patchQwikOptimizerSource(buildFixture())
    const second = patchQwikOptimizerSource(first.source)

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.source).toBe(first.source)
  })

  it('leaves unrelated source unchanged', () => {
    const source = 'export const noop = true;\n'
    const result = patchQwikOptimizerSource(source)

    expect(result.changed).toBe(false)
    expect(result.source).toBe(source)
  })

  it('leaves already-fixed upstream source unchanged', () => {
    const source = [
      'const prelude = true;',
      'function stringifyDevServerData(serverData) {',
      "  return JSON.stringify(serverData ?? {}) || '{}'",
      '}',
      'function getViteDevIndexHtml(entryUrl, serverData) {',
      '  const safeServerData = stringifyDevServerData(serverData);',
      '        const serverData = JSON.parse(${JSON.stringify(safeServerData)});',
      '}',
      'const buildStart = async _ctx => {',
      '      ql && !devServer && _ctx.emitFile({',
      '        id: ql.id,',
      '        type: "chunk",',
      '        preserveSignature: "allow-extension"',
      '      });',
      '};',
      'const resolveId = async (ctx, id2, importerId) => {',
      '        !devServer && ctx.emitFile({',
      '          id: preloader.id,',
      '          type: "chunk",',
      '          preserveSignature: "allow-extension"',
      '        });',
      '};'
    ].join('\n')
    const result = patchQwikOptimizerSource(source)

    expect(result.changed).toBe(false)
    expect(result.source).toBe(source)
  })
})
