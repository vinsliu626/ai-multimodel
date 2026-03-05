$ErrorActionPreference = "Stop"
$files=@('.env.local','.env')
$secret=$null
foreach($f in $files){
  if(Test-Path $f){
    $line=Get-Content $f | Where-Object { $_ -match '^\s*NEXTAUTH_SECRET\s*=' } | Select-Object -First 1
    if($line){
      $secret=($line -split '=',2)[1].Trim()
      if($secret.StartsWith('"') -and $secret.EndsWith('"')){ $secret=$secret.Substring(1,$secret.Length-2) }
      if($secret.StartsWith("'") -and $secret.EndsWith("'")){ $secret=$secret.Substring(1,$secret.Length-2) }
      break
    }
  }
}
if(-not $secret){ throw 'NEXTAUTH_SECRET not found in .env files' }
$env:NEXTAUTH_SECRET=$secret
$env:NEXTAUTH_URL='http://localhost:3000'
& .\scripts\start-prod.ps1 -BaseUrl 'http://localhost:3000'
