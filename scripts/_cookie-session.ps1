function New-LocalhostWebSessionFromCookieFile {
  param(
    [string]$CookieFile = ".cookie.header.txt",
    [string]$BaseUrl = "http://localhost:3000"
  )

  $hostName = ([Uri]$BaseUrl).Host

  $raw = (Get-Content -Raw $CookieFile).Trim()
  if ($raw.ToLower().StartsWith("cookie:")) { $raw = $raw.Substring(7).Trim() }
  $raw = $raw -replace "(`r`n|`n|`r)", " "

  $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  ($raw -split ";\s*" | Where-Object { $_ -match "=" }) | ForEach-Object {
    $kv = $_ -split "=", 2
    $name = $kv[0].Trim()
    $value = $kv[1]
    $ws.Cookies.Add((New-Object System.Net.Cookie($name, $value, "/", $hostName)))
  }

  return $ws
}
