$sw=[Diagnostics.Stopwatch]::StartNew()
cmd /c "set NODE_ENV=production&& node node_modules\next\dist\bin\next start -p 3000 > tmp\prod.log 2>&1"
$sw.Stop()
Set-Content -Path tmp\server.ms -Value $sw.ElapsedMilliseconds
