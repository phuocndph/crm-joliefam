$ErrorActionPreference = "Stop"
$helperPath = Join-Path $PSScriptRoot "local-auth.ps1"
. $helperPath
$base = $env:LOCAL_API_URL
if (-not $base) {
  throw "LOCAL_API_URL is required and must point to an isolated local API for this write test."
}
try {
  $baseUri = [uri]$base
  if (-not $baseUri.IsLoopback) { throw "not loopback" }
  $base = $base.TrimEnd("/")
} catch {
  throw "LOCAL_API_URL must be a valid loopback URL for an isolated local API."
}

function Post([string]$Path, [hashtable]$Body) {
  try {
    return Invoke-RestMethod -Method Post -Uri "$base$Path" -Headers (Get-LocalAuthHeaders $base) -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
  } catch {
    $detail = $_.ErrorDetails.Message
    throw "POST $Path failed: $detail"
  }
}

function Expect-Failure([scriptblock]$Action, [string]$Label) {
  $succeeded = $false
  try { & $Action; $succeeded = $true } catch { }
  if ($succeeded) { throw "$Label unexpectedly succeeded" }
}

function Get-HttpFailure([System.Management.Automation.ErrorRecord]$Failure) {
  $status = 0
  $payload = $Failure.ErrorDetails.Message
  $response = $Failure.Exception.Response
  if ($null -ne $response) {
    try { $status = [int]$response.StatusCode } catch { }
    if (-not $payload) {
      try {
        $stream = $response.GetResponseStream()
        if ($null -ne $stream) {
          $reader = [System.IO.StreamReader]::new($stream)
          try { $payload = $reader.ReadToEnd() } finally { $reader.Dispose(); $stream.Dispose() }
        }
      } catch { }
    }
  }
  $code = ""
  if ($payload) {
    try { $code = [string](($payload | ConvertFrom-Json -ErrorAction Stop).code) } catch { }
  }
  return [pscustomobject]@{ Status = $status; Code = $code; Payload = $payload }
}

function Expect-FutureDate([string]$Path, [hashtable]$Body, [string]$Label) {
  $succeeded = $false
  $failure = $null
  try {
    Invoke-WebRequest -Method Post -Uri "$base$Path" -Headers (Get-LocalAuthHeaders $base) -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8) | Out-Null
    $succeeded = $true
  } catch {
    $failure = Get-HttpFailure $_
  }
  if ($succeeded) { throw "$Label unexpectedly succeeded" }
  if ($null -eq $failure -or $failure.Status -ne 422) { throw "$Label should return HTTP 422, got HTTP $($failure.Status)" }
  if ($failure.Code -ne "FUTURE_DATE") { throw "$Label should return code FUTURE_DATE, got '$($failure.Code)'" }
}

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok) { throw "Local API health check failed." }
$runToken = [Guid]::NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant()
$workDate = (Get-Date).ToString("yyyy-MM-dd")
$month = (Get-Date).ToString("yyyy-MM")
$futureDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$worker = Post "/api/workers" @{ employee_code = "HARDEN-$runToken"; display_name = "Hardening Smoke"; worker_type = "GENERIC" }
Post "/api/worker-methods" @{ worker_id = $worker.id; attendance_method = "DAY"; rate_amount = 100000; effective_from = $workDate; reason = "Hardening smoke" } | Out-Null

