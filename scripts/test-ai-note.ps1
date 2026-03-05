param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$CookieFile = ".cookie.header.txt",
  [string]$CookiePath = "",
  [string]$CookieHeaderPath = "",
  [string]$SegmentsDir,
  [string]$OutputPath,
  [string]$Lang = "en",
  [string]$Mode = "dev",
  [string]$BuildMsPath = "tmp\\build.ms",
  [string]$ServerMsPath = "tmp\\server.ms",
  [string]$SummaryPath = "",
  [string]$Label = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

<#
Dev bypass usage (local only, production disabled in code):
  $env:AI_NOTE_DEV_BYPASS_AUTH="true"
  $env:AI_NOTE_DEV_USER_ID="dev-user"
  npm run dev
  powershell -ExecutionPolicy Bypass -File scripts/test-ai-note.ps1 -SegmentsDir tmp/audio/seg60 -OutputPath output/note_60min.md
#>

function Get-CookieHeader([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = (Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $line) { return $null }
  return $line.Trim()
}

function Invoke-WithRetry {
  param(
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$false)][string]$Body,
    [Parameter(Mandatory=$false)][string]$ContentType,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    [Parameter(Mandatory=$false)]$WebSession = $null,
    [int]$TimeoutSec = 180,
    [int]$MaxRetries = 4,
    [int]$BaseDelayMs = 1000
  )

  $attempt = 0
  while ($true) {
    $attempt++
    try {
      if ($ContentType) {
        $resp = Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers -WebSession $WebSession -Body $Body -ContentType $ContentType -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
      } else {
        $resp = Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers -WebSession $WebSession -Body $Body -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
      }
      return @{ Ok=$true; Status=$resp.StatusCode; Content=$resp.Content }
    } catch {
      $status = $null
      $content = $null
      $resp = $null
      if ($_.Exception) {
        $prop = $_.Exception.PSObject.Properties.Match("Response")
        if ($prop -and $prop.Count -gt 0) { $resp = $_.Exception.Response }
      }
      if ($resp) {
        try {
          $status = [int]$resp.StatusCode.value__
        } catch { $status = $null }
        try {
          $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
          $content = $sr.ReadToEnd()
        } catch { $content = $null }
      }

      $retryable = $false
      if ($status -in 429,502,503,504) { $retryable = $true }

      # 202 LOCKED is also retryable for finalize
      if ($status -eq 202) { $retryable = $true }

      if (-not $retryable -or $attempt -ge $MaxRetries) {
        return @{ Ok=$false; Status=$status; Content=$content; Error=$_.Exception.Message }
      }

      $delay = [Math]::Min(30000, $BaseDelayMs * [Math]::Pow(2, $attempt - 1))
      # honor retryAfterMs if provided
      if ($content) {
        try {
          $obj = $content | ConvertFrom-Json -ErrorAction Stop
          if ($obj.retryAfterMs) { $delay = [int]$obj.retryAfterMs }
          if ($obj.extra -and $obj.extra.retryAfterMs) { $delay = [int]$obj.extra.retryAfterMs }
        } catch {}
      }
      Start-Sleep -Milliseconds $delay
    }
  }
}

if (-not $SegmentsDir) { throw "SegmentsDir is required" }
if (-not $OutputPath) { throw "OutputPath is required" }

$cookieHeader = $null
$cookiePathResolved = if ($CookiePath) { $CookiePath } else { $CookieFile }
$cookieCandidate = @()
if ($CookieHeaderPath) { $cookieCandidate += $CookieHeaderPath }
if ($cookiePathResolved) { $cookieCandidate += $cookiePathResolved }
$cookieCandidate = $cookieCandidate | Where-Object { $_ } | Select-Object -Unique

$cookiePathUsed = $null
foreach ($p in $cookieCandidate) {
  if (Test-Path -LiteralPath $p) {
    $cookiePathUsed = $p
    break
  }
}
$cookieHeader = if ($cookiePathUsed) { Get-CookieHeader $cookiePathUsed } else { $null }

$headers = @{}
$webSession = $null
if ($cookiePathUsed) {
  . "$PSScriptRoot/_cookie-session.ps1"
  $webSession = New-LocalhostWebSessionFromCookieFile -CookieFile $cookiePathUsed -BaseUrl $BaseUrl
}

$bypassEnabled = (($env:AI_NOTE_DEV_BYPASS_AUTH -eq "true") -and ($env:NODE_ENV -ne "production"))

Write-Host "Using BaseUrl: $BaseUrl"
Write-Host "SegmentsDir: $SegmentsDir"
Write-Host "OutputPath: $OutputPath"
Write-Host ("Cookie file present: " + ($(if ($cookieHeader) { "true" } else { "false" })) )
Write-Host ("Bypass enabled: " + ($(if ($bypassEnabled) { "true" } else { "false" })) )
Write-Host ("Mode: " + $Mode)

