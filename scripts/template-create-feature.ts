import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { templateFeatureIds, templatePresetIds } from '../packages/template-config/src/index.ts'
import { readArgMap, toListArg, toStringArg } from './template-cli-utils.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const argMap = readArgMap(process.argv.slice(2))

const toKebabCase = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const toPascalCase = (value: string) =>
  toKebabCase(value)
    .split('-')
    .filter(Boolean)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join('')

const quote = (value: string) => JSON.stringify(value)

const ask = async (question: string, fallback: string) => {
  if (!input.isTTY || !output.isTTY) return fallback
  const rl = createInterface({ input, output })
  try {
    const answer = (await rl.question(`${question} [${fallback}]: `)).trim()
    return answer || fallback
  } finally {
    rl.close()
  }
}

const rawFeatureId = toStringArg(argMap.get('feature-id')) || (await ask('Feature id', 'demo-feature'))
const featureId = toKebabCase(rawFeatureId)
if (!featureId) {
  throw new Error('[template:create-feature] Feature id is required.')
}
if ((templateFeatureIds as readonly string[]).includes(featureId)) {
  throw new Error(`[template:create-feature] Feature '${featureId}' already exists.`)
}

const title = toStringArg(argMap.get('title')) || (await ask('Feature title', toPascalCase(featureId)))
const routeSegment = toKebabCase(toStringArg(argMap.get('route')) || (await ask('Route segment', featureId)))
const routePath = `/${routeSegment}`
const visibility = toStringArg(argMap.get('visibility')) || 'public'
const placement = toStringArg(argMap.get('placement')) || 'starter-safe'
const defaultEnabledIn = toListArg(argMap.get('default-enabled-in')).filter((entry) =>
  (templatePresetIds as readonly string[]).includes(entry)
)
const dependsOn = toListArg(argMap.get('depends-on')).filter((entry) => (templateFeatureIds as readonly string[]).includes(entry))
const dryRun = argMap.has('dry-run')

const pascalName = toPascalCase(featureId)
const camelName = pascalName[0]!.toLowerCase() + pascalName.slice(1)
const featureDirectory = path.join(root, 'apps', 'site', 'src', 'features', featureId)
const routeDirectory = path.join(root, 'apps', 'site', 'src', 'routes', ...routeSegment.split('/'))
const featureFile = path.join(featureDirectory, `${featureId}-route.tsx`)
const storyFile = path.join(featureDirectory, `${featureId}.stories.tsx`)
const testFile = path.join(featureDirectory, `${featureId}.test.ts`)
const routeFile = path.join(routeDirectory, 'index.tsx')
const templateConfigPath = path.join(root, 'packages', 'template-config', 'src', 'index.ts')

const ensureAbsent = (filePath: string) => {
  if (existsSync(filePath)) {
    throw new Error(`[template:create-feature] Refusing to overwrite existing file: ${path.relative(root, filePath)}`)
  }
}

;[featureFile, storyFile, testFile, routeFile].forEach(ensureAbsent)

const featureImportPath = path
  .relative(path.dirname(routeFile), featureFile)
  .replaceAll(path.sep, '/')
  .replace(/\.tsx$/, '')
const routeImportPath = featureImportPath.startsWith('.') ? featureImportPath : `./${featureImportPath}`

const defaultCopyName = `default${pascalName}Copy`
const resolveCopyName = `resolve${pascalName}Copy`
const featureComponentName = `${pascalName}Route`
const skeletonName = `${pascalName}Skeleton`
const featureCopyType = `${pascalName}Copy`

const featureSource = `import { component$ } from '@builder.io/qwik'
import { StaticRouteSkeleton, StaticRouteTemplate } from '@prometheus/ui'

export type ${featureCopyType} = {
  metaLine: string
  title: string
  description: string
  actionLabel: string
  closeLabel: string
}

export const ${defaultCopyName}: ${featureCopyType} = {
  metaLine: ${quote(title)},
  title: ${quote(title)},
  description: ${quote(`Scaffolded feature route for ${title}. Replace this copy with product-specific content.`)},
  actionLabel: ${quote(`Open ${title}`)},
  closeLabel: 'Close'
}

export const ${resolveCopyName} = (copy?: Partial<${featureCopyType}>): ${featureCopyType} => ({
  ...${defaultCopyName},
  ...copy
})

export const ${featureComponentName} = component$<{ copy?: Partial<${featureCopyType}> }>(({ copy }) => {
  const resolvedCopy = ${resolveCopyName}(copy)
  return (
    <StaticRouteTemplate
      metaLine={resolvedCopy.metaLine}
      title={resolvedCopy.title}
      description={resolvedCopy.description}
      actionLabel={resolvedCopy.actionLabel}
      closeLabel={resolvedCopy.closeLabel}
    />
  )
})

export const ${skeletonName} = () => <StaticRouteSkeleton />

export default ${featureComponentName}
`

