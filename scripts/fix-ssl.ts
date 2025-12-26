import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const decoder = new TextDecoder()
const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDir, '..')
const isWsl =
  process.platform === 'linux' &&
  (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
const isWindows = process.platform === 'win32' || isWsl
const tlsHosts = ['prometheus.dev', 'prometheus.prod']
const tlsUrls = ['https://prometheus.dev/en', 'https://prometheus.prod/']

const certBaseName = 'prometheus.dev+prometheus.prod'
const certDir = join(root, 'infra', 'traefik', 'certs')
const certPem = join(certDir, `${certBaseName}.pem`)
const certKey = join(certDir, `${certBaseName}.key`)
const tlsConfig = join(root, 'infra', 'traefik', 'dynamic', 'tls.yml')

const tlsConfigContents = `tls:\n  certificates:\n    - certFile: /etc/traefik/certs/${certBaseName}.pem\n      keyFile: /etc/traefik/certs/${certBaseName}.key\n`

const spawnSync = (
  cmd: string[],
  options?: { cwd?: string; stdout?: 'inherit' | 'pipe'; stderr?: 'inherit' | 'pipe' }
) => {
  try {
    return Bun.spawnSync(cmd, {
      cwd: options?.cwd,
      stdout: options?.stdout ?? 'inherit',
      stderr: options?.stderr ?? 'inherit'
    })
  } catch {
    return null
  }
}

const run = (cmd: string[], options?: { cwd?: string }) => {
  const result = spawnSync(cmd, { cwd: options?.cwd })
  if (!result || result.exitCode !== 0) {
    throw new Error(`Command failed: ${cmd.join(' ')}`)
  }
}

const runCapture = (cmd: string[]) => {
  const result = spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' })
  if (!result || result.exitCode !== 0) {
    throw new Error(`Command failed: ${cmd.join(' ')}`)
  }
  return decoder.decode(result.stdout).trim()
}

const psQuote = (value: string) => `'${value.replace(/'/g, `''`)}'`

const runPowerShell = (command: string) => {
  run(['powershell.exe', '-NoProfile', '-Command', command])
}

const getWindowsEnv = (name: string) => {
  const value = runCapture(['cmd.exe', '/c', 'echo', `%${name}%`])
  if (!value || value.includes(`%${name}%`)) {
    throw new Error(`Unable to read Windows env var ${name}`)
  }
  return value
}

const toWslPath = (windowsPath: string) => runCapture(['wslpath', '-u', windowsPath])
const toWindowsPath = (linuxPath: string) => runCapture(['wslpath', '-w', linuxPath])

const getWindowsArchSuffix = () => {
  const raw = (isWsl ? getWindowsEnv('PROCESSOR_ARCHITECTURE') : process.env.PROCESSOR_ARCHITECTURE) ?? ''
  const normalized = raw.toUpperCase()
  if (normalized === 'ARM64') return 'arm64'
  if (normalized === 'AMD64') return 'amd64'
  if (normalized === 'X86') return '386'
  return 'amd64'
}

const downloadMkcert = async (targetPath: string) => {
  const arch = getWindowsArchSuffix()
  const releaseRes = await fetch('https://api.github.com/repos/FiloSottile/mkcert/releases/latest', {
    headers: { 'User-Agent': 'prometheus-site' }
  })
  if (!releaseRes.ok) {
    throw new Error(`Failed to fetch mkcert release metadata: ${releaseRes.status}`)
  }
  const release = (await releaseRes.json()) as {
    assets?: { name: string; browser_download_url: string }[]
  }
  const asset = release.assets?.find((item) => item.name.includes(`windows-${arch}.exe`))
  if (!asset) {
    throw new Error(`Unable to find mkcert asset for windows-${arch}`)
  }
  const binRes = await fetch(asset.browser_download_url)
  if (!binRes.ok) {
    throw new Error(`Failed to download mkcert binary: ${binRes.status}`)
  }
  await mkdir(dirname(targetPath), { recursive: true })
  await Bun.write(targetPath, new Uint8Array(await binRes.arrayBuffer()))
}

const ensureTlsConfig = async () => {
  let needsWrite = !existsSync(tlsConfig)
  if (!needsWrite) {
    try {
      const current = await readFile(tlsConfig, 'utf8')
      if (!current.includes(`${certBaseName}.pem`) || !current.includes(`${certBaseName}.key`)) {
        needsWrite = true
      }
    } catch {
      needsWrite = true
    }
  }
  if (needsWrite) {
    await writeFile(tlsConfig, tlsConfigContents)
    console.log(`Restored ${tlsConfig}`)
  }
}

const ensureMkcertWindows = async () => {
  const localAppData = isWsl ? getWindowsEnv('LOCALAPPDATA') : process.env.LOCALAPPDATA
  if (!localAppData) {
    throw new Error('LOCALAPPDATA is not set')
  }

  const mkcertExeWin = win32.join(localAppData, 'mkcert', 'mkcert.exe')
  const mkcertExeNative = isWsl ? toWslPath(mkcertExeWin) : mkcertExeWin

  if (!existsSync(mkcertExeNative)) {
    console.log('Downloading mkcert...')
    await downloadMkcert(mkcertExeNative)
  }

  const repoWin = isWsl ? toWindowsPath(root) : root
  const certDirWin = win32.join(repoWin, 'infra', 'traefik', 'certs')
  const certPemWin = win32.join(certDirWin, `${certBaseName}.pem`)
  const certKeyWin = win32.join(certDirWin, `${certBaseName}.key`)
  const certDirNative = isWsl ? toWslPath(certDirWin) : certDirWin

  await mkdir(certDirNative, { recursive: true })

  runPowerShell(`& ${psQuote(mkcertExeWin)} -install`)
  runPowerShell(
    `& ${psQuote(mkcertExeWin)} -cert-file ${psQuote(certPemWin)} -key-file ${psQuote(certKeyWin)} prometheus.dev prometheus.prod`
  )
}

const ensureMkcertPosix = () => {
  const result = spawnSync(['mkcert', '-version'], { stdout: 'pipe', stderr: 'pipe' })
  if (!result || result.exitCode !== 0) {
    throw new Error('mkcert is not installed. Install it from https://github.com/FiloSottile/mkcert and rerun.')
  }
}

const restartTraefik = () => {
  const composeFile = join(root, 'docker-compose.yml')
  const dockerCompose = spawnSync(['docker', 'compose', '-f', composeFile, 'up', '-d', 'traefik'], { cwd: root })
  if (dockerCompose && dockerCompose.exitCode === 0) {
    return true
  }

  const legacyCompose = spawnSync(['docker-compose', '-f', composeFile, 'up', '-d', 'traefik'], { cwd: root })
  if (legacyCompose && legacyCompose.exitCode === 0) {
    return true
  }

  return false
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const hasCommand = (cmd: string[]) => {
  const result = spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' })
  return !!result && result.exitCode === 0
}

const hasWindowsExecutable = (name: string) => {
  const result = spawnSync(['cmd.exe', '/c', 'where', name], { stdout: 'pipe', stderr: 'pipe' })
  return !!result && result.exitCode === 0
}

const retry = async (label: string, attempts: number, fn: () => void) => {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fn()
      return
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await sleep(750)
      }
    }
  }
  throw new Error(`${label} failed: ${lastError instanceof Error ? lastError.message : lastError}`)
}

