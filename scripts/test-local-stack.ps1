$ErrorActionPreference = "Continue"
$Urls = @(
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000/health",
  "http://127.0.0.1:4000/members",
  "http://127.0.0.1:4000/campaigns",
  "http://127.0.0.1:4000/segments",
  "http://127.0.0.1:4000/notifications?limit=20",
  "http://127.0.0.1:4000/rewards"
)

foreach ($Url in $Urls) {
  $Timer = [Diagnostics.Stopwatch]::StartNew()
  try {
    Invoke-RestMethod -Method GET -Uri $Url -TimeoutSec 15 | Out-Null
    $Timer.Stop()
    Write-Output "$Url OK $([math]::Round($Timer.Elapsed.TotalMilliseconds))ms"
  } catch {
    $Timer.Stop()
    Write-Output "$Url FAIL $([math]::Round($Timer.Elapsed.TotalMilliseconds))ms $($_.Exception.Message)"
  }
}