const storySource = `import type { Meta, StoryObj } from 'storybook-framework-qwik'
import { ${featureComponentName} } from './${featureId}-route'

const meta: Meta<typeof ${featureComponentName}> = {
  title: ${quote(`Site/Features/${title}`)},
  component: ${featureComponentName},
  parameters: {
    layout: 'padded'
  },
  tags: ['autodocs']
}

export default meta

type Story = StoryObj<typeof ${featureComponentName}>

export const Default: Story = {}

export const CustomCopy: Story = {
  args: {
    copy: {
      title: ${quote(`${title} Custom`)},
      description: 'Replace the scaffolded copy and hook the feature into live data.'
    }
  }
}
`

const testSource = `import { describe, expect, it } from 'bun:test'
import { ${defaultCopyName}, ${resolveCopyName} } from './${featureId}-route'

describe('${resolveCopyName}', () => {
  it('keeps scaffolded defaults stable', () => {
    expect(${defaultCopyName}.title).toBe(${quote(title)})
  })

  it('merges partial copy overrides', () => {
    expect(${resolveCopyName}({ title: ${quote(`${title} Beta`)} })).toMatchObject({
      title: ${quote(`${title} Beta`)},
      actionLabel: ${quote(`Open ${title}`)}
    })
  })
})
`

const routeSource = `export * from '${routeImportPath}'
export { default } from '${routeImportPath}'
`

const renderManifestBlock = () => {
  const lines = [
    `  '${featureId}': {`,
    `    id: '${featureId}',`,
    `    title: ${quote(title)},`,
    `    description: ${quote(`Scaffolded feature bundle for ${title}. Replace routes, env keys, and ownership metadata as the feature grows.`)},`,
    dependsOn.length > 0 ? `    dependsOn: [${dependsOn.map((entry) => `'${entry}'`).join(', ')}],` : '',
    `    routes: ['${routePath}'],`,
    `    stories: ['apps/site/src/features/${featureId}/*.stories.tsx'],`,
    `    tests: ['apps/site/src/features/${featureId}/*.test.ts'],`,
    `    owners: ['template'],`,
    `    docs: ['docs/template-bundle-cookbook.md#${featureId}'],`,
    `    migrations: ['Replace scaffold defaults and wire runtime integration before enabling this bundle in production.'],`,
    `    qualityGates: ['build', 'typecheck'],`,
    `    visibility: '${visibility}',`,
    `    placement: '${placement}',`,
    `    defaultEnabledIn: [${defaultEnabledIn.map((entry) => `'${entry}'`).join(', ')}]`,
    '  },'
  ].filter(Boolean)
  return lines.join('\n')
}

const updateTemplateConfig = () => {
  const original = readFileSync(templateConfigPath, 'utf8')
  const featureIdsMatch = original.match(/export const templateFeatureIds = \[(?<body>[\s\S]*?)\] as const/)
  if (!featureIdsMatch?.groups?.body) {
    throw new Error('[template:create-feature] Unable to locate templateFeatureIds in template-config.')
  }
  const featureIdLines = featureIdsMatch.groups.body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
  const lastFeatureLine = featureIdLines.pop()
  if (!lastFeatureLine) {
    throw new Error('[template:create-feature] templateFeatureIds is unexpectedly empty.')
  }
  featureIdLines.push(lastFeatureLine.endsWith(',') ? lastFeatureLine : `${lastFeatureLine},`)
  featureIdLines.push(`  '${featureId}'`)
  const nextFeatureIdsBlock = `export const templateFeatureIds = [\n${featureIdLines.join('\n')}\n] as const`
  let updated = original.replace(featureIdsMatch[0], nextFeatureIdsBlock)

  const manifestMatch = updated.match(
    /export const featureBundleManifests: Record<TemplateFeatureId, FeatureBundleManifest> = \{\r?\n(?<body>[\s\S]*?)\r?\n\}\r?\n\r?\nexport const featureBundles =/
  )
  if (!manifestMatch?.groups?.body) {
    throw new Error('[template:create-feature] Unable to locate featureBundleManifests in template-config.')
  }

  const manifestBody = manifestMatch.groups.body.trimEnd()
  const bodyWithTrailingComma = manifestBody.endsWith(',') ? manifestBody : `${manifestBody},`
  const nextManifestBlock = `export const featureBundleManifests: Record<TemplateFeatureId, FeatureBundleManifest> = {\n${bodyWithTrailingComma}\n${renderManifestBlock()}\n}\n\nexport const featureBundles =`
  updated = updated.replace(manifestMatch[0], nextManifestBlock)
  return updated
}

const nextTemplateConfig = updateTemplateConfig()
const writes = [
  { filePath: featureFile, content: featureSource },
  { filePath: storyFile, content: storySource },
  { filePath: testFile, content: testSource },
  { filePath: routeFile, content: routeSource },
  { filePath: templateConfigPath, content: nextTemplateConfig }
]

if (dryRun) {
  process.stdout.write(
    `Scaffold preview for '${featureId}':\n${writes
      .map((entry) => `- ${path.relative(root, entry.filePath).replaceAll(path.sep, '/')}`)
      .join('\n')}\n`
  )
  process.exit(0)
}

writes.forEach(({ filePath, content }) => {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
})

const syncResult = spawnSync('bun', ['run', 'template:sync'], {
  cwd: root,
  stdio: 'inherit',
  shell: false
})

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1)
}

process.stdout.write(`Scaffolded feature '${featureId}' at ${routePath}.\n`)
