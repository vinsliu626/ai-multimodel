$ErrorActionPreference='Stop'
. scripts/_cookie-session.ps1
$ws = New-LocalhostWebSessionFromCookieFile -CookieFile '.cookie.header.txt' -BaseUrl 'http://localhost:3000'
$note = (Invoke-WebRequest -Method POST -Uri 'http://localhost:3000/api/ai-note/start' -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
$bytes = [System.IO.File]::ReadAllBytes('tmp/audio/seg60/seg_000.webm')
$b64 = [Convert]::ToBase64String($bytes)
$body = @{noteId=$note.noteId;chunkIndex=0;mime='audio/webm';encoding='base64';data=$b64} | ConvertTo-Json -Depth 4
try {
  $r = Invoke-WebRequest -Method POST -Uri 'http://localhost:3000/api/ai-note/chunk' -WebSession $ws -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 120
  'STATUS=' + $r.StatusCode
  $r.Content
} catch {
  $resp = $_.Exception.Response
  if ($resp) {
    $code = [int]$resp.StatusCode.value__
    'STATUS=' + $code
    $sr = New-Object IO.StreamReader($resp.GetResponseStream())
    $sr.ReadToEnd()
  } else {
    'ERR=' + $_.Exception.Message
  }
}
