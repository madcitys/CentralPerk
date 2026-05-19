$ErrorActionPreference = "Stop"

$ports = @(3010, 3011, 3017, 3014, 3012, 3013, 3015, 3016)
$currentPid = $PID
$pids = @()

foreach ($line in (netstat -ano -p tcp)) {
  if ($line -notmatch '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
    continue
  }

  $port = [int] $Matches[1]
  $processId = [int] $Matches[2]
  if ($ports -contains $port -and $processId -ne $currentPid) {
    $pids += $processId
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
