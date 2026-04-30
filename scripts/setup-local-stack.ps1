$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

npm install
npm --prefix centralperk-backend install
npm run build:backend
npm run build:frontend

Write-Output "Local setup complete. Run: npm run restart:local"
