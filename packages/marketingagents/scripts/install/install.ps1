param(
  [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

function Normalize-Version {
  param([string]$RequestedVersion)

  if (-not $RequestedVersion) {
    return "latest"
  }

  switch ($RequestedVersion.ToLowerInvariant()) {
    "latest" { return "latest" }
    "stable" { return "latest" }
    "edge" { throw "The edge channel has been removed. Use the default installer for the latest tagged release or pass an exact version." }
    default { return $RequestedVersion.TrimStart("v") }
  }
}

function Resolve-LatestReleaseVersion {
  $page = Invoke-WebRequest -Uri "https://github.com/youmake-ai/marketingagents/releases/latest"
  $match = [regex]::Match($page.Content, 'releases/tag/v([0-9][^"''<>\s]*)')
  if (-not $match.Success) {
    throw "Failed to resolve the latest MarketingAgents release version."
  }

  return $match.Groups[1].Value
}

function Resolve-ReleaseMetadata {
  param(
    [string]$RequestedVersion,
    [string]$AssetTarget,
    [string]$BundleExtension
  )

  $normalizedVersion = Normalize-Version -RequestedVersion $RequestedVersion

  if ($normalizedVersion -eq "latest") {
    $resolvedVersion = Resolve-LatestReleaseVersion
  } else {
    $resolvedVersion = $normalizedVersion
  }

  $bundleName = "marketingagents-$resolvedVersion-$AssetTarget"
  $archiveName = "$bundleName.$BundleExtension"
  $baseUrl = if ($env:MARKETINGAGENTS_INSTALL_BASE_URL) {
    $env:MARKETINGAGENTS_INSTALL_BASE_URL
  } elseif ($env:ADSAGENTS_INSTALL_BASE_URL) {
    $env:ADSAGENTS_INSTALL_BASE_URL
  } else {
    "https://github.com/youmake-ai/marketingagents/releases/download/v$resolvedVersion"
  }

  return [PSCustomObject]@{
    ResolvedVersion = $resolvedVersion
    BundleName = $bundleName
    ArchiveName = $archiveName
    DownloadUrl = "$baseUrl/$archiveName"
  }
}

function Get-ArchSuffix {
  # Prefer PROCESSOR_ARCHITECTURE which is always available on Windows.
  # RuntimeInformation::OSArchitecture requires .NET 4.7.1+ and may not
  # be loaded in every Windows PowerShell 5.1 session.
  $envArch = $env:PROCESSOR_ARCHITECTURE
  if ($envArch) {
    switch ($envArch) {
      "AMD64" { return "x64" }
      "ARM64" { return "arm64" }
    }
  }

  try {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($arch.ToString()) {
      "X64" { return "x64" }
      "Arm64" { return "arm64" }
    }
  } catch {}

  throw "Unsupported architecture: $envArch"
}

$archSuffix = Get-ArchSuffix
$assetTarget = "win32-$archSuffix"
$release = Resolve-ReleaseMetadata -RequestedVersion $Version -AssetTarget $assetTarget -BundleExtension "zip"
$resolvedVersion = $release.ResolvedVersion
$bundleName = $release.BundleName
$archiveName = $release.ArchiveName
$downloadUrl = $release.DownloadUrl

$installRoot = if ($env:MARKETINGAGENTS_INSTALL_APP_DIR) {
  $env:MARKETINGAGENTS_INSTALL_APP_DIR
} else {
  Join-Path $env:LOCALAPPDATA "Programs\marketingagents"
}
$installBinDir = Join-Path $installRoot "bin"
$bundleDir = Join-Path $installRoot $bundleName
$legacyInstallRoot = if ($env:ADSAGENTS_INSTALL_APP_DIR) {
  $env:ADSAGENTS_INSTALL_APP_DIR
} else {
  Join-Path $env:LOCALAPPDATA "Programs\adsagents"
}
$legacyInstallBinDir = Join-Path $legacyInstallRoot "bin"

$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("marketingagents-install-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmpDir | Out-Null

try {
  $archivePath = Join-Path $tmpDir $archiveName
  Write-Host "==> Downloading $archiveName"
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
  } catch {
    throw @"
Failed to download $archiveName from:
  $downloadUrl

The win32-$archSuffix bundle is missing from the GitHub release.
This usually means the release exists, but not all platform bundles were uploaded.

Workarounds:
  - try again after the release finishes publishing
  - pass the latest published version explicitly, e.g.:
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/youmake-ai/marketingagents/main/scripts/install/install.ps1))) -Version 0.1.0
"@
  }

  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  if (Test-Path $bundleDir) {
    Remove-Item -Recurse -Force $bundleDir
  }

  Write-Host "==> Extracting $archiveName"
  Expand-Archive -LiteralPath $archivePath -DestinationPath $installRoot -Force

  New-Item -ItemType Directory -Path $installBinDir -Force | Out-Null

  $commandNames = @("marketingagents", "ma")
  Write-Host "==> Linking marketingagents and ma into $installBinDir"
  foreach ($commandName in $commandNames) {
    $shimPath = Join-Path $installBinDir "$commandName.cmd"
    $shimPs1Path = Join-Path $installBinDir "$commandName.ps1"
  @"
@echo off
CALL "$bundleDir\$commandName.cmd" %*
"@ | Set-Content -Path $shimPath -Encoding ASCII

  @"
`$BundleDir = "$bundleDir"
& "`$BundleDir\node\node.exe" "`$BundleDir\app\bin\marketingagents.js" @args
"@ | Set-Content -Path $shimPs1Path -Encoding UTF8
  }

  foreach ($legacyShimPath in @(
    (Join-Path $legacyInstallBinDir "adsagents.cmd"),
    (Join-Path $legacyInstallBinDir "adsagents.ps1")
  )) {
    if (Test-Path $legacyShimPath) {
      $legacyShimContent = Get-Content -LiteralPath $legacyShimPath -Raw
      if ($legacyShimContent.Contains($legacyInstallRoot)) {
        Remove-Item -LiteralPath $legacyShimPath -Force
        Write-Host "Removed legacy installer-managed shim: $legacyShimPath"
      }
    }
  }

  $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $pathEntries = @()
  $pathChanged = $false
  if ($currentUserPath) {
    foreach ($entry in $currentUserPath.Split(';')) {
      $trimmedEntry = $entry.Trim()
      if ([string]::IsNullOrWhiteSpace($trimmedEntry)) {
        continue
      }
      if ($trimmedEntry.TrimEnd('\') -ieq $legacyInstallBinDir.TrimEnd('\')) {
        $pathChanged = $true
        continue
      }
      $pathEntries += $trimmedEntry
    }
  }

  $alreadyOnPath = @($pathEntries | Where-Object {
    $_.TrimEnd('\') -ieq $installBinDir.TrimEnd('\')
  }).Count -gt 0
  if (-not $alreadyOnPath) {
    $pathEntries = @($installBinDir) + $pathEntries
    $pathChanged = $true
  }

  if ($pathChanged) {
    [Environment]::SetEnvironmentVariable("Path", ($pathEntries -join ';'), "User")
    Write-Host "Updated user PATH. Open a new shell to run marketingagents or ma."
  } else {
    Write-Host "$installBinDir is already on PATH."
  }

  if (Test-Path $legacyInstallRoot) {
    Write-Host "Legacy runtime preserved at $legacyInstallRoot; remove it after verifying this install."
  }

  foreach ($commandName in $commandNames) {
    $resolvedCommand = Get-Command $commandName -ErrorAction SilentlyContinue
    $expectedCommandPaths = @(
      (Join-Path $installBinDir "$commandName.cmd"),
      (Join-Path $installBinDir "$commandName.ps1")
    )
    if ($resolvedCommand -and -not ($expectedCommandPaths -contains $resolvedCommand.Source)) {
      Write-Warning "Current shell resolves $commandName to $($resolvedCommand.Source)"
      Write-Host "Run in a new shell, or run: `$env:Path = '$installBinDir;' + `$env:Path"
      Write-Host "Then run: $commandName"
      Write-Host "If that path is an old package-manager install, remove it or put $installBinDir first on PATH."
    }
  }

  Write-Host "MarketingAgents $resolvedVersion installed successfully."
} finally {
  if (Test-Path $tmpDir) {
    Remove-Item -Recurse -Force $tmpDir
  }
}
