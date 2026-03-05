$sw = [Diagnostics.Stopwatch]::StartNew()
$ready = $false
for ($i=0; $i -lt 40; $i++) {
  $net = cmd /c 'netstat -ano | findstr :3000'
  if ($net) { $ready = $true; break }
  Start-Sleep -Milliseconds 250
}
$sw.Stop()
if ($ready) { Set-Content -Path tmp\server.ms -Value $sw.ElapsedMilliseconds; 'ready' } else { 'not ready' }
