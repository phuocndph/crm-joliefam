$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8787"

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok -or $health.backend -ne "local-postgresql") { throw "Local API health check failed." }
$session = Invoke-RestMethod "$base/api/local-auth/session" -Headers @{ Origin = "http://127.0.0.1:8090" }
if (-not $session.token) { throw "Local auth bootstrap did not return a session token." }
$headers = @{ Authorization = "Bearer $($session.token)"; Origin = "http://127.0.0.1:8090" }
$runs = Invoke-RestMethod "$base/api/local-sync/runs" -Headers $headers
$snapshots = Invoke-RestMethod "$base/api/local-sync/snapshots" -Headers $headers
if ($null -eq $runs -or $null -eq $snapshots) { throw "Local sync status API is invalid." }

Write-Host "Local sync storage test passed: $(@($runs).Count) runs, $(@($snapshots).Count) source tables stored."