const validateWithWindowsCurl = async () => {
  if (!hasWindowsExecutable('curl.exe')) {
    return false
  }

  for (const url of tlsUrls) {
    await retry(`TLS validation for ${url}`, 4, () => {
      run(['cmd.exe', '/c', 'curl.exe', '-I', '--ssl-no-revoke', url])
    })
  }

  return true
}

const validateWithCurl = async () => {
  if (!hasCommand(['curl', '--version'])) {
    return false
  }

  for (const url of tlsUrls) {
    await retry(`TLS validation for ${url}`, 4, () => {
      run(['curl', '-I', url])
    })
  }

  return true
}

const validateWithOpenSSL = async () => {
  if (!hasCommand(['openssl', 'version'])) {
    return false
  }

  for (const host of tlsHosts) {
    await retry(`TLS validation for ${host}`, 4, () => {
      const output = runCapture([
        'sh',
        '-c',
        `echo | openssl s_client -connect ${host}:443 -servername ${host} 2>/dev/null | openssl x509 -noout -subject -issuer`
      ])
      if (!output.includes('mkcert') || output.includes('TRAEFIK DEFAULT CERT')) {
        throw new Error(`Unexpected certificate for ${host}`)
      }
    })
  }

  return true
}

const validateTls = async () => {
  console.log('Validating TLS...')
  if (isWindows) {
    if (await validateWithWindowsCurl()) {
      return
    }
    if (isWsl && (await validateWithOpenSSL())) {
      return
    }
    console.warn('Skipping TLS validation; curl.exe was not found.')
    return
  }

  if (await validateWithCurl()) {
    return
  }
  if (await validateWithOpenSSL()) {
    return
  }
  console.warn('Skipping TLS validation; curl/openssl not available.')
}

try {
  await ensureTlsConfig()

  if (isWindows) {
    await ensureMkcertWindows()
  } else {
    await mkdir(certDir, { recursive: true })
    ensureMkcertPosix()
    run(['mkcert', '-install'])
    run(['mkcert', '-cert-file', certPem, '-key-file', certKey, 'prometheus.dev', 'prometheus.prod'])
  }

  const restarted = restartTraefik()
  if (!restarted) {
    console.warn('Unable to restart Traefik. Ensure Docker is running and try again.')
  }

  await validateTls()
  console.log('SSL repair complete.')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
