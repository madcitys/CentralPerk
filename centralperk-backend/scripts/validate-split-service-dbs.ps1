$ErrorActionPreference = "Stop"

$backendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$workspaceRoot = Resolve-Path (Join-Path $backendRoot "..")
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string] $message) {
  [void] $failures.Add($message)
}

function Get-Text([string] $path) {
  return Get-Content -LiteralPath $path -Raw
}

$services = @(
  @{ Name = "member-service"; Prefix = "MEMBER" },
  @{ Name = "segment-service"; Prefix = "SEGMENT" },
  @{ Name = "campaign-service"; Prefix = "CAMPAIGN" },
  @{ Name = "notification-service"; Prefix = "NOTIFICATION" },
  @{ Name = "reward-service"; Prefix = "REWARD" },
  @{ Name = "points-engine"; Prefix = "POINTS" }
)

foreach ($service in $services) {
  $serviceDir = Join-Path $backendRoot $service.Name
  if (-not (Test-Path -LiteralPath $serviceDir -PathType Container)) {
    Add-Failure "Missing service directory: $($service.Name)"
    continue
  }

  foreach ($requiredFile in @("package.json", "tsconfig.json", "Dockerfile", ".env.example", "src\config.ts", "src\server.ts")) {
    $path = Join-Path $serviceDir $requiredFile
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      Add-Failure "Missing required file for $($service.Name): $requiredFile"
    }
  }

  $configPath = Join-Path $serviceDir "src\config.ts"
  if (Test-Path -LiteralPath $configPath) {
    $configText = Get-Text $configPath
    foreach ($suffix in @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "DB_SCHEMA")) {
      $envName = "$($service.Prefix)_$suffix"
      if ($configText -notmatch [regex]::Escape($envName)) {
        Add-Failure "$($service.Name) config does not reference $envName"
      }
    }
    if ($configText -notmatch "USE_SPLIT_SERVICE_DATABASES") {
      Add-Failure "$($service.Name) config does not check USE_SPLIT_SERVICE_DATABASES"
    }
    if ($configText -notmatch "Missing required environment variable") {
      Add-Failure "$($service.Name) config does not fail fast with exact missing env names"
    }
  }
}

$gatewayDir = Join-Path $backendRoot "gateway"
foreach ($requiredFile in @("package.json", "tsconfig.json", "Dockerfile", ".env.example", "src\config.ts", "src\server.ts")) {
  $path = Join-Path $gatewayDir $requiredFile
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-Failure "Missing required file for gateway: $requiredFile"
  }
}

if (Test-Path -LiteralPath $gatewayDir) {
  Get-ChildItem -LiteralPath $gatewayDir -Recurse -File -Include "*.ts" |
    Where-Object { $_.FullName -notmatch "\\dist\\" -and $_.FullName -notmatch "\\node_modules\\" } |
    ForEach-Object {
      $relative = $_.FullName.Substring($backendRoot.Path.Length + 1)
      $text = Get-Content -LiteralPath $_.FullName -Raw
      if ($text -match "(DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL)") {
        Add-Failure "Gateway should not reference database or Supabase secret envs: $relative"
      }
    }
}

Get-ChildItem -LiteralPath $backendRoot -Recurse -File |
  Where-Object {
    $_.Extension -eq ".ts" -and
    $_.FullName -notmatch "\\dist\\" -and
    $_.FullName -notmatch "\\node_modules\\" -and
    $_.Name -ne "config.ts"
  } |
  ForEach-Object {
    $relative = $_.FullName.Substring($backendRoot.Path.Length + 1)
    $text = Get-Content -LiteralPath $_.FullName -Raw
    if ($text -match "process\.env\.(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|DATABASE_URL)") {
      Add-Failure "Unsafe shared DB env access outside config file: $relative"
    }
    if (
      $relative -notmatch "^member-service\\" -and
      $relative -notmatch "^supabase\\" -and
      $relative -notmatch "^scripts\\" -and
      $text -match "loyalty_members" -and
      $text -notmatch "config\.splitMode"
    ) {
      Add-Failure "Potential cross-service member table access: $relative"
    }
  }