$key = "local-hardening-$runToken"
Expect-FutureDate "/api/attendance" @{ worker_id = $worker.id; attendance_method = "DAY"; work_date = $futureDate; day_units = 1; idempotency_key = "$key-future" } "Future attendance"
Expect-FutureDate "/api/attendance/hour" @{ worker_id = $worker.id; work_date = $futureDate; check_in_time = "08:00"; check_out_time = "17:00"; break_minutes = 60; idempotency_key = "$key-hour-future" } "Future hourly attendance"
Expect-FutureDate "/api/production-attendance" @{ worker_id = $worker.id; attendance_method = "DAY"; work_date = $futureDate; day_units = 1; idempotency_key = "$key-production-attendance-future" } "Future production attendance"
Expect-FutureDate "/api/attendance/day-status" @{ worker_id = $worker.id; work_date = $futureDate; status = "PRESENT"; idempotency_key = "$key-day-status-future" } "Future day status"
Expect-FutureDate "/api/attendance/overtime" @{ worker_id = $worker.id; work_date = $futureDate; overtime_type = "NORMAL_OVERTIME"; overtime_minutes = 60; reason = "Future guard"; idempotency_key = "$key-overtime-future" } "Future overtime"
Expect-FutureDate "/api/production/entries" @{ worker_id = $worker.id; product_id = "missing-product"; work_date = $futureDate; quantity = 1; idempotency_key = "$key-production-entry-future" } "Future production entry"
Expect-FutureDate "/api/attendance/closures" @{ worker_id = $worker.id; work_date = $futureDate; target_status = "OPEN"; idempotency_key = "$key-closure-future" } "Future day closure"
$overtimeReplayKey = "$key-overtime-replay"
Post "/api/attendance/overtime" @{ worker_id = $worker.id; work_date = $workDate; overtime_type = "NORMAL_OVERTIME"; overtime_minutes = 60; reason = "Hardening replay fixture"; idempotency_key = $overtimeReplayKey } | Out-Null
Expect-FutureDate "/api/attendance/overtime" @{ worker_id = $worker.id; work_date = $futureDate; overtime_type = "NORMAL_OVERTIME"; overtime_minutes = 60; reason = "Future replay collision"; idempotency_key = $overtimeReplayKey } "Future overtime replay collision"
$record = Post "/api/attendance" @{ worker_id = $worker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = $key }
$replay = Post "/api/attendance" @{ worker_id = $worker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = $key }
if (-not $replay.reused -or $replay.id -ne $record.id) { throw "Attendance idempotency replay failed." }
Expect-Failure { Post "/api/attendance" @{ worker_id = $worker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 2; idempotency_key = $key } } "Idempotency key"

Post "/api/attendance/status" @{ attendance_record_id = $record.id; target_status = "APPROVED"; reason = "Hardening smoke"; idempotency_key = "$key-approve" } | Out-Null
Expect-Failure { Post "/api/attendance/status" @{ attendance_record_id = $record.id; target_status = "REJECTED"; idempotency_key = "$key-reject" } | Out-Null } "Bắt buộc nhập lý do"
Post "/api/attendance/closures" @{ worker_id = $worker.id; work_date = $workDate; target_status = "EMPLOYEE_CONFIRMED"; idempotency_key = "$key-close-employee" } | Out-Null
Post "/api/attendance/closures" @{ worker_id = $worker.id; work_date = $workDate; target_status = "LEADER_CONFIRMED"; idempotency_key = "$key-close-leader" } | Out-Null
Expect-Failure { Post "/api/attendance" @{ worker_id = $worker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = "$key-after-close-create" } | Out-Null } "Ngày công đã được trưởng nhóm xác nhận"
Expect-Failure { Post "/api/attendance/status" @{ attendance_record_id = $record.id; target_status = "LOCKED"; reason = "Hardening smoke"; idempotency_key = "$key-after-close" } | Out-Null } "Ngày công đã được trưởng nhóm xác nhận"
Expect-Failure { Post "/api/attendance/closures" @{ worker_id = $worker.id; work_date = $workDate; target_status = "REOPENED"; idempotency_key = "$key-reopen" } | Out-Null } "Bắt buộc nhập lý do"
Post "/api/attendance/closures" @{ worker_id = $worker.id; work_date = $workDate; target_status = "REOPENED"; reason = "Hardening smoke correction"; idempotency_key = "$key-reopen-ok" } | Out-Null
Post "/api/attendance/$($record.id)/reverse" @{ reason = "Hardening smoke correction"; idempotency_key = "$key-reverse" } | Out-Null
$history = @(Invoke-RestMethod "$base/api/attendance/history?month=$month" -Headers (Get-LocalAuthHeaders $base))
if (-not ($history | Where-Object { $_.entity_id -eq $record.id -and $_.action -eq "REVERSE" })) {
  throw "Attendance audit history did not include the reversal event."
}

Write-Host "Local attendance hardening smoke test passed."
