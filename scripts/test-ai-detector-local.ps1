param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$CookieFile = ".cookie.header.txt",
  [int]$ExpectedStatus = 200
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot/_cookie-session.ps1"

$ws = New-LocalhostWebSessionFromCookieFile -CookieFile $CookieFile -BaseUrl $BaseUrl
$url = "$BaseUrl/api/ai-detector"
$body = @{
  text = "This is a local detector test payload for development validation. It intentionally includes enough words to pass the minimum threshold. We are validating status handling in local development, including detector availability, timeout behavior, transient database outage behavior, and robust error mapping for service failures."
} | ConvertTo-Json

try {
  $resp = Invoke-WebRequest -Uri $url -Method POST -WebSession $ws -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
  $status = [int]$resp.StatusCode
  $content = $resp.Content
} catch {
  $status = 0
  $content = ""
  if ($_.Exception.Response) {
    try { $status = [int]$_.Exception.Response.StatusCode.value__ } catch {}
    try {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $content = $sr.ReadToEnd()
    } catch {}
  }
}

Write-Host ("status={0}" -f $status)
Write-Host ("body={0}" -f $content)

if ($status -ne $ExpectedStatus) {
  throw "Expected status $ExpectedStatus but got $status"
}
