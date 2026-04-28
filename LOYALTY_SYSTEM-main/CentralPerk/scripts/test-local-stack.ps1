$ErrorActionPreference = "Continue"

$Urls = @(
  "http://127.0.0.1:3000/api/health",
  "http://127.0.0.1:4000/health",
  "http://127.0.0.1:4001/health",
  "http://127.0.0.1:4002/health"
)

foreach ($Url in $Urls) {
  $Timer = [Diagnostics.Stopwatch]::StartNew()
  try {
    $Response = Invoke-RestMethod -Method GET -Uri $Url -TimeoutSec 15
    $Timer.Stop()
    Write-Output "$Url OK $([math]::Round($Timer.Elapsed.TotalMilliseconds))ms ok=$($Response.ok)"
  } catch {
    $Timer.Stop()
    Write-Output "$Url FAIL $([math]::Round($Timer.Elapsed.TotalMilliseconds))ms $($_.Exception.Message)"
  }
}

$Body = @{
  memberIdentifier = "MEM-000011"
  fallbackEmail = "soundwave@example.com"
  points = 25
  transactionType = "PURCHASE"
  transactionRef = "HEALTH-AWARD-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  reason = "local stack test"
  amountSpent = 250
  productCode = "SKU-001"
  productCategory = "Beverage"
}

try {
  $Timer = [Diagnostics.Stopwatch]::StartNew()
  $Result = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:4000/points/award" -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8) -TimeoutSec 15
  $Timer.Stop()
  Write-Output "POST /points/award OK $([math]::Round($Timer.Elapsed.TotalMilliseconds))ms newBalance=$($Result.result.newBalance)"
} catch {
  $Timer.Stop()
  Write-Output "POST /points/award FAIL $([math]::Round($Timer.Elapsed.TotalMilliseconds))ms $($_.Exception.Message)"
}
