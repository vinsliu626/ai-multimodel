param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$CookieFile = ".cookie.header.txt",
  [string]$SegmentsDir60 = "tmp/audio/seg60",
  [string]$SegmentsDir90 = "tmp/audio/seg90",
  [string]$Output60 = "output/note_60min_prod.md",
  [string]$Output90 = "output/note_90min_prod.md",
  [string]$ReportPath = "output/test_report.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/_cookie-session.ps1"

function Ensure-Directory([string]$Path) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

function Get-NowIso {
  return (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff zzz")
}

function To-Ms([TimeSpan]$ts) {
  return [int][Math]::Round($ts.TotalMilliseconds)
}

function Get-ListenPid3000 {
  $lines = cmd /c "netstat -aon | findstr :3000 | findstr LISTENING"
  if (-not $lines) { return $null }
  $first = $lines | Select-Object -First 1
  if ($first -match "\s+(\d+)\s*$") { return [int]$Matches[1] }
  return $null
}

function Load-DotEnvIfPresent {
  $files = @(".env.local", ".env")
  foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { continue }
    Get-Content -LiteralPath $f | ForEach-Object {
      $line = $_.Trim()
      if (-not $line -or $line.StartsWith("#")) { return }
      $parts = $line -split "=", 2
      if ($parts.Count -lt 2) { return }
      $k = $parts[0].Trim()
      $v = $parts[1].Trim()
      if ($v.StartsWith('"') -and $v.EndsWith('"') -and $v.Length -ge 2) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v.StartsWith("'") -and $v.EndsWith("'") -and $v.Length -ge 2) { $v = $v.Substring(1, $v.Length - 2) }
      if ($k) { [Environment]::SetEnvironmentVariable($k, $v, "Process") }
    }
  }
}

function Ensure-ProdServer {
  $listenPid = Get-ListenPid3000
  if ($listenPid) {
    Write-Host ("Port 3000 listening pid={0}" -f $listenPid)
    return
  }

  Write-Host "Port 3000 not listening. Building and starting production server."
  $buildSw = [Diagnostics.Stopwatch]::StartNew()
  npm run build | Out-Host
  $buildSw.Stop()
  Write-Host ("build done ms={0}" -f $buildSw.ElapsedMilliseconds)

  Load-DotEnvIfPresent
  if (-not $env:NEXTAUTH_URL) { $env:NEXTAUTH_URL = $BaseUrl }
  if (-not $env:NEXTAUTH_SECRET) { throw "NEXTAUTH_SECRET missing from env/.env files" }

  & "$PSScriptRoot/start-prod.ps1" -BaseUrl $BaseUrl | Out-Host

  $waitStart = Get-Date
  while (((Get-Date) - $waitStart).TotalSeconds -lt 60) {
    $listenPid = Get-ListenPid3000
    if ($listenPid) {
      Write-Host ("Port 3000 now listening pid={0}" -f $listenPid)
      return
    }
    Start-Sleep -Milliseconds 500
  }

  throw "Port 3000 is still not listening after startup."
}

function Get-ResponseErrorBody($err) {
  if (-not $err.Exception -or -not $err.Exception.Response) { return $null }
  try {
    $sr = New-Object System.IO.StreamReader($err.Exception.Response.GetResponseStream())
    return $sr.ReadToEnd()
  } catch {
    return $null
  }
}

