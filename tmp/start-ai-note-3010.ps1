param(
  [string]$Port = "3010",
  [string]$UserId = "dev_user"
)

$ErrorActionPreference = "Stop"

function Load-EnvValue([string]$Key) {
  foreach ($file in @(".env.local", ".env")) {
    if (-not (Test-Path -LiteralPath $file)) { continue }
    $line = Get-Content -LiteralPath $file | Where-Object { $_ -match ("^\s*" + [regex]::Escape($Key) + "\s*=") } | Select-Object -First 1
    if (-not $line) { continue }
    $value = ($line -split "=", 2)[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

$baseUrl = "http://127.0.0.1:$Port"
$env:NEXTAUTH_SECRET = Load-EnvValue "NEXTAUTH_SECRET"
$env:NEXTAUTH_URL = $baseUrl
$env:DATABASE_URL = Load-EnvValue "DATABASE_URL"
$env:GROQ_API_KEY = Load-EnvValue "GROQ_API_KEY"
$env:OPENROUTER_API_KEY = Load-EnvValue "OPENROUTER_API_KEY"
$env:AI_NOTE_DEV_BYPASS_AUTH = "true"
$env:AI_NOTE_DEV_USER_ID = $UserId
$env:DEV_BYPASS_QUOTA = "true"
$env:AI_NOTE_ASR_BATCH = "2"
$env:AI_NOTE_LLM_BATCH = "1"

$logPath = "tmp\ai-note-3010.log"
$errPath = "tmp\ai-note-3010.err.log"
if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath -Force }
if (Test-Path -LiteralPath $errPath) { Remove-Item -LiteralPath $errPath -Force }

Start-Process cmd.exe -ArgumentList "/c", "npx next dev -p $Port" -WorkingDirectory (Get-Location) -RedirectStandardOutput $logPath -RedirectStandardError $errPath -PassThru | Select-Object -ExpandProperty Id
