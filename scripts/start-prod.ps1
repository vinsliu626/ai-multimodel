param(
  [string]$Port = "3000",
[string]$BaseUrl = "http://127.0.0.1:3000",
[string]$LogPath = "tmp\\prod.log",
[string]$ErrorLogPath = "tmp\\prod.err.log",
[int]$ReadinessTimeoutMs = 60000,
[int]$ReadinessPollMs = 500,
[string]$ReadinessPath = "/"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $env:NEXTAUTH_SECRET) {
  Write-Host "Missing NEXTAUTH_SECRET. Set it in the environment before starting production."
  exit 1
}
if (-not $env:NEXTAUTH_URL) {
  Write-Host "Missing NEXTAUTH_URL. Set it to match BaseUrl before starting production."
  exit 1
}

if ($env:NEXTAUTH_URL -ne $BaseUrl) {
  Write-Host "NEXTAUTH_URL does not match BaseUrl. Use the same host for login and tests."
  exit 1
}

$logDir = Split-Path -Parent $LogPath
if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
if (Test-Path -LiteralPath $LogPath) {
  Remove-Item -LiteralPath $LogPath -Force
}
if (Test-Path -LiteralPath $ErrorLogPath) {
  Remove-Item -LiteralPath $ErrorLogPath -Force
}

$env:NODE_ENV = "production"
$nodeArgs = @("node_modules\\next\\dist\\bin\\next", "start", "-p", $Port)
$proc = Start-Process `
  -FilePath "node" `
  -ArgumentList $nodeArgs `
  -RedirectStandardOutput $LogPath `
  -RedirectStandardError $ErrorLogPath `
  -PassThru `
  -WindowStyle Hidden

$startedAt = Get-Date
$ready = $false
while (((Get-Date) - $startedAt).TotalMilliseconds -lt $ReadinessTimeoutMs) {
  if ($proc.HasExited) {
    $elapsedMs = [int]((Get-Date) - $startedAt).TotalMilliseconds
    Write-Host ("READINESS fail elapsedMs={0}" -f $elapsedMs)
    Write-Host ("PROCESS exited=true exitCode={0}" -f $proc.ExitCode)
    exit 1
  }

  try {
    $url = $BaseUrl.TrimEnd("/") + $ReadinessPath
    $resp = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 5
    if ($resp -and [int]$resp.StatusCode -gt 0) {
      $ready = $true
      break
    }
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode.value__
      if ($code -gt 0) {
        $ready = $true
        break
      }
    }
  }

  Start-Sleep -Milliseconds $ReadinessPollMs
}

$elapsedMs = [int]((Get-Date) - $startedAt).TotalMilliseconds
if (-not $ready) {
  Write-Host ("READINESS fail elapsedMs={0}" -f $elapsedMs)
  Write-Host ("PROCESS alive={0} pid={1}" -f (-not $proc.HasExited), $proc.Id)
  exit 1
}

Write-Host ("READINESS success elapsedMs={0}" -f $elapsedMs)
Write-Host ("PROCESS alive={0} pid={1}" -f (-not $proc.HasExited), $proc.Id)
