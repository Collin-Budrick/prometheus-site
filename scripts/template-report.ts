import { buildTemplateReport } from './template-lib.ts'
import { readArgMap, toStringArg } from './template-cli-utils.ts'

const argMap = readArgMap(process.argv.slice(2))
const jsonMode = argMap.has('json')
const presetFilter = toStringArg(argMap.get('preset'))
const bundleFilter = toStringArg(argMap.get('bundle'))
const report = buildTemplateReport()

if (jsonMode) {
  const filtered = {
    ...report,
    presets: presetFilter ? report.presets.filter((preset) => preset.id === presetFilter) : report.presets,
    bundles: bundleFilter ? report.bundles.filter((bundle) => bundle.id === bundleFilter) : report.bundles
  }
  process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`)
  process.exit(0)
}

const visiblePresets = presetFilter ? report.presets.filter((preset) => preset.id === presetFilter) : report.presets
const visibleBundles = bundleFilter ? report.bundles.filter((bundle) => bundle.id === bundleFilter) : report.bundles

const lines = [
  `${report.branding.site.name} template report`,
  `- presets: ${visiblePresets.length}/${report.presets.length}`,
  `- bundles: ${visibleBundles.length}/${report.bundles.length}`,
  `- generated artifacts: ${report.generatedArtifacts.length}`,
  `- build outputs: ${report.buildOutputs.length}`,
  '',
  'Presets:'
]

visiblePresets.forEach((preset) => {
  lines.push(
    `- ${preset.id}: ${preset.title} [${preset.runtime}]`,
    `  features=${preset.features.join(', ') || 'none'}`,
    `  routes=${preset.routes.join(', ') || 'none'}`
  )
})

lines.push('', 'Bundles:')

visibleBundles.forEach((bundle) => {
  lines.push(
    `- ${bundle.id}: ${bundle.title} [${bundle.visibility}/${bundle.placement}]`,
    `  dependsOn=${bundle.dependsOn.join(', ') || 'none'}`,
    `  qualityGates=${bundle.qualityGates.join(', ') || 'none'}`
  )
})

process.stdout.write(`${lines.join('\n')}\n`)
