Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-SecretFromEnvFiles {
  $files = @('.env.local', '.env')
  foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { continue }
    $line = Get-Content -LiteralPath $f | Where-Object { $_ -match '^\s*NEXTAUTH_SECRET\s*=' } | Select-Object -First 1
    if (-not $line) { continue }
    $v = ($line -split '=', 2)[1].Trim()
    if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
    if ($v.Length -gt 0) { return $v }
  }
  return $null
}

function Get-SessionShape([string]$Body) {
  if ($null -eq $Body) { return 'request_failed' }
  $t = $Body.Trim()
  if ($t -eq '{}') { return 'exactly_{}' }
  if ([string]::IsNullOrWhiteSpace($t)) { return 'empty_string' }
  return 'non_empty'
}

# Step 1
$netstatOut = cmd /c "netstat -ano | findstr :3000"
if ($LASTEXITCODE -eq 0 -and $netstatOut) {
  $listenLine = $netstatOut | Where-Object { $_ -match 'LISTENING' } | Select-Object -First 1
  $pid = $null
  if ($listenLine) {
    $parts = ($listenLine -split '\s+') | Where-Object { $_ -ne '' }
    if ($parts.Count -ge 5) { $pid = $parts[4] }
  }
  Write-Output ("STEP1 port3000_listening: true pid: {0}" -f $(if($pid){$pid}else{'unknown'}))
  if ($pid) {
    cmd /c "taskkill /PID $pid /F" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Output 'PERMISSION REQUIRED ? USER ATTENTION NEEDED'
      exit 99
    }
  }
} else {
  Write-Output 'STEP1 port3000_listening: false'
}

# Step 2
$secret = Get-SecretFromEnvFiles
if (-not $secret) { throw 'NEXTAUTH_SECRET not found in .env files' }
$env:NEXTAUTH_SECRET = $secret
$env:NEXTAUTH_URL = 'http://localhost:3000'
Write-Output ("STEP2 NEXTAUTH_URL present: {0} length: {1}" -f [bool]$env:NEXTAUTH_URL, $env:NEXTAUTH_URL.Length)
Write-Output ("STEP2 NEXTAUTH_SECRET present: {0} length: {1}" -f [bool]$env:NEXTAUTH_SECRET, $env:NEXTAUTH_SECRET.Length)

powershell -ExecutionPolicy Bypass -File scripts\start-prod.ps1 -BaseUrl 'http://localhost:3000'

$ns = cmd /c "netstat -ano | findstr :3000"
Write-Output ("STEP2 listening_after_start: {0}" -f [bool]($LASTEXITCODE -eq 0 -and $ns))

try {
  $root = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 10
  Write-Output ("STEP2 GET_/ status: {0} succeeded: true" -f [int]$root.StatusCode)
} catch {
  $s = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode.value__ } else { 0 }
  Write-Output ("STEP2 GET_/ status: {0} succeeded: false" -f $s)
}
try {
  $sess = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth/session' -UseBasicParsing -TimeoutSec 10
  Write-Output ("STEP2 GET_/api/auth/session status: {0} succeeded: true" -f [int]$sess.StatusCode)
} catch {
  $s = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode.value__ } else { 0 }
  Write-Output ("STEP2 GET_/api/auth/session status: {0} succeeded: false" -f $s)
}

# Step 3 auth gate
$cookiePath = if (Test-Path '.cookie.header.txt') { '.cookie.header.txt' } elseif (Test-Path '.cookie.txt') { '.cookie.txt' } else { $null }
if (-not $cookiePath) {
  Write-Output 'STEP3 cookie_file_present: false'
  exit 10
}
$cookieRaw = Get-Content -Raw -LiteralPath $cookiePath
$cookieFirst = ($cookieRaw.Trim() -split "`r?`n")[0]
$cookieHeader = $cookieFirst -replace '^[Cc]ookie\s*:\s*', ''
Write-Output 'STEP3 cookie_file_present: true'
Write-Output ("STEP3 cookie_file_bytes: {0}" -f (Get-Item -LiteralPath $cookiePath).Length)
Write-Output ("STEP3 cookie_first_line_length: {0}" -f $cookieFirst.Length)

