$ErrorActionPreference = "Stop"
$base = $env:LOCAL_API_URL
if (-not $base) { $base = "http://127.0.0.1:8787" }

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok -or $health.backend -ne "local-postgresql") { throw "Local API health check failed." }
$session = Invoke-RestMethod "${base}/api/local-auth/session"
$headers = @{ Authorization = "Bearer $($session.token)" }
$workers = Invoke-RestMethod "${base}/api/workers" -Headers $headers
if ($workers.Count -lt 4) { throw "Expected seeded local workers." }
$methods = Invoke-RestMethod "${base}/api/worker-methods" -Headers $headers
foreach ($method in @("DAY", "HOUR", "OUTPUT")) {
  if (-not ($methods | Where-Object attendance_method -eq $method)) { throw "Missing seeded method $method." }
}
$attendance = Invoke-RestMethod "$base/api/attendance?month=$((Get-Date).ToString('yyyy-MM'))&includeReversed=true" -Headers $headers
if ($null -eq $attendance.rows) { throw "Attendance response is invalid." }
$products = Invoke-RestMethod "${base}/api/production/products?workDate=$((Get-Date).ToString('yyyy-MM-dd'))" -Headers $headers
if ($products.Count -lt 2) { throw "Expected seeded local products." }
Write-Host "Local SQL runtime smoke test passed: $($workers.Count) workers, $($attendance.rows.Count) attendance rows, $($products.Count) products."
