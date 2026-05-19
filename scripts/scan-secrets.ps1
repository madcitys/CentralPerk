$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string] $message) {
  [void] $failures.Add($message)
}

function Test-IsGeneratedOrBinaryPath([string] $path) {
  $normalized = $path -replace "\\", "/"
  return (
    $normalized -match "(^|/)package-lock\.json$" -or
    $normalized -match "(^|/)node_modules/" -or
    $normalized -match "(^|/)dist/" -or
    $normalized -match "(^|/)\.next/" -or
    $normalized -match "(^|/)coverage/" -or
    $normalized -match "\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|eot)$"
  )
}

$secretPatterns = @(
  @{ Name = "Supabase secret key"; Pattern = "sb_secret_[A-Za-z0-9_=-]{20,}" },
  @{ Name = "Supabase service role token"; Pattern = "service_role_[A-Za-z0-9_=-]{16,}" },
  @{ Name = "JWT-like token"; Pattern = "eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}" },
  @{ Name = "OpenAI API key"; Pattern = "sk-[A-Za-z0-9]{20,}" },
  @{ Name = "GitHub token"; Pattern = "(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}" },
  @{ Name = "GitHub fine-grained token"; Pattern = "github_pat_[A-Za-z0-9_]{20,}" },
  @{ Name = "AWS access key"; Pattern = "AKIA[0-9A-Z]{16}" },
  @{ Name = "Private key block"; Pattern = "-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----" },
  @{ Name = "Connection string with password"; Pattern = 'postgres(?:ql)?://[^:\/\s`"''$]+:[^@\s`"''$]+@' }
)

$trackedFiles = git -C $repoRoot ls-files
foreach ($file in $trackedFiles) {
  if (Test-IsGeneratedOrBinaryPath $file) {
    continue
  }

  $fullPath = Join-Path $repoRoot $file
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    continue
  }

  $text = Get-Content -LiteralPath $fullPath -Raw -ErrorAction SilentlyContinue
  if ($null -eq $text) {
    continue
  }

  foreach ($entry in $secretPatterns) {
    $matches = [regex]::Matches($text, $entry.Pattern)
    foreach ($match in $matches) {
      $lineNumber = ($text.Substring(0, $match.Index) -split "`n").Count
      $line = (($text -split "`r?`n")[$lineNumber - 1]).Trim()

      if ($file -like "*.env.example" -and $line -match "(your-|_here|placeholder|example|password@db\.your-)") {
        continue
      }

      Add-Failure "${file}:$lineNumber may contain $($entry.Name)."
      break
    }
  }
}

$trackedEnvFiles = git -C $repoRoot ls-files "*.env" "*.env.*"
foreach ($file in $trackedEnvFiles) {
  if ($file -notlike "*.env.example") {
    Add-Failure "$file is tracked. Real env files should stay local and ignored."
  }
}

if ($failures.Count -gt 0) {
  Write-Host "Secret scan failed:"
  foreach ($failure in $failures) {
    Write-Host " - $failure"
  }
  exit 1
}

Write-Host "Secret scan passed. No obvious tracked secrets found."