$sessionStatus = 0
$sessionBody = $null
try {
  $sessionResp = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth/session' -Headers @{ Cookie = $cookieHeader } -UseBasicParsing -TimeoutSec 20
  $sessionStatus = [int]$sessionResp.StatusCode
  $sessionBody = $sessionResp.Content
} catch {
  $sessionStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode.value__ } else { 0 }
}
$sessionShape = Get-SessionShape $sessionBody
Write-Output ("STEP3 auth_gate_status: {0}" -f $sessionStatus)
Write-Output ("STEP3 auth_gate_body_shape: {0}" -f $sessionShape)

if ($sessionStatus -ne 200 -or $sessionShape -eq 'exactly_{}' -or $sessionShape -eq 'request_failed') {
  Write-Output 'AUTH_GATE result: FAIL'
  exit 11
}
Write-Output 'AUTH_GATE result: PASS'

# Step 4
$seg60Count = 0
$seg90Count = 0
if (Test-Path 'tmp\audio\seg60') { $seg60Count = (Get-ChildItem -LiteralPath 'tmp\audio\seg60' -Filter 'seg_*.webm' -File | Measure-Object).Count }
if (Test-Path 'tmp\audio\seg90') { $seg90Count = (Get-ChildItem -LiteralPath 'tmp\audio\seg90' -Filter 'seg_*.webm' -File | Measure-Object).Count }
Write-Output ("STEP4 seg60_count: {0}" -f $seg60Count)
Write-Output ("STEP4 seg90_count: {0}" -f $seg90Count)
if ($seg60Count -eq 0 -or $seg90Count -eq 0) {
  Write-Output 'SEGMENTS_MISSING true'
  exit 12
}

# Step 5
powershell -ExecutionPolicy Bypass -File scripts\test-ai-note.ps1 -SegmentsDir tmp\audio\seg60 -OutputPath output\note_60min_prod.md -Mode production -BuildMsPath tmp\build.ms -ServerMsPath tmp\server.ms -SummaryPath tmp\summary.jsonl -Label test60
$code60 = $LASTEXITCODE
Write-Output ("STEP5 test60_exit_code: {0}" -f $code60)

powershell -ExecutionPolicy Bypass -File scripts\test-ai-note.ps1 -SegmentsDir tmp\audio\seg90 -OutputPath output\note_90min_prod.md -Mode production -BuildMsPath tmp\build.ms -ServerMsPath tmp\server.ms -SummaryPath tmp\summary.jsonl -Label test90
$code90 = $LASTEXITCODE
Write-Output ("STEP5 test90_exit_code: {0}" -f $code90)

# Step 6
$out60 = Test-Path 'output\note_60min_prod.md'
$out90 = Test-Path 'output\note_90min_prod.md'
$pass60 = $out60 -and ($code60 -eq 0)
$pass90 = $out90 -and ($code90 -eq 0)
Write-Output ("PROD TEST: 60 {0} (output exists: {1})" -f $(if($pass60){'PASS'}else{'FAIL'}), $out60.ToString().ToLower())
Write-Output ("PROD TEST: 90 {0} (output exists: {1})" -f $(if($pass90){'PASS'}else{'FAIL'}), $out90.ToString().ToLower())

if (-not $pass60 -or -not $pass90) {
  $statusLine = 'unknown'
  if (Test-Path 'tmp\summary.jsonl') {
    $lines = Get-Content 'tmp\summary.jsonl' | Where-Object { $_ -and $_.Trim().StartsWith('{') }
    $objs = @()
    foreach ($ln in $lines) {
      try { $objs += ($ln | ConvertFrom-Json) } catch {}
    }
    $targets = $objs | Where-Object { $_.label -in @('test60','test90') }
    if ($targets) {
      $codes = @()
      foreach ($t in $targets) {
        if ($t.httpStatusCounts) { $codes += $t.httpStatusCounts.PSObject.Properties.Name }
      }
      if ($codes.Count -gt 0) { $statusLine = ($codes | Sort-Object -Unique) -join ',' }
    }
  }
  Write-Output ("FAIL_HTTP_STATUS_CODES: {0}" -f $statusLine)
}

exit 0
