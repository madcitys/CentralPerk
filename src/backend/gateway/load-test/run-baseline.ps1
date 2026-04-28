param(
  [string]$GatewayUrl = "http://127.0.0.1:4000",
  [string]$Duration = "30s"
)

$ErrorActionPreference = "Stop"

$Artifacts = Join-Path $PSScriptRoot "artifacts"
$Summary = Join-Path $Artifacts "baseline-summary.json"
$Results = Join-Path $Artifacts "baseline-results.json"
$Markdown = Join-Path $Artifacts "baseline-summary.md"

New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null
$env:GATEWAY_URL = $GatewayUrl
$env:LOYALTY_K6_DURATION = $Duration

& k6 run `
  --tag testid=local-baseline `
  --summary-export $Summary `
  --out "json=$Results" `
  (Join-Path $PSScriptRoot "k6-gateway.js")

if ($LASTEXITCODE -ne 0) {
  throw "k6 baseline run failed."
}

& node (Join-Path $PSScriptRoot "summarize-k6.mjs") $Summary $Markdown
if ($LASTEXITCODE -ne 0) {
  throw "k6 summary generation failed."
}
