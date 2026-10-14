$ErrorActionPreference = "Stop"
$helperPath = Join-Path $PSScriptRoot "local-auth.ps1"
. $helperPath
$base = $env:LOCAL_API_URL
if (-not $base) { $base = "http://127.0.0.1:8787" }

function Invoke-JsonPost([string]$Path, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri "$base$Path" -Headers (Get-LocalAuthHeaders $base) -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
}

function Get-OrCreateWorker([string]$Code, [string]$Name, [string]$Type) {
  $workers = Invoke-RestMethod "$base/api/workers"
  foreach ($worker in $workers) {
    if ($worker.employee_code -eq $Code) { return $worker }
  }
  Invoke-JsonPost "/api/workers" @{ employee_code = $Code; display_name = $Name; worker_type = $Type }
}

function Ensure-Method($Worker, [string]$Method, [decimal]$Rate) {
  $methods = Invoke-RestMethod "$base/api/worker-methods"
  foreach ($item in $methods) {
    if ($item.worker_id -eq $Worker.id -and $item.attendance_method -eq $Method) { return }
  }
  Invoke-JsonPost "/api/worker-methods" @{
    worker_id = $Worker.id
    attendance_method = $Method
    rate_amount = $Rate
    effective_from = "2099-01-01"
    reason = "Payroll engine fixture"
  } | Out-Null
}

function Approve-Attendance($Record) {
  Invoke-JsonPost "/api/attendance/status" @{
    attendance_record_id = $Record.id
    target_status = "APPROVED"
    reason = "Payroll engine fixture"
  } | Out-Null
}

function Ensure-Insurance($Worker, [decimal]$Amount, [string]$EffectiveDate) {
  $source = "Payroll engine insurance fixture v1"
  $versions = Invoke-RestMethod "$base/api/payroll/insurance?workerId=$($Worker.id)"
  foreach ($version in @($versions)) {
    if ($version.status -eq "APPROVED" -and [decimal]$version.employee_amount -eq $Amount -and $version.effective_from -le $EffectiveDate -and (-not $version.effective_to -or $version.effective_to -ge $EffectiveDate)) {
      return $version
    }
  }
  $draft = $null
  foreach ($version in @($versions)) {
    if ($version.status -eq "DRAFT" -and $version.source_reference -eq $source -and [decimal]$version.employee_amount -eq $Amount -and $version.effective_from -eq $EffectiveDate) {
      $draft = $version
      break
    }
  }
  if (-not $draft) {
    $draft = Invoke-JsonPost "/api/payroll/insurance" @{
      worker_id = $Worker.id
      employee_amount = $Amount
      effective_from = $EffectiveDate
      source_reference = $source
      reason = "Payroll engine insurance fixture"
    }
  }
  return Invoke-JsonPost "/api/payroll/insurance/$($draft.id)/approve" @{ reason = "Payroll engine insurance fixture" }
}

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok) { throw "Local API health check failed." }

$dayWorker = Get-OrCreateWorker "PAYTEST-DAY" "Payroll Test - Day" "HELPER"
$hourWorker = Get-OrCreateWorker "PAYTEST-HOUR" "Payroll Test - Hour" "CUTTER"
$pieceWorker = Get-OrCreateWorker "PAYTEST-PIECE" "Payroll Test - Piece" "SEWER"
Ensure-Method $dayWorker "DAY" 100000
Ensure-Method $hourWorker "HOUR" 20000
Ensure-Method $pieceWorker "OUTPUT" 5000

$dayAttendance = Invoke-JsonPost "/api/attendance" @{
  worker_id = $dayWorker.id
  attendance_method = "DAY"
  work_date = "2099-12-01"
  day_units = 1.5
  idempotency_key = "payroll-engine-test-day-v1"
}
Approve-Attendance $dayAttendance

$hourAttendance = Invoke-JsonPost "/api/attendance/hour" @{
  worker_id = $hourWorker.id
  work_date = "2099-12-01"
  check_in_time = "08:00"
  check_out_time = "17:00"
  break_minutes = 60
  idempotency_key = "payroll-engine-test-hour-v1"
}
Approve-Attendance $hourAttendance

$pieceAttendance = Invoke-JsonPost "/api/attendance" @{
  worker_id = $pieceWorker.id
  attendance_method = "OUTPUT"
  work_date = "2099-12-01"
  output_quantity = 10
  idempotency_key = "payroll-engine-test-piece-v1"
}
Approve-Attendance $pieceAttendance

