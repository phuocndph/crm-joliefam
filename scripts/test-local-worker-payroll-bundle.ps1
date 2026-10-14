$ErrorActionPreference = "Stop"
$helperPath = Join-Path $PSScriptRoot "local-auth.ps1"
. $helperPath
$base = $env:LOCAL_API_URL
if (-not $base) { $base = "http://127.0.0.1:8787" }
$headers = Get-LocalAuthHeaders $base

function Invoke-JsonPost([string]$Path, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri "$base$Path" -Headers (Get-LocalAuthHeaders $base) -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
}

function Get-OrCreateWorker([string]$Code, [string]$Name) {
  $workers = Invoke-RestMethod "$base/api/workers" -Headers $headers
  $worker = @($workers | Where-Object { $_.employee_code -eq $Code })[0]
  if ($worker) { return $worker }
  Invoke-JsonPost "/api/workers" @{ employee_code = $Code; display_name = $Name; worker_type = "HELPER" }
}

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok) { throw "Local API health check failed." }

$groups = Invoke-RestMethod "$base/api/payroll/policy-groups" -Headers $headers
if (@($groups).Count -eq 0) {
  $group = Invoke-JsonPost "/api/payroll/policy-groups" @{
    code = "BUNDLESMOKE"
    name = "Atomic bundle smoke"
    description = "Local-only automated fixture"
    is_active = $true
    reason = "Create policy group for atomic bundle test"
  }
} else {
  $group = @($groups)[0]
}

$worker = Get-OrCreateWorker "PAYTEST-BUNDLE" "Payroll Test - Atomic Bundle"
$body = @{
  worker_id = $worker.id
  idempotency_key = "worker-payroll-bundle-smoke-v1"
  location_code = "TEST-ATOMIC"
  position_title = "Nhân viên test bundle"
  employment_start_date = "2199-03-01"
  payroll_status = "ACTIVE"
  compensation_type = "MONTHLY_HELPER"
  payroll_policy_group_id = $group.id
  primary_amount = 12000000
  monthly_productive_minutes = 12480
  piece_output_enabled = $true
  overtime_enabled = $true
  meal_enabled = $true
  allowances_enabled = $true
  deductions_enabled = $true
  insurance_enabled = $true
  fixed_allowance_amount = 500000
  fixed_deduction_amount = 100000
  insurance_amount = 600000
  insurance_source_reference = "Bundle smoke insurance"
  effective_from = "2199-03-01"
  source_reference = "Atomic payroll bundle smoke"
  reason = "Verify atomic central payroll save"
}

$saved = Invoke-JsonPost "/api/payroll/worker-profile-bundle" $body
$replayed = Invoke-JsonPost "/api/payroll/worker-profile-bundle" $body
if (-not $replayed.reused) { throw "Expected the second bundle save to reuse every draft." }
foreach ($component in @("assignment", "rate", "profile", "insurance")) {
  if ($saved.$component.id -ne $replayed.$component.id) { throw "Bundle retry created a duplicate $component draft." }
  if ($replayed.$component.status -ne "DRAFT") { throw "Expected $component to remain in DRAFT status." }
}

$conflictOwner = Get-OrCreateWorker "PAYTEST-BUNDLE-CONFLICT" "Payroll Test - Bundle Conflict Owner"
Invoke-JsonPost "/api/payroll/worker-profiles" @{
  worker_id = $conflictOwner.id
  allowances_enabled = $false
  deductions_enabled = $false
  fixed_allowance_amount = 0
  fixed_deduction_amount = 0
  effective_from = "2199-03-01"
  source_reference = "Atomic bundle conflict owner"
  reason = "Reserve idempotency key for rollback test"
  idempotency_key = "worker-payroll-bundle-conflict-owner"
} | Out-Null

$conflictBody = $body.Clone()
$conflictBody.idempotency_key = "worker-payroll-bundle-conflict-owner"
$conflictBody.location_code = "SHOULD-ROLLBACK"
$conflictBody.position_title = "Không được lưu"
$conflictBody.primary_amount = 1
$conflictBody.monthly_productive_minutes = 1
$conflictBody.effective_from = "2199-04-01"
$conflictBody.reason = "Force idempotency conflict after transactional writes"
$conflictRaised = $false
try {
  Invoke-JsonPost "/api/payroll/worker-profile-bundle" $conflictBody | Out-Null
} catch {
  $conflictRaised = $_.Exception.Response.StatusCode.value__ -eq 409
}
if (-not $conflictRaised) { throw "Expected a 409 idempotency conflict during rollback probe." }

$workersAfter = Invoke-RestMethod "$base/api/payroll/workers" -Headers $headers
$workerAfter = @($workersAfter | Where-Object { $_.id -eq $worker.id })[0]
$ratesAfter = Invoke-RestMethod "$base/api/payroll/rates?workerId=$($worker.id)" -Headers $headers
$rateAfter = @($ratesAfter | Where-Object { $_.status -eq "DRAFT" -and $_.compensation_type -eq "MONTHLY_HELPER" })[0]
$assignmentsAfter = Invoke-RestMethod "$base/api/payroll/compensation-assignments?workerId=$($worker.id)" -Headers $headers
$assignmentAfter = @($assignmentsAfter | Where-Object { $_.status -eq "DRAFT" })[0]
$profilesAfter = Invoke-RestMethod "$base/api/payroll/worker-profiles?workerId=$($worker.id)" -Headers $headers
$insuranceAfter = Invoke-RestMethod "$base/api/payroll/insurance?workerId=$($worker.id)" -Headers $headers

if ($workerAfter.location_code -ne "TEST-ATOMIC" -or $workerAfter.position_title -ne $saved.worker.position_title) { throw "Worker master changes were not rolled back." }
if ([decimal]$rateAfter.monthly_rate -ne 12000000) { throw "Worker rate change was not rolled back." }
if ($assignmentAfter.effective_from -ne "2199-03-01") { throw "Assignment change was not rolled back." }
if (@($profilesAfter | Where-Object { $_.status -eq "DRAFT" }).Count -ne 1) { throw "Bundle save created duplicate payroll profile drafts." }
if (@($insuranceAfter | Where-Object { $_.status -eq "DRAFT" }).Count -ne 1) { throw "Bundle save created duplicate insurance drafts." }

Write-Host "Local worker payroll bundle test passed: one transaction, retry reuse, no duplicate drafts, and full rollback after a late conflict."
