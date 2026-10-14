$ErrorActionPreference = "Stop"
$helperPath = Join-Path $PSScriptRoot "local-auth.ps1"
. $helperPath
$base = $env:LOCAL_API_URL
if ($env:LOCAL_TEST_ISOLATED -ne '1' -or -not $base -or ([uri]$base).Port -eq 8787) {
  throw 'Run this suite using test-local-isolated.ps1 -Suite adjustments, not against the shared runtime.'
}
$headers = Get-LocalAuthHeaders $base
$date = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$month = $date.Substring(0, 7)
$suffix = (Get-Date).ToString("yyyyMMddHHmmss")

function Invoke-Json([string]$Method, [string]$Path, [hashtable]$Body = @{}) {
  Invoke-RestMethod -Method $Method -Uri "$base$Path" -Headers (Get-LocalAuthHeaders $base) -ContentType "application/json" -Body (($Body | ConvertTo-Json -Depth 10))
}

function Post([string]$Path, [hashtable]$Body) { Invoke-Json "POST" $Path $Body }

function Get-OrCreateWorker([string]$Code) {
  $workers = Invoke-RestMethod "$base/api/workers" -Headers $headers
  foreach ($worker in $workers) { if ($worker.employee_code -eq $Code) { return $worker } }
  return Post "/api/workers" @{ employee_code = $Code; display_name = "Payroll Test - Adjustment"; worker_type = "HELPER" }
}

function Ensure-PayrollSetup($Worker) {
  $group = Post "/api/payroll/policy-groups" @{ code = "ADJ-$suffix"; name = "Payroll adjustment test $suffix"; reason = "Payroll adjustment fixture" }
  $bundle = Post "/api/payroll/worker-profile-bundle" @{
    worker_id = $Worker.id; compensation_type = "MONTHLY_HELPER"; payroll_policy_group_id = $group.id;
    effective_from = $date; primary_amount = 2600000; reason = "Payroll adjustment fixture";
    idempotency_key = "payroll-adjustment-bundle-$suffix"
  }
  Post "/api/payroll/compensation-assignments/$($bundle.assignment.id)/approve" @{ reason = "Payroll adjustment fixture" } | Out-Null
  if ($bundle.rate) { Post "/api/payroll/rates/$($bundle.rate.id)/approve" @{ reason = "Payroll adjustment fixture" } | Out-Null }
  Post "/api/payroll/worker-profiles/$($bundle.profile.id)/approve" @{ reason = "Payroll adjustment fixture" } | Out-Null
}

function Approve-Attendance($Record) {
  Post "/api/attendance/status" @{ attendance_record_id = $Record.id; target_status = "APPROVED"; reason = "Payroll adjustment fixture" } | Out-Null
}

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok) { throw "Local API health check failed." }
$worker = Get-OrCreateWorker "PAYTEST-ADJUSTMENT-$suffix"
Ensure-PayrollSetup $worker
$attendance = $null
foreach ($row in @((Invoke-RestMethod "$base/api/attendance?month=$month" -Headers $headers).rows)) {
  if ($row.worker_id -eq $worker.id -and $row.work_date -eq $date -and -not $row.is_reversed) { $attendance = $row; break }
}
if (-not $attendance) {
  $attendance = Post "/api/attendance" @{ worker_id = $worker.id; attendance_method = "DAY"; work_date = $date; day_units = 1; idempotency_key = "payroll-adjustment-attendance-$date-$suffix" }
}
if ($attendance.workflow_status -ne "APPROVED") { Approve-Attendance $attendance }