# Auth check (cheap) - session endpoint first
$sessionResp = Invoke-WithRetry -Method GET -Url "$BaseUrl/api/auth/session" -Headers $headers -WebSession $webSession -TimeoutSec 30
Write-Host ("AUTH SESSION status: " + $sessionResp.Status)
if ($sessionResp.Ok -and $sessionResp.Content) {
  try {
    $sessObj = $sessionResp.Content | ConvertFrom-Json -ErrorAction Stop
    $hasUser = $false
    $hasEmail = $false
    $hasId = $false
    if ($sessObj -and $sessObj.user) {
      $hasUser = $true
      if ($sessObj.user.email) { $hasEmail = $true }
      if ($sessObj.user.id) { $hasId = $true }
    }
    Write-Host ("AUTH SESSION hasUser=" + $hasUser + " hasEmail=" + $hasEmail + " hasId=" + $hasId)
  } catch {}
}
if ($sessionResp.Status -eq 401 -or $sessionResp.Status -eq 403) {
  $pathUsed = if ($cookiePathUsed) { $cookiePathUsed } else { if ($CookiePath) { $CookiePath } else { $CookieFile } }
  $size = 0
  $lineLen = 0
  if (Test-Path -LiteralPath $pathUsed) {
    $size = (Get-Item -LiteralPath $pathUsed).Length
    $line = (Get-Content -LiteralPath $pathUsed -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($line) { $lineLen = $line.Length }
  }
  Write-Host ("BaseUrl: " + $BaseUrl)
  Write-Host ("Cookie file present: " + ($(if (Test-Path -LiteralPath $pathUsed) { "true" } else { "false" })) + "; bytes=" + $size + "; firstLineLength=" + $lineLen)
  Write-Host ("AUTH_REQUIRED in production: refresh .cookie.txt by logging in to " + $BaseUrl + " and re-export cookie.")
  exit 1
}

# Auth check (start) - stop early on 401/403
$authBody = @{} | ConvertTo-Json
$authResp = Invoke-WithRetry -Method POST -Url "$BaseUrl/api/ai-note/start" -Headers $headers -WebSession $webSession -Body $authBody -ContentType "application/json" -TimeoutSec 30
if (-not $authResp.Ok -and ($authResp.Status -eq 401 -or $authResp.Status -eq 403)) {
  Write-Host ("AUTH_REQUIRED in production: refresh .cookie.txt by logging in to " + $BaseUrl + " and re-export cookie.")
  exit 1
}

# 1) create note
$noteId = $null
$startLast = $null
$startUrls = @("$BaseUrl/api/ai-note/start", "$BaseUrl/api/ai-note")
foreach ($u in $startUrls) {
  $r = Invoke-WithRetry -Method POST -Url $u -Headers $headers -WebSession $webSession -TimeoutSec 60
  $startLast = $r
  if ($r.Ok -and $r.Status -ge 200 -and $r.Status -lt 300) {
    try {
      $obj = $r.Content | ConvertFrom-Json -ErrorAction Stop
      if ($obj.ok -and $obj.noteId) { $noteId = $obj.noteId; break }
    } catch {}
  }
}

if (-not $noteId) {
  $msg = "Failed to create note. Check auth/session."
  if ($startLast) {
    $msg += " status=$($startLast.Status)"
    if ($startLast.Content) { $msg += " body=$($startLast.Content)" }
    if ($startLast.Error) { $msg += " error=$($startLast.Error)" }
  }
  throw $msg
}
Write-Host "noteId: $noteId"

# 2) gather segments
$segments = Get-ChildItem -LiteralPath $SegmentsDir -Filter "seg_*.webm" -File | Sort-Object Name | Where-Object { $_.Length -gt 1024 }
if (-not $segments -or $segments.Count -eq 0) { throw "No segments found in $SegmentsDir" }

$chunkResults = @()
$failCount = 0
$testStart = Get-Date
$uploadStart = Get-Date
$httpStats = @{}

for ($i=0; $i -lt $segments.Count; $i++) {
  $seg = $segments[$i]
  $bytes = [System.IO.File]::ReadAllBytes($seg.FullName)
  $b64 = [Convert]::ToBase64String($bytes)
  $bodyObj = @{
    noteId = $noteId
    chunkIndex = $i
    mime = "audio/webm"
    encoding = "base64"
    data = $b64
  }
  $bodyJson = $bodyObj | ConvertTo-Json -Depth 4

  $t0 = Get-Date
  $r = Invoke-WithRetry -Method POST -Url "$BaseUrl/api/ai-note/chunk" -Headers $headers -WebSession $webSession -Body $bodyJson -ContentType "application/json" -TimeoutSec 120
  $t1 = Get-Date
  $ms = [int]([TimeSpan]($t1 - $t0)).TotalMilliseconds

  $ok = $false
  $status = $r.Status
  $err = $null

  if ($r.Ok -and $r.Status -ge 200 -and $r.Status -lt 300) {
    try {
      $obj = $r.Content | ConvertFrom-Json -ErrorAction Stop
      if ($obj.ok) { $ok = $true }
      else { $err = $obj.error }
    } catch { $err = "BAD_JSON" }
  } else {
    $err = $r.Error
  }

  if (-not $ok) { $failCount++ }
  if ($status) {
    if (-not $httpStats.ContainsKey($status)) { $httpStats[$status] = 0 }
    $httpStats[$status]++
  }

  $chunkResults += [pscustomobject]@{
    chunkIndex = $i
    file = $seg.Name
    bytes = $seg.Length
    ms = $ms
    ok = $ok
    status = $status
    error = $err
  }

  Write-Host ("upload chunk {0}/{1} ok={2} ms={3} status={4}" -f ($i+1), $segments.Count, $ok, $ms, $status)
}

$uploadEnd = Get-Date

# 3) finalize/poll
$finalStart = Get-Date
$stage = $null
$finalNote = $null
$finalizeAttempts = 0
$finalizeFailures = 0
$finalizeLastError = $null

while ($true) {
  $finalizeAttempts++
  $bodyJson = @{ noteId = $noteId } | ConvertTo-Json
  $r = Invoke-WithRetry -Method POST -Url "$BaseUrl/api/ai-note/finalize" -Headers $headers -WebSession $webSession -Body $bodyJson -ContentType "application/json" -TimeoutSec 180

  if (-not $r.Ok) {
    $finalizeFailures++
    $finalizeLastError = @{ status=$r.Status; error=$r.Error; body=$r.Content }
    Write-Host "finalize request failed status=$($r.Status) error=$($r.Error)"
    if ($r.Content) { Write-Host ("finalize response body: " + $r.Content) }
    if ($r.Status) {
      if (-not $httpStats.ContainsKey($r.Status)) { $httpStats[$r.Status] = 0 }
      $httpStats[$r.Status]++
    }
    if ($finalizeFailures -ge 5) { throw "Finalize failed too many times" }
    Start-Sleep -Milliseconds 1500
    continue
  }

  $obj = $null
  try { $obj = $r.Content | ConvertFrom-Json -ErrorAction Stop } catch { $obj = $null }
  if (-not $obj) {
    $finalizeFailures++
    Write-Host "finalize bad json"
    Start-Sleep -Milliseconds 1500
    continue
  }

  if ($obj.ok -eq $false -and $obj.error) {
    # if locked, just wait
    if ($obj.error -eq "LOCKED") {
      Start-Sleep -Milliseconds 1500
      continue
    }
    throw "Finalize error: $($obj.error)"
  }

  $stage = $obj.stage
  Write-Host ("finalize stage={0} progress={1}" -f $stage, ($obj.progress | Out-String).Trim())

  if ($stage -eq "done") {
    $finalNote = $obj.note
    break
  }

  Start-Sleep -Milliseconds 1500
}

$finalEnd = Get-Date

if (-not $finalNote) { throw "No final note returned" }

# 4) write output
$dir = Split-Path -Parent $OutputPath
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
Set-Content -LiteralPath $OutputPath -Value $finalNote -Encoding UTF8

# 5) summary
$uploadMs = [int]([TimeSpan]($uploadEnd - $uploadStart)).TotalMilliseconds
$finalizeMs = [int]([TimeSpan]($finalEnd - $finalStart)).TotalMilliseconds
$totalMs = [int]([TimeSpan]($finalEnd - $uploadStart)).TotalMilliseconds
$testMs = [int]([TimeSpan]($finalEnd - $testStart)).TotalMilliseconds

$successCount = ($chunkResults | Where-Object { $_.ok }).Count
$httpStatsOut = @{}
foreach ($k in $httpStats.Keys) { $httpStatsOut["$k"] = $httpStats[$k] }

$buildMs = $null
if ($BuildMsPath -and (Test-Path $BuildMsPath)) {
  try { $buildMs = [int](Get-Content -Path $BuildMsPath -ErrorAction SilentlyContinue | Select-Object -First 1) } catch {}
}
$serverStartMs = $null
if ($ServerMsPath -and (Test-Path $ServerMsPath)) {
  try { $serverStartMs = [int](Get-Content -Path $ServerMsPath -ErrorAction SilentlyContinue | Select-Object -First 1) } catch {}
}

$summary = [pscustomobject]@{
  mode = $Mode
  label = $Label
  buildMs = $buildMs
  serverStartMs = $serverStartMs
  noteId = $noteId
  chunks = $segments.Count
  chunkSuccess = $successCount
  chunkFail = $failCount
  uploadMs = $uploadMs
  finalizeMs = $finalizeMs
  totalMs = $totalMs
  finalizeAttempts = $finalizeAttempts
  finalizeFailures = $finalizeFailures
  finalizeLastError = $finalizeLastError
  httpStatusCounts = $httpStatsOut
  testMs = $testMs
  output = $OutputPath
}

$json = $summary | ConvertTo-Json -Depth 6
Write-Output $json
if ($SummaryPath) {
  Add-Content -Path $SummaryPath -Value $json
}
