$inPath = '.cookie.txt'
$outPath = '.cookie.header.txt'
if (-not (Test-Path $inPath)) {
  Write-Host 'detected format: missing'
  exit 1
}
$raw = Get-Content -LiteralPath $inPath -ErrorAction SilentlyContinue
$text = ($raw | Out-String)
$isNetscape = $false
if ($text.StartsWith('# Netscape')) { $isNetscape = $true }
if (-not $isNetscape) {
  foreach ($line in $raw) {
    if (-not $line) { continue }
    if ($line.Trim().StartsWith('#')) { continue }
    $parts = $line -split "`t"
    if ($parts.Length -ge 7) { $isNetscape = $true; break }
  }
}
if ($isNetscape) {
  $pairs = @()
  foreach ($line in $raw) {
    if (-not $line) { continue }
    if ($line.Trim().StartsWith('#')) { continue }
    $parts = $line -split "`t"
    if ($parts.Length -lt 7) { continue }
    $domain = $parts[0]
    $name = $parts[5]
    $value = $parts[6]
    if (-not $name) { continue }
    if ($domain) {
      $d = $domain.Trim().ToLower()
      if (-not ($d -like '*localhost*' -or $d -like '*127.0.0.1*')) { continue }
    }
    $pairs += ("$name=$value")
  }
  $header = ($pairs -join '; ').Trim()
  Set-Content -LiteralPath $outPath -Value $header -Encoding UTF8
  Write-Host 'detected format: netscape'
} else {
  $header = $text.Trim()
  if ($header.ToLower().StartsWith('cookie:')) {
    $header = $header.Substring(7).Trim()
  }
  Set-Content -LiteralPath $outPath -Value $header -Encoding UTF8
  Write-Host 'detected format: header'
}
$inSize = (Get-Item $inPath).Length
$outSize = (Get-Item $outPath).Length
Write-Host ("output file: $outPath")
Write-Host ("bytes in: $inSize; bytes out: $outSize")