function Invoke-SessionAndStartPrecheck([string]$BaseUrl, $WebSession) {
  $result = [ordered]@{
    sessionStatus = $null
    startStatus = $null
    startApiMs = $null
    startBody = $null
    ok = $false
    error = $null
  }

  try {
    $s = Invoke-WebRequest -Method GET -Uri "$BaseUrl/api/auth/session" -WebSession $WebSession -UseBasicParsing -TimeoutSec 30
    $result.sessionStatus = [int]$s.StatusCode
  } catch {
    $result.error = $_.Exception.Message
    $result.startBody = Get-ResponseErrorBody $_
    return [pscustomobject]$result
  }

  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Method POST -Uri "$BaseUrl/api/ai-note/start" -WebSession $WebSession -ContentType "application/json" -Body "{}" -UseBasicParsing -TimeoutSec 30
    $sw.Stop()
    $result.startApiMs = [int]$sw.ElapsedMilliseconds
    $result.startStatus = [int]$resp.StatusCode
    $result.startBody = $resp.Content
    $result.ok = ($result.sessionStatus -eq 200 -and $result.startStatus -ge 200 -and $result.startStatus -lt 300)
    return [pscustomobject]$result
  } catch {
    $sw.Stop()
    $result.startApiMs = [int]$sw.ElapsedMilliseconds
    if ($_.Exception.Response) {
      try { $result.startStatus = [int]$_.Exception.Response.StatusCode.value__ } catch {}
    }
    $result.error = $_.Exception.Message
    $result.startBody = Get-ResponseErrorBody $_
    return [pscustomobject]$result
  }
}

function Get-LatestServerLogs {
  $logPath = "tmp/prod.log"
  $errPath = "tmp/prod.err.log"
  $buf = @()
  if (Test-Path -LiteralPath $logPath) {
    $buf += "## tmp/prod.log (last 200 lines)"
    $buf += '```'
    $buf += (Get-Content -LiteralPath $logPath -Tail 200)
    $buf += '```'
  }
  if (Test-Path -LiteralPath $errPath) {
    $buf += ""
    $buf += "## tmp/prod.err.log (last 200 lines)"
    $buf += '```'
    $buf += (Get-Content -LiteralPath $errPath -Tail 200)
    $buf += '```'
  }
  return ($buf -join [Environment]::NewLine)
}

function Get-EnvPresence {
  $keys = @(
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "DATABASE_URL",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
    "HF_TOKEN",
    "AI_NOTE_ASR_MODEL",
    "AI_NOTE_MAX_CHUNK_BYTES"
  )
  $lines = @()
  foreach ($k in $keys) {
    $present = [bool][Environment]::GetEnvironmentVariable($k, "Process")
    $lines += ("- {0}: {1}" -f $k, ($(if ($present) { "present" } else { "missing" })))
  }
  return ($lines -join [Environment]::NewLine)
}

