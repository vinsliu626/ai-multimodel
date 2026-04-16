param(
  [string]$BaseUrl = "http://127.0.0.1:3010",
  [string]$SegmentsDir = "tmp/audio/seg120",
  [int]$TotalDurationMs = 7200000,
  [int]$MaxAttempts = 120,
  [int]$SleepMs = 1200,
  [string]$SummaryPath = "tmp/raw-2h-summary.json"
)

$ErrorActionPreference = "Stop"

$segments = Get-ChildItem -LiteralPath $SegmentsDir -Filter "seg_*.webm" -File | Sort-Object Name
if (-not $segments -or $segments.Count -eq 0) {
  throw "No segments found in $SegmentsDir"
}

$summary = [ordered]@{
  kind = "raw-2h"
  startedAt = (Get-Date).ToString("o")
  baseUrl = $BaseUrl
  segmentsDir = $SegmentsDir
  chunks = $segments.Count
  totalDurationMs = $TotalDurationMs
  uploaded = @()
  finalize = @()
  statusPolls = @()
}

Write-Host "Creating note session..."
$startResp = Invoke-WebRequest -Uri "$BaseUrl/api/ai-note/start" -Method POST -UseBasicParsing -ContentType "application/json" -Body "{}" -TimeoutSec 30
$startObj = $startResp.Content | ConvertFrom-Json
if (-not $startObj.ok -or -not $startObj.noteId) {
  throw "Failed to create note session: $($startResp.Content)"
}
$noteId = [string]$startObj.noteId
$summary.noteId = $noteId
Write-Host ("noteId={0}" -f $noteId)

for ($i = 0; $i -lt $segments.Count; $i++) {
  $seg = $segments[$i]
  $bytes = [System.IO.File]::ReadAllBytes($seg.FullName)
  $payload = @{
    noteId = $noteId
    chunkIndex = $i
    mime = "audio/webm"
    encoding = "base64"
    data = [Convert]::ToBase64String($bytes)
  }
  $body = $payload | ConvertTo-Json -Depth 4
  $t0 = Get-Date
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/ai-note/chunk" -Method POST -UseBasicParsing -ContentType "application/json" -Body $body -TimeoutSec 120
  $ms = [int]((Get-Date) - $t0).TotalMilliseconds
  $obj = $resp.Content | ConvertFrom-Json
  $summary.uploaded += [pscustomobject]@{
    chunkIndex = $i
    ok = [bool]$obj.ok
    chunksNow = $obj.chunksNow
    bytes = $bytes.Length
    ms = $ms
  }
  Write-Host ("upload {0}/{1} ok={2} ms={3}" -f ($i + 1), $segments.Count, $obj.ok, $ms)
}

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  $finalBody = @{ noteId = $noteId; totalDurationMs = $TotalDurationMs } | ConvertTo-Json
  $finalResp = Invoke-WebRequest -Uri "$BaseUrl/api/ai-note/finalize" -Method POST -UseBasicParsing -ContentType "application/json" -Body $finalBody -TimeoutSec 300
  $finalObj = $finalResp.Content | ConvertFrom-Json

  $summary.finalize += [pscustomobject]@{
    attempt = $attempt
    stage = [string]$finalObj.stage
    progress = [int]$finalObj.progress
    completedSegments = $finalObj.completedSegments
    segmentsTotal = $finalObj.segmentsTotal
    completedParts = $finalObj.completedParts
    llmPartsTotal = $finalObj.llmPartsTotal
    partialNoteLength = ([string]$finalObj.partialNote).Length
    secondsBilled = $finalObj.secondsBilled
  }
  Write-Host ("finalize attempt={0} stage={1} progress={2} partial={3}" -f $attempt, $finalObj.stage, $finalObj.progress, ([string]$finalObj.partialNote).Length)

  $statusBody = @{ noteId = $noteId } | ConvertTo-Json
  $statusResp = Invoke-WebRequest -Uri "$BaseUrl/api/ai-note/status" -Method POST -UseBasicParsing -ContentType "application/json" -Body $statusBody -TimeoutSec 60
  $statusObj = $statusResp.Content | ConvertFrom-Json
  $summary.statusPolls += [pscustomobject]@{
    attempt = $attempt
    stage = [string]$statusObj.job.stage
    progress = [int]$statusObj.job.progress
    asrNextIndex = $statusObj.job.asrNextIndex
    segmentsTotal = $statusObj.job.segmentsTotal
    llmNextPart = $statusObj.job.llmNextPart
    llmPartsTotal = $statusObj.job.llmPartsTotal
    partialNoteLength = ([string]$statusObj.partialNote).Length
    secondsBilled = $statusObj.job.secondsBilled
  }
  Write-Host ("status attempt={0} stage={1} asr={2}/{3} llm={4}/{5} partial={6}" -f $attempt, $statusObj.job.stage, $statusObj.job.asrNextIndex, $statusObj.job.segmentsTotal, $statusObj.job.llmNextPart, $statusObj.job.llmPartsTotal, ([string]$statusObj.partialNote).Length)

  if ([string]$finalObj.stage -eq "done") {
    $summary.finalNoteLength = ([string]$finalObj.note).Length
    break
  }

  Start-Sleep -Milliseconds $SleepMs
}

$summary.endedAt = (Get-Date).ToString("o")
$json = $summary | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $SummaryPath -Value $json -Encoding UTF8
Write-Output $json
