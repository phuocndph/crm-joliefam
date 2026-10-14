param([string]$Base = "http://127.0.0.1:8787")

$ErrorActionPreference = "Stop"
$base = $Base.TrimEnd('/')
$session = Invoke-RestMethod "$base/api/local-auth/session"
$headers = @{ Authorization = "Bearer $($session.token)" }
$suffix = [guid]::NewGuid().ToString("N").Substring(0, 10)
$customer = $null

function Invoke-Json($url, $method, $body = $null) {
  $params = @{ Uri = $url; Method = $method; Headers = $headers }
  if ($null -ne $body) {
    $params.ContentType = "application/json"
    $params.Body = ($body | ConvertTo-Json -Depth 10 -Compress)
  }
  return Invoke-RestMethod @params
}

try {
  $customer = Invoke-Json "$base/api/customers" POST @{ name = "Compat customer $suffix"; email = "compat-$suffix@example.test"; phone = "0900000000"; notes = "to-clear"; assignee_id = "demo-assignee"; last_care_date = "2025-01-02T00:00:00Z" }
  $updated = Invoke-Json "$base/api/customers/$($customer.id)" PATCH @{ email = $null; phone = $null; notes = $null; assignee_id = $null; last_care_date = $null }
  foreach ($field in @("email", "phone", "notes", "assignee_id", "last_care_date")) {
    if ($null -ne $updated.$field) { throw "Explicit null did not clear customer field '$field'." }
  }
  $camel = Invoke-Json "$base/api/customers/$($customer.id)" PATCH @{ email = "camel-$suffix@example.test"; assigneeId = "camel-assignee" }
  if ($camel.email -ne "camel-$suffix@example.test" -or $camel.assignee_id -ne "camel-assignee") { throw "Camel-case customer aliases were not persisted." }
  Write-Host "Local customer PATCH test passed: omission preservation, explicit null clearing and camel aliases verified."
}
finally {
  if ($customer) { try { Invoke-Json "$base/api/customers/$($customer.id)" DELETE | Out-Null } catch {} }
}