$period = @{ period_start = $date; period_end = $date }
$earning = Post "/api/payroll/adjustments" @{
  worker_id = $worker.id; period_start = $date; period_end = $date; item_type = "BONUS"; item_direction = "EARNING";
  amount = 25000; reason = "Payroll test bonus"; source_reference = "TEST-ADJUSTMENT-EARNING-$suffix"; idempotency_key = "payroll-adjustment-earning-$suffix"
}
$replay = Post "/api/payroll/adjustments" @{
  worker_id = $worker.id; period_start = $date; period_end = $date; item_type = "BONUS"; item_direction = "EARNING";
  amount = 25000; reason = "Payroll test bonus"; source_reference = "TEST-ADJUSTMENT-EARNING-$suffix"; idempotency_key = "payroll-adjustment-earning-$suffix"
}
if (-not $replay.reused -or $replay.id -ne $earning.id) { throw "Adjustment idempotency replay failed." }

try {
  Post "/api/payroll/adjustments" @{
    worker_id = $worker.id; period_start = $date; period_end = $date; item_type = "BONUS"; item_direction = "EARNING";
    amount = 26000; reason = "Different payload"; idempotency_key = "payroll-adjustment-earning-$suffix"
  } | Out-Null
  throw "Expected idempotency conflict was not returned."
} catch {
  if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
}

$deduction = Post "/api/payroll/adjustments" @{
  worker_id = $worker.id; period_start = $date; period_end = $date; item_type = "SALARY_ADVANCE"; item_direction = "DEDUCTION";
  amount = 10000; reason = "Payroll test salary advance"; source_reference = "TEST-ADJUSTMENT-DEDUCTION-$suffix"; idempotency_key = "payroll-adjustment-deduction-$suffix"
}
if ($earning.status -eq "DRAFT") { Post "/api/payroll/adjustments/$($earning.id)/submit" @{ reason = "Submit payroll test bonus" } | Out-Null; $earning.status = "SUBMITTED" }
if ($earning.status -eq "SUBMITTED") { Post "/api/payroll/adjustments/$($earning.id)/approve" @{ reason = "Approve payroll test bonus" } | Out-Null }
if ($deduction.status -eq "DRAFT") { Post "/api/payroll/adjustments/$($deduction.id)/submit" @{ reason = "Submit payroll test salary advance" } | Out-Null; $deduction.status = "SUBMITTED" }
if ($deduction.status -eq "SUBMITTED") { Post "/api/payroll/adjustments/$($deduction.id)/approve" @{ reason = "Approve payroll test salary advance" } | Out-Null }

$run = Post "/api/payroll/runs" @{ period_start = $date; period_end = $date; standard_days = 26; idempotency_key = "payroll-adjustment-run-$suffix" }
$items = @($run.items | Where-Object { $_.worker_id -eq $worker.id })
if ($items.Count -ne 3) { throw "Expected attendance + 2 adjustment items, got $($items.Count)." }
$record = @($run.records | Where-Object { $_.worker_id -eq $worker.id })[0]
if (-not $record) { throw "Adjustment worker payroll record was not created." }
if ([decimal]$record.gross_amount -ne 125000) { throw "Expected worker gross 125000, got $($record.gross_amount)." }
if ([decimal]$record.deductions_amount -ne 10000) { throw "Expected worker deductions 10000, got $($record.deductions_amount)." }
if ([decimal]$record.net_amount -ne 115000) { throw "Expected worker net 115000, got $($record.net_amount)." }

$rows = @(Invoke-RestMethod "$base/api/payroll/adjustments?workerId=$($worker.id)&periodStart=$date&periodEnd=$date" -Headers $headers)
foreach ($row in $rows | Where-Object { $_.id -in @($earning.id, $deduction.id) }) {
  if ($row.status -ne "LOCKED" -or $row.locked_run_id -ne $run.id) { throw "Adjustment $($row.id) was not locked to the payroll run." }
}
if ([int]$run.blocking_exception_count -ne 0) { throw 'Isolated adjustment payroll has blocking exceptions.' }
$locked = Post "/api/payroll/runs/$($run.id)/lock" @{}
if ($locked.status -ne "LOCKED") { throw "Payroll adjustment run was not locked." }
Write-Host "Local payroll adjustment test passed: worker gross $($record.gross_amount), deductions $($record.deductions_amount), net $($record.net_amount), run locked."
