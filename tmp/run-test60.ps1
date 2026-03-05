$sw=[Diagnostics.Stopwatch]::StartNew()
powershell -ExecutionPolicy Bypass -File scripts\test-ai-note.ps1 -SegmentsDir tmp\audio\seg60 -OutputPath output\note_60min_prod.md -Mode production -BuildMsPath tmp\build.ms -ServerMsPath tmp\server.ms -SummaryPath tmp\summary.jsonl -Label test60
$sw.Stop()
Set-Content -Path tmp\test60.ms -Value $sw.ElapsedMilliseconds
