# Batched OpenAI web enrichment. Stops when no incomplete rows remain.
# Per batch: 4 rows @ ~0.5s delay keeps each action under Convex time limits
# (each lender is one gpt-4o + web_search call).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
$log = Join-Path $PSScriptRoot "enrich-missing.log"
"=== start $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8

$batch = 0
$grandOk = 0
$grandFail = 0
$grandFields = 0
$args = '{"limit":4,"summaryOnly":true,"delayMs":500}'

while ($true) {
  $out = npx convex run enrich:enrichMissing $args 2>&1 | Out-String
  if (-not ($out -match '\{')) {
    "convex run failed: $out" | Tee-Object -FilePath $log -Append
    break
  }
  $json = $out | Select-String -Pattern '\{[\s\S]*\}' | ForEach-Object { $_.Matches.Value } | Select-Object -Last 1
  try { $o = $json | ConvertFrom-Json } catch {
    "parse fail: $out" | Tee-Object -FilePath $log -Append
    break
  }
  $line = "batch $batch  total=$($o.total)  ok=$($o.succeeded)  fail=$($o.failed)  fields=$($o.filled)"
  $line | Tee-Object -FilePath $log -Append
  $grandOk += $o.succeeded
  $grandFail += $o.failed
  $grandFields += $o.filled
  $batch++
  if ($o.total -eq 0) { break }
  if ($batch -ge 1000) {
    "max batch safety stop" | Tee-Object -FilePath $log -Append
    break
  }
}

"=== done $(Get-Date -Format o)  batches=$batch  grand OK=$grandOk  fail=$grandFail  field-writes=$grandFields ===" | Tee-Object -FilePath $log -Append
