$ErrorActionPreference = "Stop"

function Get-LocalAuthHeaders([string]$Base) {
  $session = Invoke-RestMethod -Method Get -Uri "$($Base.TrimEnd('/'))/api/local-auth/session" -Headers @{ Origin = "http://127.0.0.1:8090" }
  if (-not $session.token) { throw "Local auth bootstrap did not return a session token." }
  return @{ Authorization = "Bearer $($session.token)"; Origin = "http://127.0.0.1:8090" }
}
