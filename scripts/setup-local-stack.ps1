$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

npm install
npm --prefix centralperk-frontend install
npm --prefix centralperk-backend install
npm run setup:services
npm run build:backend
npm run build:services
npm run build:frontend

Write-Output "Local setup complete. Run: docker compose up --build -d or npm run restart:local"
