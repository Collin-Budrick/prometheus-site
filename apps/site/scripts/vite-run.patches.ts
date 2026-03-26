import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export type SourcePatchResult = {
  source: string
  changed: boolean
}

const helperName = 'function stringifyDevServerData(serverData)'
const safeSerializedLine = '        const serverData = JSON.parse(${JSON.stringify(safeServerData)});'
const safeServerDataLine = '  const safeServerData = stringifyDevServerData(serverData);'
const getViteIndexFunction = /\r?\nfunction getViteDevIndexHtml\(entryUrl, serverData\) \{/
const legacySerializeMarkers = [
  /const serverData = JSON\.parse\(\$\{JSON\.stringify\(JSON\.stringify\(serverData\)\)\}\)\s*;?/g,
  /const serverData = JSON\.parse\(stringifyDevServerData\(serverData\)\)\s*;?/g
]

const helperLines = [
  'function stringifyDevServerData(serverData) {',
  '  const seen = new WeakSet();',
  '  const replacer = (_key, value) => {',
  "    if (typeof value === 'function' || typeof value === 'symbol') {",
  '      return undefined;',
  '    }',
  "    if (typeof value === 'bigint') {",
  '      return value.toString();',
  '    }',
  "    if (value && typeof value === 'object') {",
  '      if (seen.has(value)) {',
  "        return '[Circular]';",
  '      }',
  '      seen.add(value);',
  '    }',
  '    return value;',
  '  };',
  '',
  '  try {',
  '    const serialized = JSON.stringify(serverData, replacer);',
  '    if (serialized) {',
  '      return serialized;',
  '    }',
  '  } catch (error) {',
  "    console.warn('Failed to stringify Qwik optimizer payload for dev server data fallback:', error)",
  '    // continue to fallback payload below',
  '  }',
  '',
  '  const safeServerData = serverData && typeof serverData === "object" ? serverData : {};',
  '  const fallback = {',
  '    ...safeServerData,',
  '    qwikcity: {',
  '      routeName: safeServerData.qwikcity?.routeName,',
  '      ev: safeServerData.qwikcity?.ev,',
  '      params: safeServerData.qwikcity?.params ?? {},',
  '      loadedRoute: safeServerData.qwikcity?.loadedRoute,',
  '      response: {',
  '        status: safeServerData.qwikcity?.response?.status ?? 200,',
  '        loaders: safeServerData.qwikcity?.response?.loaders ?? {},',
  '        action: safeServerData.qwikcity?.response?.action,',
  '        formData: safeServerData.qwikcity?.response?.formData ?? null',
  '      }',
  '    }',
  '  }',
  '',
  '  try {',
  '    return JSON.stringify(fallback)',
  '  } catch (error) {',
  "    console.warn('Failed to fallback stringify Qwik optimizer payload:', error)",
  "    return '{}'",
  '  }',
  '}',
  ''
]

const buildStartEmitSnippet = [
  '      ql && _ctx.emitFile({',
  '        id: ql.id,',
  '        type: "chunk",',
  '        preserveSignature: "allow-extension"',
  '      });'
]

const buildStartEmitReplacement = [
  '      ql && !devServer && _ctx.emitFile({',
  '        id: ql.id,',
  '        type: "chunk",',
  '        preserveSignature: "allow-extension"',
  '      });'
]

const preloaderEmitSnippet = [
  '        ctx.emitFile({',
  '          id: preloader.id,',
  '          type: "chunk",',
  '          preserveSignature: "allow-extension"',
  '        });'
]

const preloaderEmitReplacement = [
  '        !devServer && ctx.emitFile({',
  '          id: preloader.id,',
  '          type: "chunk",',
  '          preserveSignature: "allow-extension"',
  '        });'
]

const detectEol = (source: string) => (source.includes('\r\n') ? '\r\n' : '\n')

const joinLines = (lines: string[], eol: string) => lines.join(eol)

const replaceSnippet = (source: string, current: string[], next: string[], eol: string) => {
  const currentSnippet = joinLines(current, eol)
  if (!source.includes(currentSnippet)) return source
  return source.replace(currentSnippet, joinLines(next, eol))
}

export const patchQwikOptimizerSource = (source: string): SourcePatchResult => {
  const eol = detectEol(source)
  let next = source

  if (!next.includes(helperName)) {
    const helperBlock = joinLines(helperLines, eol)
    next = next.replace(getViteIndexFunction, (match) => `${eol}${helperBlock}${match}`)
  }

  for (const marker of legacySerializeMarkers) {
    next = next.replace(marker, safeSerializedLine)
  }

  if (
    next.includes(helperName) &&
    !next.includes(safeServerDataLine) &&
    next.includes('function getViteDevIndexHtml(entryUrl, serverData) {')
  ) {
    next = next.replace(getViteIndexFunction, (match) => `${match}${eol}${safeServerDataLine}`)
  }

  next = replaceSnippet(next, buildStartEmitSnippet, buildStartEmitReplacement, eol)
  next = replaceSnippet(next, preloaderEmitSnippet, preloaderEmitReplacement, eol)

  return {
    source: next,
    changed: next !== source
  }
}

export const patchQwikOptimizerFile = (optimizerPath: string) => {
  if (!existsSync(optimizerPath)) return false

  const source = readFileSync(optimizerPath, 'utf8')
  const result = patchQwikOptimizerSource(source)
  if (result.changed) {
    writeFileSync(optimizerPath, result.source, 'utf8')
  }
  return result.changed
}

export const patchQwikOptimizerFiles = (optimizerPaths: string[]) => {
  let changed = false
  for (const optimizerPath of optimizerPaths) {
    changed = patchQwikOptimizerFile(optimizerPath) || changed
  }
  return changed
}
