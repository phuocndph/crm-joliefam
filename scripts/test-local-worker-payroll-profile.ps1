$ErrorActionPreference = "Stop"
$helperPath = Join-Path $PSScriptRoot "local-auth.ps1"
. $helperPath
$base = $env:LOCAL_API_URL
if (-not $base) { $base = "http://127.0.0.1:8787" }
$headers = Get-LocalAuthHeaders $base
$suffix = (Get-Date).ToString("yyyyMMddHHmmss")

function Invoke-JsonPost([string]$Path, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri "$base$Path" -Headers (Get-LocalAuthHeaders $base) -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
}

function Get-OrCreateWorker([string]$Code, [string]$Name) {
  $workers = Invoke-RestMethod "$base/api/workers" -Headers $headers
  foreach ($worker in @($workers)) {
    if ($worker.employee_code -eq $Code) { return $worker }
  }
  Invoke-JsonPost "/api/workers" @{ employee_code = $Code; display_name = $Name; worker_type = "HELPER" }
}

function Get-ProfileByKey([string]$Key) {
  $profiles = Invoke-RestMethod "$base/api/payroll/worker-profiles" -Headers $headers
  foreach ($profile in @($profiles)) {
    if ($profile.idempotency_key -eq $Key) { return $profile }
  }
  return $null
}

function Ensure-ApprovedProfile($Worker, [string]$Key, [string]$EffectiveFrom, [decimal]$Allowance, [decimal]$Deduction) {
  $body = @{
    worker_id = $Worker.id
    piece_output_enabled = $false
    overtime_enabled = $false
    meal_enabled = $false
    allowances_enabled = $true
    deductions_enabled = $true
    insurance_enabled = $false
    fixed_allowance_amount = $Allowance
    fixed_deduction_amount = $Deduction
    effective_from = $EffectiveFrom
    source_reference = "Local worker payroll profile smoke"
    reason = "Targeted local worker payroll profile test"
    idempotency_key = $Key
  }
  $profile = Invoke-JsonPost "/api/payroll/worker-profiles" $body
  $replay = Invoke-JsonPost "/api/payroll/worker-profiles" $body
  if ($replay.id -ne $profile.id -or -not $replay.reused) { throw "Worker profile idempotency replay failed for $Key." }
  if ($profile.status -eq "DRAFT") {
    $profile = Invoke-JsonPost "/api/payroll/worker-profiles/$($profile.id)/approve" @{ reason = "Approve targeted worker payroll profile test" }
  }
  return $profile
}

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok) { throw "Local API health check failed." }

$worker = Get-OrCreateWorker "PAYTEST-PROFILE" "Payroll Test - Central Profile"
$oldProfile = Ensure-ApprovedProfile $worker "worker-payroll-profile-smoke-v1" "2199-01-01" 50000 12000
$currentProfile = Ensure-ApprovedProfile $worker "worker-payroll-profile-smoke-v2" "2199-02-01" 70000 15000

$allProfiles = Invoke-RestMethod "$base/api/payroll/worker-profiles?workerId=$($worker.id)" -Headers $headers
$oldProfile = @($allProfiles | Where-Object { $_.idempotency_key -eq "worker-payroll-profile-smoke-v1" })[0]
$currentProfile = @($allProfiles | Where-Object { $_.idempotency_key -eq "worker-payroll-profile-smoke-v2" })[0]
if ($oldProfile.status -ne "RETIRED") { throw "Approving the overlapping profile did not retire the previous approved version." }
if ($currentProfile.status -ne "APPROVED") { throw "Current worker payroll profile is not approved." }

$conflictRaised = $false
try {
  Invoke-JsonPost "/api/payroll/worker-profiles" @{
    worker_id = $worker.id
    allowances_enabled = $true
    deductions_enabled = $true
    fixed_allowance_amount = 70001
    fixed_deduction_amount = 15000
    effective_from = "2199-02-01"
    reason = "Conflicting idempotency payload"
    idempotency_key = "worker-payroll-profile-smoke-v2"
  } | Out-Null
} catch {
  $conflictRaised = $_.Exception.Response.StatusCode.value__ -eq 409
}
if (-not $conflictRaised) { throw "Expected a 409 idempotency conflict." }

$approvedEditRejected = $false
try {
  Invoke-RestMethod -Method Patch -Uri "$base/api/payroll/worker-profiles/$($currentProfile.id)" -Headers $headers -ContentType "application/json" -Body (@{
    allowances_enabled = $true
    deductions_enabled = $true
    fixed_allowance_amount = 1
    fixed_deduction_amount = 1
    effective_from = "2199-02-01"
    reason = "Approved profile must be immutable"
  } | ConvertTo-Json) | Out-Null
} catch {
  $approvedEditRejected = $_.Exception.Response.StatusCode.value__ -eq 400
}
if (-not $approvedEditRejected) { throw "Approved worker payroll profile was editable." }

$run = Invoke-JsonPost "/api/payroll/runs" @{
  period_start = "2199-02-01"
  period_end = "2199-02-01"
  standard_days = 26
  idempotency_key = "worker-payroll-profile-smoke-run-$suffix"
}
$allowanceItems = @($run.items | Where-Object { $_.worker_id -eq $worker.id -and $_.item_type -eq "FIXED_ALLOWANCE" })
$deductionItems = @($run.items | Where-Object { $_.worker_id -eq $worker.id -and $_.item_type -eq "FIXED_DEDUCTION" })
if ($allowanceItems.Count -ne 1 -or [decimal]$allowanceItems[0].amount_precise -ne 70000) { throw "Expected one 70000 fixed allowance item." }
if ($deductionItems.Count -ne 1 -or [decimal]$deductionItems[0].amount_precise -ne 15000) { throw "Expected one 15000 fixed deduction item." }

Write-Host "Local worker payroll profile test passed: idempotency, conflict, immutable approval, superseding version, fixed allowance and deduction."