function Invoke-NoteCase {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][string]$SegmentsDir,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][string]$CookieFile
  )

  Ensure-Directory $OutputPath
  $ws = New-LocalhostWebSessionFromCookieFile -CookieFile $CookieFile -BaseUrl $BaseUrl
  $pre = Invoke-SessionAndStartPrecheck -BaseUrl $BaseUrl -WebSession $ws

  if (-not $pre.ok) {
    return [pscustomobject]@{
      name = $Name
      startedAt = Get-NowIso
      endedAt = Get-NowIso
      totalMs = 0
      startApiMs = $pre.startApiMs
      uploadMs = $null
      finalizeMs = $null
      status = "failed"
      sessionStatus = $pre.sessionStatus
      startStatus = $pre.startStatus
      noteId = $null
      outputPath = $OutputPath
      responseBody = $pre.startBody
      error = if ($pre.error) { $pre.error } else { "Precheck failed" }
      retried = $false
      serverEvidence = ""
      envPresence = ""
      statusCounts = @{}
    }
  }

  $attempt = 0
  $last = $null
  $retried = $false
  while ($attempt -lt 2) {
    $attempt++
    if ($attempt -gt 1) { $retried = $true }
    $startedIso = Get-NowIso
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $lines = @()
    $resultObj = $null
    $scriptFailed = $false
    $errorMsg = $null
    $tmpLog = Join-Path "tmp" ("run-note-{0}-{1}.log" -f $Name, $attempt)
    try {
      $lines = & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/test-ai-note.ps1" `
        -BaseUrl $BaseUrl `
        -CookieFile $CookieFile `
        -SegmentsDir $SegmentsDir `
        -OutputPath $OutputPath `
        -Mode "prod" `
        -Label $Name 2>&1 | Tee-Object -FilePath $tmpLog
    } catch {
      $scriptFailed = $true
      $errorMsg = $_.Exception.Message
    }
    $sw.Stop()
    $endedIso = Get-NowIso

    if (Test-Path -LiteralPath $tmpLog) {
      $lines = Get-Content -LiteralPath $tmpLog -ErrorAction SilentlyContinue
    }

    $joinedAll = if ($lines) { $lines -join "`n" } else { "" }
    $jsonLine = $null
    $revLines = @($lines)
    [array]::Reverse($revLines)
    foreach ($ln in $revLines) {
      $txt = "$ln".Trim()
      if ($txt.StartsWith("{") -and $txt.EndsWith("}")) { $jsonLine = $txt; break }
    }
    if ($jsonLine) {
      try { $resultObj = $jsonLine | ConvertFrom-Json -ErrorAction Stop } catch {}
    }
    if (-not $resultObj -and $joinedAll) {
      $m = [regex]::Match($joinedAll, '(?s)\{\s*"mode"\s*:[\s\S]*\}\s*$')
      if ($m.Success) {
        try { $resultObj = $m.Value | ConvertFrom-Json -ErrorAction Stop } catch {}
      }
    }

    $fallbackNoteId = $null
    if ($joinedAll -match "noteId:\s*([0-9a-fA-F-]{36})") {
      $fallbackNoteId = $Matches[1]
    }

    $responseBody = $null
    if ($resultObj -and $resultObj.finalizeLastError -and $resultObj.finalizeLastError.body) {
      $responseBody = [string]$resultObj.finalizeLastError.body
    } elseif ($lines) {
      if ($joinedAll -match "body=(.+)") { $responseBody = $Matches[1] }
      if (-not $responseBody -and $joinedAll -match "finalize response body:\s*(.+)") { $responseBody = $Matches[1] }
    }

    $statusCounts = @{}
    if ($resultObj -and $resultObj.httpStatusCounts) {
      $props = $resultObj.httpStatusCounts.PSObject.Properties
      foreach ($p in $props) { $statusCounts[$p.Name] = [int]$p.Value }
    }
    $has500 = $statusCounts.ContainsKey("500") -and $statusCounts["500"] -gt 0
    $timeoutLike = $false
    if ($errorMsg -and $errorMsg -match "(?i)timed out|timeout") { $timeoutLike = $true }
    if (-not $timeoutLike -and $lines) {
      if ($joinedAll -match "(?i)timed out|timeout") { $timeoutLike = $true }
    }

    $ok = $false
    if ($resultObj -and $resultObj.noteId -and (Test-Path -LiteralPath $OutputPath)) { $ok = $true }
    if (-not $scriptFailed -and -not $resultObj -and (Test-Path -LiteralPath $OutputPath)) { $ok = $true }

    $last = [pscustomobject]@{
      name = $Name
      startedAt = $startedIso
      endedAt = $endedIso
      totalMs = [int]$sw.ElapsedMilliseconds
      startApiMs = $pre.startApiMs
      uploadMs = if ($resultObj) { [int]$resultObj.uploadMs } else { $null }
      finalizeMs = if ($resultObj) { [int]$resultObj.finalizeMs } else { $null }
      status = if ($ok) { "passed" } else { "failed" }
      sessionStatus = $pre.sessionStatus
      startStatus = $pre.startStatus
      noteId = if ($resultObj) { [string]$resultObj.noteId } elseif ($fallbackNoteId) { $fallbackNoteId } else { $null }
      outputPath = $OutputPath
      responseBody = $responseBody
      error = if ($errorMsg) { $errorMsg } elseif ($resultObj -and $resultObj.finalizeLastError -and $resultObj.finalizeLastError.error) { [string]$resultObj.finalizeLastError.error } else { $null }
      retried = $retried
      serverEvidence = ""
      envPresence = ""
      statusCounts = $statusCounts
    }

    if ($ok) { break }
    if (-not ($has500 -or $timeoutLike) -or $attempt -ge 2) { break }
    Start-Sleep -Seconds 2
  }

  if ($last.status -ne "passed") {
    $last.serverEvidence = Get-LatestServerLogs
    $last.envPresence = Get-EnvPresence
  }

  return $last
}

