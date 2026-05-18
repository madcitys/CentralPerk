$ErrorActionPreference = "Stop"
$script = Resolve-Path (Join-Path $PSScriptRoot "..\centralperk-backend\scripts\validate-split-service-dbs.ps1")
& $script
