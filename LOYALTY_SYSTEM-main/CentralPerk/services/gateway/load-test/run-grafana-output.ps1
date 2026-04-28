param(
  [string]$GatewayUrl = "http://127.0.0.1:4000",
  [string]$RemoteWriteUrl = "http://127.0.0.1:9090/api/v1/write",
  [string]$Duration = "30s",
  [string]$TestId = "local-grafana"
)

$ErrorActionPreference = "Stop"

$env:GATEWAY_URL = $GatewayUrl
$env:LOYALTY_K6_DURATION = $Duration
$env:K6_PROMETHEUS_RW_SERVER_URL = $RemoteWriteUrl
$env:K6_PROMETHEUS_RW_TREND_STATS = "p(95),p(99),min,max"

& k6 run `
  -o experimental-prometheus-rw `
  --tag "testid=$TestId" `
  (Join-Path $PSScriptRoot "k6-gateway.js")