Ensure-Directory $ReportPath
Ensure-ProdServer

$allStart = Get-Date
$case60 = Invoke-NoteCase -Name "60min" -SegmentsDir $SegmentsDir60 -OutputPath $Output60 -BaseUrl $BaseUrl -CookieFile $CookieFile
$case90 = Invoke-NoteCase -Name "90min" -SegmentsDir $SegmentsDir90 -OutputPath $Output90 -BaseUrl $BaseUrl -CookieFile $CookieFile
$allEnd = Get-Date
$allMs = To-Ms ($allEnd - $allStart)

$rows = @($case60, $case90)

$report = @()
$report += "# AI Note E2E Test Report"
$report += ""
$report += ("Generated: {0}" -f (Get-NowIso))
$report += ("BaseUrl: {0}" -f $BaseUrl)
$report += ""
$report += "## Summary"
$report += ""
$report += "| Case | Status | Start Time | End Time | Total (ms) | Start API (ms) | Upload/Process (ms) | Finalize/Save (ms) | Session Status | Start Status | NoteId | Output | Retries |"
$report += "|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|"
foreach ($r in $rows) {
  $report += ("| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} | {8} | {9} | {10} | {11} | {12} |" -f `
    $r.name, $r.status, $r.startedAt, $r.endedAt, $r.totalMs, `
    ($(if ($null -ne $r.startApiMs) { $r.startApiMs } else { "" })), `
    ($(if ($null -ne $r.uploadMs) { $r.uploadMs } else { "" })), `
    ($(if ($null -ne $r.finalizeMs) { $r.finalizeMs } else { "" })), `
    ($(if ($null -ne $r.sessionStatus) { $r.sessionStatus } else { "" })), `
    ($(if ($null -ne $r.startStatus) { $r.startStatus } else { "" })), `
    $r.noteId, $r.outputPath, ($(if ($r.retried) { "1" } else { "0" })))
}
$report += ""
$report += ("Total suite elapsed (ms): {0}" -f $allMs)
$report += ""

foreach ($r in $rows) {
  $report += ("## {0} Details" -f $r.name)
  if ($r.status -eq "passed") {
    $report += "- No errors."
  } else {
    $report += ("- Error: {0}" -f $r.error)
    $report += ("- Response body: {0}" -f $(if ($r.responseBody) { $r.responseBody } else { "(none)" }))
    $report += "- Env presence (secret values hidden):"
    $report += $r.envPresence
    if ($r.serverEvidence) {
      $report += ""
      $report += "### Server Evidence"
      $report += $r.serverEvidence
    }
    $report += ""
    $report += "### Fix Suggestions"
    $report += '- Verify `NEXTAUTH_URL` matches test host and refresh `.cookie.header.txt` from the same host login.'
    $report += '- Check AI provider/ASR env vars are present and valid, then rerun this script.'
    $report += '- Inspect `tmp/prod.log` and `tmp/prod.err.log` for stack traces around failing timestamps.'
  }
  $report += ""
}

Set-Content -LiteralPath $ReportPath -Value ($report -join [Environment]::NewLine) -Encoding UTF8

Write-Host ("[60min] status={0} totalMs={1} noteId={2}" -f $case60.status, $case60.totalMs, $case60.noteId)
Write-Host ("[90min] status={0} totalMs={1} noteId={2}" -f $case90.status, $case90.totalMs, $case90.noteId)
Write-Host ("report={0}" -f $ReportPath)
