$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string] $message) {
  [void] $failures.Add($message)
}

function Get-Text([string] $path) {
  return Get-Content -LiteralPath $path -Raw
}

function Get-ComposeServiceBlock([string] $compose, [string] $serviceName) {
  $pattern = "(?ms)^  $([regex]::Escape($serviceName)):\r?\n(?<body>.*?)(?=^  [A-Za-z0-9_-]+:\r?\n|\z)"
  $match = [regex]::Match($compose, $pattern)
  if (-not $match.Success) {
    Add-Failure "docker-compose.yml is missing service block: $serviceName"
    return ""
  }
  return $match.Value
}

$services = @(
  @{ Name = "member-service"; Prefix = "MEMBER"; Port = 4003; Health = "/health" },
  @{ Name = "segment-service"; Prefix = "SEGMENT"; Port = 4004; Health = "/health" },
  @{ Name = "campaign-service"; Prefix = "CAMPAIGN"; Port = 4002; Health = "/health" },
  @{ Name = "notification-service"; Prefix = "NOTIFICATION"; Port = 4005; Health = "/health" },
  @{ Name = "reward-service"; Prefix = "REWARD"; Port = 4006; Health = "/health" },
  @{ Name = "points-engine"; Prefix = "POINTS"; Port = 4001; Health = "/health" }
)

foreach ($service in $services) {
  $serviceDir = Join-Path $root "services\$($service.Name)"
  if (-not (Test-Path -LiteralPath $serviceDir -PathType Container)) {
    Add-Failure "Missing service directory: services/$($service.Name)"
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

$gatewayDir = Join-Path $root "services\gateway"
foreach ($requiredFile in @("package.json", "tsconfig.json", "Dockerfile", ".env.example", "src\config.ts", "src\server.ts")) {
  $path = Join-Path $gatewayDir $requiredFile
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-Failure "Missing required file for gateway: $requiredFile"
  }
}

$composePath = Join-Path $root "docker-compose.yml"
if (-not (Test-Path -LiteralPath $composePath -PathType Leaf)) {
  Add-Failure "Missing docker-compose.yml"
} else {
  $compose = Get-Text $composePath
  if ($compose -match "(?i)_SERVICE_URL:\s*http://(127\.0\.0\.1|localhost)") {
    Add-Failure "docker-compose.yml contains localhost/127.0.0.1 in a service URL"
  }

  $allDbNames = New-Object System.Collections.Generic.List[string]
  foreach ($service in $services) {
    foreach ($suffix in @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL")) {
      [void] $allDbNames.Add("$($service.Prefix)_$suffix")
    }
  }

  foreach ($service in $services) {
    $block = Get-ComposeServiceBlock $compose $service.Name
    foreach ($dbName in $allDbNames) {
      if ($dbName.StartsWith("$($service.Prefix)_")) { continue }
      if ($block -match [regex]::Escape($dbName)) {
        Add-Failure "docker-compose.yml passes $dbName into $($service.Name)"
      }
    }
  }

  $gatewayBlock = Get-ComposeServiceBlock $compose "gateway"
  if ($gatewayBlock -match "(?i)(DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL)") {
    Add-Failure "gateway receives database or Supabase secret environment variables"
  }

  foreach ($expected in @(
    "MEMBER_SERVICE_URL: http://member-service:4003",
    "SEGMENT_SERVICE_URL: http://segment-service:4004",
    "CAMPAIGN_SERVICE_URL: http://campaign-service:4002",
    "NOTIFICATION_SERVICE_URL: http://notification-service:4005",
    "REWARD_SERVICE_URL: http://reward-service:4006",
    "POINTS_SERVICE_URL: http://points-engine:4001"
  )) {
    if ($compose -notmatch [regex]::Escape($expected)) {
      Add-Failure "docker-compose.yml is missing expected service URL mapping: $expected"
    }
  }
}

$frontendSecretPattern = "(SERVICE_ROLE|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|MEMBER_DATABASE_URL|SEGMENT_DATABASE_URL|CAMPAIGN_DATABASE_URL|NOTIFICATION_DATABASE_URL|REWARD_DATABASE_URL|POINTS_DATABASE_URL|MEMBER_SUPABASE_SERVICE_ROLE_KEY|SEGMENT_SUPABASE_SERVICE_ROLE_KEY|CAMPAIGN_SUPABASE_SERVICE_ROLE_KEY|NOTIFICATION_SUPABASE_SERVICE_ROLE_KEY|REWARD_SUPABASE_SERVICE_ROLE_KEY|POINTS_SUPABASE_SERVICE_ROLE_KEY)"
$frontendRoots = @(
  (Join-Path $root "src\app"),
  (Join-Path $root "src\components"),
  (Join-Path $root "src\pages"),
  (Join-Path $root "..\..\centralperk-frontend")
)

foreach ($frontendRoot in $frontendRoots) {
  if (-not (Test-Path -LiteralPath $frontendRoot)) { continue }
  Get-ChildItem -LiteralPath $frontendRoot -Recurse -File |
    Where-Object {
      $_.FullName -notmatch "\\src\\pages\\api\\" -and
      $_.FullName -notmatch "\\node_modules\\" -and
      $_.FullName -notmatch "\\\.next\\"
    } |
    ForEach-Object {
      $text = Get-Content -LiteralPath $_.FullName -Raw
      if ($text -match $frontendSecretPattern) {
        Add-Failure "Frontend/client-side secret reference found in $($_.FullName.Substring($root.Path.Length + 1))"
      }
    }
}

Get-ChildItem -LiteralPath (Join-Path $root "services") -Recurse -File -Include "*.ts" |
  Where-Object {
    $_.FullName -notmatch "\\dist\\" -and
    $_.FullName -notmatch "\\node_modules\\" -and
    $_.Name -ne "config.ts"
  } |
  ForEach-Object {
    $relative = $_.FullName.Substring($root.Path.Length + 1)
    $text = Get-Content -LiteralPath $_.FullName -Raw
    if ($text -match "process\.env\.(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|DATABASE_URL)") {
      Add-Failure "Unsafe shared DB env access outside config file: $relative"
    }
    if ($relative -notmatch "member-service" -and $text -match "loyalty_members" -and $text -notmatch "config\.splitMode") {
      Add-Failure "Potential cross-service member table access without split-mode guard: $relative"
    }
  }

Get-ChildItem -LiteralPath $root -Recurse -File -Filter ".env.example" |
  ForEach-Object {
    $relative = $_.FullName.Substring($root.Path.Length + 1)
    $text = Get-Content -LiteralPath $_.FullName -Raw
    if ($text -match "eyJ[A-Za-z0-9_-]{20,}" -or $text -match "sb_secret_" -or $text -match "service_role_[A-Za-z0-9]{16,}") {
      Add-Failure ".env.example appears to contain a real secret: $relative"
    }
    if ($text -match "https://[a-z0-9]{15,}\.supabase\.co") {
      Add-Failure ".env.example appears to contain a real Supabase project URL: $relative"
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
