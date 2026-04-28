$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Services = @(
  "services\points-engine",
  "services\campaign-service",
  "services\gateway"
)

function Invoke-Npm {
  param(
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Output "npm $($Arguments -join ' ') [$WorkingDirectory]"
  Push-Location $WorkingDirectory
  try {
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "npm $($Arguments -join ' ') failed in $WorkingDirectory"
    }
  } finally {
    Pop-Location
  }
}

Invoke-Npm -WorkingDirectory $Root -Arguments @("install")

foreach ($Service in $Services) {
  $ServicePath = Join-Path $Root $Service
  Invoke-Npm -WorkingDirectory $ServicePath -Arguments @("install")
  Invoke-Npm -WorkingDirectory $ServicePath -Arguments @("run", "build")
}

Write-Output "Local stack setup complete. Run: npm run local"
