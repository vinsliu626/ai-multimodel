$sw=[Diagnostics.Stopwatch]::StartNew()
cmd /c "set NODE_ENV=production&& set NEXT_FONT_GOOGLE_MOCK=1&& node node_modules\next\dist\bin\next build"
$sw.Stop()
Set-Content -Path tmp\build.ms -Value $sw.ElapsedMilliseconds
