$ErrorActionPreference = "Stop"
$script = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\validate-split-service-dbs.ps1")
& $script
