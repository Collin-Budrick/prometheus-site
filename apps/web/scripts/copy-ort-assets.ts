import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(process.cwd(), '..', '..')
const ortSourceDir = path.join(repoRoot, 'node_modules', 'onnxruntime-web', 'dist')
const ortDestDir = path.join(process.cwd(), 'public', 'ort')

const copyOrtAssets = async () => {
  await rm(ortDestDir, { recursive: true, force: true })
  await mkdir(ortDestDir, { recursive: true })
  await cp(ortSourceDir, ortDestDir, { recursive: true })
  console.log(`Copied ONNX Runtime WASM assets to ${path.relative(process.cwd(), ortDestDir)}`)
}

copyOrtAssets().catch((err) => {
  console.error('Failed to copy ONNX Runtime assets.', err)
  process.exit(1)
})