$overtimeRows = Invoke-RestMethod "$base/api/attendance/overtime?month=2099-12"
$overtime = $null
foreach ($row in $overtimeRows) {
  if ($row.worker_id -eq $hourWorker.id -and $row.work_date -eq "2099-12-01") { $overtime = $row; break }
}
if (-not $overtime) {
  $overtime = Invoke-JsonPost "/api/attendance/overtime" @{
    worker_id = $hourWorker.id
    work_date = "2099-12-01"
    overtime_type = "NORMAL_OVERTIME"
    overtime_minutes = 60
    reason = "Payroll engine fixture"
    idempotency_key = "payroll-engine-test-overtime-v1"
  }
}
Invoke-JsonPost "/api/attendance/overtime/status" @{
  overtime_record_id = $overtime.id
  target_status = "APPROVED"
} | Out-Null

$run = Invoke-JsonPost "/api/payroll/runs" @{
  period_start = "2099-12-01"
  period_end = "2099-12-01"
  standard_days = 26
  idempotency_key = "payroll-engine-test-run-v1"
}
if ($run.record_count -ne 3) { throw "Expected 3 payroll records, got $($run.record_count)." }
if (@($run.items).Count -ne 4) { throw "Expected 4 payroll items, got $(@($run.items).Count)." }
if ([decimal]$run.gross_total -ne 390000) { throw "Expected gross total 390000, got $($run.gross_total)." }
if ([decimal]$run.payment_total -ne 390000) { throw "Expected payment total 390000, got $($run.payment_total)." }
if ($run.blocking_exception_count -ne 0) { throw "Expected no blocking exceptions." }

$sameRun = Invoke-JsonPost "/api/payroll/runs" @{
  period_start = "2099-12-01"
  period_end = "2099-12-01"
  idempotency_key = "payroll-engine-test-run-v1"
}
if ($sameRun.id -ne $run.id) { throw "Payroll run idempotency failed." }

$locked = Invoke-JsonPost "/api/payroll/runs/$($run.id)/lock" @{}
if ($locked.status -ne "LOCKED") { throw "Payroll run was not locked." }

$insuranceWorker = Get-OrCreateWorker "PAYTEST-INSURANCE" "Payroll Test - Insurance" "HELPER"
Ensure-Method $insuranceWorker "DAY" 80000
$insuranceDate = "2100-01-01"
$insuranceAttendance = Invoke-JsonPost "/api/attendance" @{
  worker_id = $insuranceWorker.id
  attendance_method = "DAY"
  work_date = $insuranceDate
  day_units = 1
  idempotency_key = "payroll-engine-test-insurance-day-v1"
}
Approve-Attendance $insuranceAttendance
$insuranceAmount = [decimal]12345.67
$insurance = Ensure-Insurance $insuranceWorker $insuranceAmount $insuranceDate
if ($insurance.status -ne "APPROVED") { throw "Insurance fixture was not approved." }

$insuranceRun = Invoke-JsonPost "/api/payroll/runs" @{
  period_start = $insuranceDate
  period_end = $insuranceDate
  standard_days = 26
  idempotency_key = "payroll-engine-test-insurance-run-v2"
}
$insuranceItems = @($insuranceRun.items | Where-Object { $_.worker_id -eq $insuranceWorker.id -and $_.item_type -eq "SOCIAL_INSURANCE" -and $_.item_direction -eq "DEDUCTION" })
if ($insuranceItems.Count -ne 1) { throw "Expected one SOCIAL_INSURANCE deduction item, got $($insuranceItems.Count)." }
if ([decimal]$insuranceItems[0].amount_precise -ne $insuranceAmount) { throw "Expected insurance deduction $insuranceAmount, got $($insuranceItems[0].amount_precise)." }
if ([decimal]$insuranceRun.gross_total -ne 80000) { throw "Expected insurance fixture gross total 80000, got $($insuranceRun.gross_total)." }
if ([decimal]$insuranceRun.deductions_total -ne $insuranceAmount) { throw "Expected deductions total $insuranceAmount, got $($insuranceRun.deductions_total)." }
if ([decimal]$insuranceRun.net_total -ne ([decimal]80000 - $insuranceAmount)) { throw "Expected net total 67654.33, got $($insuranceRun.net_total)." }
if ([decimal]$insuranceRun.payment_total -ne 67654) { throw "Expected payment total 67654, got $($insuranceRun.payment_total)." }

$insuranceLocked = Invoke-JsonPost "/api/payroll/runs/$($insuranceRun.id)/lock" @{}
if ($insuranceLocked.status -ne "LOCKED") { throw "Insurance payroll run was not locked." }
Write-Host "Local payroll engine test passed: $($locked.record_count) workers, $(@($locked.items).Count) items, $($locked.payment_total) VND; insurance deduction $($insuranceLocked.deductions_total) VND, payment $($insuranceLocked.payment_total) VND."
