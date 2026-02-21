$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$tauriAndroidProject = Join-Path $repoRoot 'apps\tauri\src-tauri\gen\android'

$resolveIfExists = {
  param([string]$value)
  if (-not $value) {
    return $null
  }
  $trimmed = $value.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed) -or -not (Test-Path $trimmed)) {
    return $null
  }
  return $trimmed
}

$resolveAndroidHome = {
  $candidates = @(
    (& $resolveIfExists $env:ANDROID_HOME),
    (& $resolveIfExists $env:ANDROID_SDK_ROOT),
    (& $resolveIfExists (Join-Path $env:LOCALAPPDATA 'Android\\Sdk')),
    (& $resolveIfExists (Join-Path $env:USERPROFILE 'AppData\\Local\\Android\\Sdk'))
  )
  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return $candidate
    }
  }
  return $null
}

$androidHome = & $resolveAndroidHome
if (-not $androidHome) {
  Write-Host 'Unable to detect Android SDK. Set ANDROID_HOME or ANDROID_SDK_ROOT to a real SDK path.'
  exit 1
}

$androidSdkEnv = @{
  ANDROID_HOME = $androidHome
  ANDROID_SDK_ROOT = $androidHome
}
foreach ($entry in $androidSdkEnv.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User')
  Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
  Write-Host "Set $($entry.Key): $($entry.Value)"
}

$javaHomeCandidates = @(
  (& $resolveIfExists $env:PROMETHEUS_ANDROID_JAVA_HOME),
  (& $resolveIfExists $env:JAVA_HOME),
  (& $resolveIfExists (Join-Path $env:LOCALAPPDATA 'mise\\installs\\java\\21.0.2')),
  (& $resolveIfExists (Join-Path $env:ProgramFiles 'Microsoft\\jdk-21.0.2')),
  (& $resolveIfExists (Join-Path $env:ProgramFiles 'Eclipse Adoptium\\jdk-21.0.2.13-hotspot')),
  (& $resolveIfExists (Join-Path $env:ProgramFiles 'Eclipse Adoptium\\jdk-21'))
)

$javaHome = $null
foreach ($candidate in $javaHomeCandidates) {
  if (-not [string]::IsNullOrWhiteSpace($candidate)) {
    $javaHome = $candidate
    break
  }
}

if ($javaHome) {
  [Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
  [Environment]::SetEnvironmentVariable('PROMETHEUS_ANDROID_JAVA_HOME', $javaHome, 'User')
  Set-Item -Path Env:JAVA_HOME -Value $javaHome
  Set-Item -Path Env:PROMETHEUS_ANDROID_JAVA_HOME -Value $javaHome
  Write-Host "Set JAVA_HOME/PROMETHEUS_ANDROID_JAVA_HOME: $javaHome"
}

$invalidPathFragments = @('Path\To\Your\Android\Sdk', 'Path/To/Your/Android/Sdk')
$requiredPathEntries = @(
  (Join-Path $androidHome 'platform-tools'),
  (Join-Path $androidHome 'cmdline-tools\\latest\\bin'),
  (Join-Path $androidHome 'emulator')
)
if ($javaHome) {
  $requiredPathEntries += (Join-Path $javaHome 'bin')
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathEntries = @()
if ($userPath) {
  $pathEntries = $userPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
$pathEntries += $requiredPathEntries

$cleaned = [System.Collections.Generic.List[string]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($entry in $pathEntries) {
  if (-not $entry) { continue }
  if (-not (Test-Path $entry)) { continue }
  if ($invalidPathFragments | Where-Object { $entry -like "*$($_)*" }) { continue }

  $full = [IO.Path]::GetFullPath($entry).TrimEnd('\')
  if ($seen.Add($full)) {
    $cleaned.Add($full)
  }
}

$userPathUpdated = [string]::Join(';', $cleaned)
[Environment]::SetEnvironmentVariable('Path', $userPathUpdated, 'User')
$systemPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$env:Path = if ($systemPath) { "${userPathUpdated};${systemPath}" } else { $userPathUpdated }
Write-Host 'Updated user Path with Android/Java tools.'

if (Test-Path (Join-Path $tauriAndroidProject 'gradlew.bat')) {
  $shim = Join-Path $tauriAndroidProject 'gradle.bat'
  if (-not (Test-Path $shim)) {
    Set-Content -Path $shim -Value '@echo off`r`ncall "%~dp0gradlew.bat" %*' -Encoding Ascii
    Write-Host "Created gradle shim: $shim"
  } else {
    Write-Host "Found gradle shim: $shim"
  }

  $androidPath = [IO.Path]::GetFullPath($tauriAndroidProject)
  $pathHasAndroid = $env:Path -split ';' |
    ForEach-Object {
      $entry = $_.Trim()
      if (-not $entry) { return $false }
      try {
        $normalized = [IO.Path]::GetFullPath($entry).TrimEnd('\')
        return [string]::Equals($normalized, $androidPath, [StringComparison]::OrdinalIgnoreCase)
      } catch {
        return $false
      }
    } |
    Where-Object { $_ -eq $true } |
    Select-Object -First 1
  if (-not $pathHasAndroid) {
    $env:Path = "${androidPath};$env:Path"
    [Environment]::SetEnvironmentVariable('Path', "$androidPath;$([Environment]::GetEnvironmentVariable('Path','Machine'))", 'User')
  }
} else {
  Write-Host 'Android mobile project not generated. Run: bun run tauri:mobile:init'
}

Write-Host ''
Write-Host 'Verification checks:'
foreach ($command in @('gradle.bat', 'gradlew.bat', 'adb', 'java')) {
  $match = Get-Command $command -ErrorAction SilentlyContinue
  if ($match) {
    Write-Host "  OK   $command -> $($match.Source)"
  } else {
    Write-Host "  MISSING $command"
  }
}

Write-Host ''
Write-Host 'Done. Start Android dev flow with: bun run dev:tauri:android'
