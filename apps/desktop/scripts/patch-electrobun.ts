import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const workspaceRoot = path.resolve(import.meta.dir, '..')

const targetFiles = [
  path.join(workspaceRoot, 'node_modules', 'electrobun', 'dist', 'api', 'bun', 'proc', 'native.ts'),
  path.join(workspaceRoot, 'node_modules', 'electrobun', 'dist-win-x64', 'api', 'bun', 'proc', 'native.ts')
]

const sandboxNeedle = `window.__electrobunEventBridge = window.__electrobunEventBridge || window.webkit?.messageHandlers?.eventBridge || window.eventBridge || window.chrome?.webview?.hostObjects?.eventBridge;
window.__electrobunInternalBridge = window.__electrobunInternalBridge || window.webkit?.messageHandlers?.internalBridge || window.internalBridge || window.chrome?.webview?.hostObjects?.internalBridge;`

const sandboxReplacement = `window.__electrobunResolveBridge = window.__electrobunResolveBridge || ((bridgeName) => {
  try {
    const webkitBridge = window.webkit?.messageHandlers?.[bridgeName];
    if (webkitBridge) return webkitBridge;
  } catch {}
  try {
    const directBridge = window[bridgeName];
    if (directBridge) return directBridge;
  } catch {}
  try {
    if (bridgeName === "eventBridge") {
      const chromeWebview = window.chrome?.webview;
      if (chromeWebview?.postMessage) {
        return { postMessage: (message) => chromeWebview.postMessage(message) };
      }
    }
  } catch {}
  try {
    const syncHostObjects = window.chrome?.webview?.hostObjects?.sync;
    const syncBridge = syncHostObjects?.[bridgeName];
    if (syncBridge) return syncBridge;
  } catch {}
  return undefined;
});
window.__electrobunEventBridge = window.__electrobunEventBridge || window.__electrobunResolveBridge("eventBridge");
window.__electrobunInternalBridge = window.__electrobunInternalBridge || window.__electrobunResolveBridge("internalBridge");`

const trustedNeedle = `window.__electrobunEventBridge = window.__electrobunEventBridge || window.webkit?.messageHandlers?.eventBridge || window.eventBridge || window.chrome?.webview?.hostObjects?.eventBridge;
window.__electrobunInternalBridge = window.__electrobunInternalBridge || window.webkit?.messageHandlers?.internalBridge || window.internalBridge || window.chrome?.webview?.hostObjects?.internalBridge;
window.__electrobunBunBridge = window.__electrobunBunBridge || window.webkit?.messageHandlers?.bunBridge || window.bunBridge || window.chrome?.webview?.hostObjects?.bunBridge;`

const trustedReplacement = `window.__electrobunResolveBridge = window.__electrobunResolveBridge || ((bridgeName) => {
  try {
    const webkitBridge = window.webkit?.messageHandlers?.[bridgeName];
    if (webkitBridge) return webkitBridge;
  } catch {}
  try {
    const directBridge = window[bridgeName];
    if (directBridge) return directBridge;
  } catch {}
  try {
    if (bridgeName === "eventBridge") {
      const chromeWebview = window.chrome?.webview;
      if (chromeWebview?.postMessage) {
        return { postMessage: (message) => chromeWebview.postMessage(message) };
      }
    }
  } catch {}
  try {
    const syncHostObjects = window.chrome?.webview?.hostObjects?.sync;
    const syncBridge = syncHostObjects?.[bridgeName];
    if (syncBridge) return syncBridge;
  } catch {}
  return undefined;
});
window.__electrobunEventBridge = window.__electrobunEventBridge || window.__electrobunResolveBridge("eventBridge");
window.__electrobunInternalBridge = window.__electrobunInternalBridge || window.__electrobunResolveBridge("internalBridge");
window.__electrobunBunBridge = window.__electrobunBunBridge || window.__electrobunResolveBridge("bunBridge");`

const applyPatch = (filePath: string) => {
  if (!existsSync(filePath)) return false

  const source = readFileSync(filePath, 'utf8')
  const normalizedSource = source.replaceAll('\r\n', '\n')
  let next = normalizedSource

  if (next.includes(trustedNeedle)) {
    next = next.replace(trustedNeedle, trustedReplacement)
  }

  if (next.includes(sandboxNeedle)) {
    next = next.replace(sandboxNeedle, sandboxReplacement)
  }

  if (next === normalizedSource) {
    const alreadyPatched =
      next.includes('window.__electrobunResolveBridge = window.__electrobunResolveBridge || ((bridgeName) => {') &&
      !next.includes('window.chrome?.webview?.hostObjects?.eventBridge')
    if (!alreadyPatched) {
      throw new Error(`[desktop] Electrobun bridge patch could not be applied to ${filePath}`)
    }
    return false
  }

  writeFileSync(filePath, next, 'utf8')
  return true
}

const patchedFiles = targetFiles.filter((filePath) => applyPatch(filePath))

if (patchedFiles.length > 0) {
  process.stdout.write(`[desktop] Patched Electrobun WebView bridge lookup in ${patchedFiles.length} file(s).\n`)
}
