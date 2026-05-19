param(
  [switch] $Build
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$logs = Join-Path $root ".runtime\service-logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Invoke-Checked([string] $command, [string[]] $arguments) {
  $display = "$command $($arguments -join ' ')"
  Write-Host $display
  $process = Start-Process -FilePath $command -ArgumentList $arguments -WorkingDirectory $root -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Command failed with exit code $($process.ExitCode): $display"
  }
}

function Stop-LocalPorts {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "stop-local.ps1")
}

function Start-ServiceProcess([string] $name, [string] $scriptPath) {
  $stdout = Join-Path $logs "$name.out.log"
  $stderr = Join-Path $logs "$name.err.log"
  if (Test-Path -LiteralPath $stdout) { Remove-Item -LiteralPath $stdout -Force }
  if (Test-Path -LiteralPath $stderr) { Remove-Item -LiteralPath $stderr -Force }
  $process = Start-Process -FilePath "node" `
    -ArgumentList @($scriptPath) `
    -WorkingDirectory $root `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru
  Write-Host "Started $name pid=$($process.Id)"
}

function Start-Frontend {
  $stdout = Join-Path $logs "frontend.out.log"
  $stderr = Join-Path $logs "frontend.err.log"
  if (Test-Path -LiteralPath $stdout) { Remove-Item -LiteralPath $stdout -Force }
  if (Test-Path -LiteralPath $stderr) { Remove-Item -LiteralPath $stderr -Force }
  $process = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("--prefix", "centralperk-frontend", "run", "start") `
    -WorkingDirectory $root `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru
  Write-Host "Started frontend pid=$($process.Id)"
}

function Wait-HttpOk([string] $url, [int] $timeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Host "$url -> $($response.StatusCode)"
        return
      }
    } catch {
      Start-Sleep -Milliseconds 750
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $url"
}

function Test-FrontendAssets {
  $html = (Invoke-WebRequest -Uri "http://127.0.0.1:3010/login" -UseBasicParsing -TimeoutSec 10).Content
  $assets = ($html | Select-String -Pattern '/_next/static/[^"'']+' -AllMatches).Matches.Value | Sort-Object -Unique
  foreach ($asset in $assets) {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3010$asset" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -ne 200) {
      throw "Frontend asset failed: $asset -> $($response.StatusCode)"
    }
  }
  Write-Host "Frontend static assets are serving from the active build."
}

Stop-LocalPorts

if ($Build) {
  Invoke-Checked "npm.cmd" @("run", "build:services")
  Invoke-Checked "npm.cmd" @("run", "build:frontend")
}

Start-ServiceProcess "member-service" "centralperk-backend/member-service/dist/server.js"
Start-ServiceProcess "segment-service" "centralperk-backend/segment-service/dist/server.js"
Start-ServiceProcess "campaign-service" "centralperk-backend/campaign-service/dist/server.js"
Start-ServiceProcess "notification-service" "centralperk-backend/notification-service/dist/server.js"
Start-ServiceProcess "reward-service" "centralperk-backend/reward-service/dist/server.js"
Start-ServiceProcess "points-engine" "centralperk-backend/points-engine/dist/server.js"

Wait-HttpOk "http://127.0.0.1:3012/health/db"
Wait-HttpOk "http://127.0.0.1:3013/health/db"
Wait-HttpOk "http://127.0.0.1:3014/health/db"
Wait-HttpOk "http://127.0.0.1:3015/health/db"
Wait-HttpOk "http://127.0.0.1:3016/health/db"
Wait-HttpOk "http://127.0.0.1:3017/health/db"

Start-ServiceProcess "gateway" "centralperk-backend/gateway/dist/server.js"
Wait-HttpOk "http://127.0.0.1:3011/health"

Start-Frontend
Wait-HttpOk "http://127.0.0.1:3010/api/health"
Test-FrontendAssets

Write-Host "CentralPerk local stack is running."
