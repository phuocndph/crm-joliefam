$ErrorActionPreference = "Stop"
$base = $env:LOCAL_API_URL
if (-not $base) { $base = "http://127.0.0.1:8787" }
$base = $base.TrimEnd("/")

function Assert-Status([scriptblock]$Action, [int]$Expected, [string]$Label) {
  try {
    $response = & $Action
    $actual = [int]$response.StatusCode
  } catch {
    $actual = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  }
  if ($actual -ne $Expected) { throw "$Label expected HTTP $Expected, got HTTP $actual." }
  Write-Host "${Label}: HTTP $actual"
}

$session = Invoke-RestMethod -Uri "$base/api/local-auth/session" -Method Get -Headers @{ Origin = "http://127.0.0.1:8090" }
if (-not $session.token) { throw "Local auth bootstrap did not return a token." }
Write-Host "Session bootstrap: HTTP 200 (actor $($session.actor))"

Assert-Status { Invoke-WebRequest -UseBasicParsing -Uri "$base/api/attendance" -Method Post -ContentType "application/json" -Body '{"worker_id":"invalid","attendance_method":"DAY","work_date":"2099-01-01","day_units":1,"idempotency_key":"auth-smoke-missing"}' } 401 "Missing bearer token"
Assert-Status { Invoke-WebRequest -UseBasicParsing -Uri "$base/api/payroll/policy-groups" -Method Post -ContentType "application/json" -Body '{}' } 401 "Payroll mutation requires bearer token"
Assert-Status { Invoke-WebRequest -UseBasicParsing -Uri "$base/api/workers" -Method Post -Headers @{ Authorization = "Bearer invalid-token" } -ContentType "application/json" -Body '{}' } 401 "Worker mutation rejects invalid token"
Assert-Status { Invoke-WebRequest -UseBasicParsing -Uri "$base/api/local-auth/session" -Method Get -Headers @{ Origin = "https://evil.example" } } 403 "Disallowed origin"
Assert-Status { Invoke-WebRequest -UseBasicParsing -Uri "$base/api/local-auth/session" -Method Options -Headers @{ Origin = "http://127.0.0.1:8090"; "Access-Control-Request-Method" = "GET" } } 204 "Allowed CORS preflight"
Assert-Status { Invoke-WebRequest -UseBasicParsing -Uri "$base/api/attendance" -Method Post -Headers @{ Origin = "http://127.0.0.1:8090"; Authorization = "Bearer $($session.token)" } -ContentType "application/json" -Body '{"worker_id":"invalid","attendance_method":"DAY","work_date":"2026-09-29","day_units":1,"idempotency_key":"auth-smoke-token"}' } 400 "Bearer token accepted (validation response)"

Write-Host "Local auth/CORS smoke test passed."
