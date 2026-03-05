$raw = (Get-Content ".cookie.header.txt" -Raw).Trim()
if ($raw.ToLower().StartsWith("cookie:")) { $raw = $raw.Substring(7).Trim() }

$ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
($raw -split ";\s*" | Where-Object { $_ -match "=" }) | ForEach-Object {
  $kv = $_ -split "=", 2
  $ws.Cookies.Add((New-Object System.Net.Cookie($kv[0].Trim(), $kv[1], "/", "localhost")))
}

"== session =="
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000/api/auth/session" -WebSession $ws -TimeoutSec 20 |
  Select-Object StatusCode, Content

"== ai-note/start =="
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000/api/ai-note/start" -Method POST -ContentType "application/json" -Body "{}" -WebSession $ws -TimeoutSec 20 |
  Select-Object StatusCode, Content
