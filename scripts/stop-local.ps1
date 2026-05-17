$ErrorActionPreference = "Stop"

$ports = @(3000, 4000, 4001, 4002, 4003, 4004, 4005, 4006)
$currentPid = $PID
$pids = @()

foreach ($port in $ports) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    if ($listener.OwningProcess -and $listener.OwningProcess -ne $currentPid) {
      $pids += [int] $listener.OwningProcess
    }
  }
}

$pids = $pids | Sort-Object -Unique
foreach ($processId in $pids) {
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    Stop-Process -Id $processId -Force
    Write-Host "Stopped $($process.ProcessName) pid=$processId"
  } catch {
    Write-Host "Process already stopped pid=$processId"
  }
}

Write-Host "Local CentralPerk ports are stopped."