$frontendRoot = Join-Path $workspaceRoot "centralperk-frontend"
if (Test-Path -LiteralPath $frontendRoot) {
  Get-ChildItem -LiteralPath $frontendRoot -Recurse -File |
    Where-Object {
      $_.Extension -in @(".ts", ".tsx") -and
      $_.FullName -notmatch "\\src\\pages\\api\\" -and
      $_.FullName -notmatch "\\src\\server\\" -and
      $_.FullName -notmatch "\\node_modules\\" -and
      $_.FullName -notmatch "\\\.next\\"
    } |
    ForEach-Object {
      $relative = $_.FullName.Substring($workspaceRoot.Path.Length + 1)
      $text = Get-Content -LiteralPath $_.FullName -Raw
      if ($text -match "(SERVICE_ROLE|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|MEMBER_DATABASE_URL|SEGMENT_DATABASE_URL|CAMPAIGN_DATABASE_URL|NOTIFICATION_DATABASE_URL|REWARD_DATABASE_URL|POINTS_DATABASE_URL)") {
        Add-Failure "Frontend/client-side secret reference found in $relative"
      }
    }

  $splitOwnedTablePatterns = @(
    '\.from\("loyalty_members"\)',
    '\.from\("loyalty_transactions"\)',
    '\.from\("points_ledger"\)',
    '\.from\("points_tiers"\)',
    '\.from\("earning_rules"\)',
    '\.from\("earn_tasks"\)',
    '\.from\("promotion_campaigns"\)',
    '\.from\("member_segments"\)',
    '\.from\("member_segment_assignments"\)',
    '\.from\("notification_outbox"\)',
    '\.from\("notification_templates"\)',
    '\.from\("notification_campaigns"\)',
    '\.from\("rewards_catalog"\)',
    '\.from\("reward_partners"\)',
    '\.from\("reward_redemptions"\)',
    '\.from\("reward_vouchers"\)',
    '\.from\("challenges"\)',
    '\.from\("challenge_leaderboard_view"\)',
    '\.from\("surveys"\)',
    '\.from\("survey_questions"\)',
    '\.from\("survey_responses"\)',
    '\.from\("member_engagement_settings"\)',
    '\.rpc\("loyalty_[^"]+"\)'
  )

  foreach ($scanDir in @("src\pages\api", "src\server", "src\app\lib", "src\app\auth")) {
    $fullScanDir = Join-Path $frontendRoot $scanDir
    if (-not (Test-Path -LiteralPath $fullScanDir -PathType Container)) {
      Add-Failure "Missing frontend split-db scan directory: centralperk-frontend\$scanDir"
      continue
    }

    Get-ChildItem -LiteralPath $fullScanDir -Recurse -File |
      Where-Object {
        $_.Extension -in @(".ts", ".tsx") -and
        $_.FullName -notmatch "\\node_modules\\" -and
        $_.FullName -notmatch "\\\.next\\"
      } |
      ForEach-Object {
        $relative = $_.FullName.Substring($workspaceRoot.Path.Length + 1)
        $text = Get-Content -LiteralPath $_.FullName -Raw
        foreach ($pattern in $splitOwnedTablePatterns) {
          if ($text -match $pattern) {
            Add-Failure "Frontend module queries split-owned data source directly: $relative"
            break
          }
        }

        if ($relative -match "centralperk-frontend\\src\\server\\voucher-service\.ts$" -and $text -match "readApiState|updateApiState") {
          Add-Failure "Voucher service still uses local runtime storage instead of Reward Service: $relative"
        }

        if ($relative -match "centralperk-frontend\\src\\server\\idempotency\.ts$" -and $text -match "readApiState|updateApiState|\.runtime|api-store\.json") {
          Add-Failure "Idempotency still uses local runtime storage instead of Points Service DB-backed idempotency: $relative"
        }
      }
  }
}

Get-ChildItem -LiteralPath $backendRoot -Recurse -File -Filter ".env.example" |
  ForEach-Object {
    $relative = $_.FullName.Substring($backendRoot.Path.Length + 1)
    $text = Get-Content -LiteralPath $_.FullName -Raw
    if ($text -match "eyJ[A-Za-z0-9_-]{20,}" -or $text -match "sb_secret_" -or $text -match "service_role_[A-Za-z0-9]{16,}") {
      Add-Failure ".env.example appears to contain a real secret: $relative"
    }
  }

if ($failures.Count -gt 0) {
  Write-Host "Split service DB validation failed:"
  foreach ($failure in $failures) {
    Write-Host " - $failure"
  }
  exit 1
}

Write-Host "Split service DB validation passed."
