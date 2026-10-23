$ErrorActionPreference = "Stop"
$helperPath = Join-Path $PSScriptRoot "local-auth.ps1"
. $helperPath

# This test owns a temporary PostgreSQL database and never touches the shared
# local database or the public Supabase project.
$projectRoot = Split-Path -Parent $PSScriptRoot
$container = "crm-joliefam-local-postgres"
$database = "crm_local_payroll_v2_$PID"
$port = 8791 + ($PID % 100)
$databaseUrl = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/$database"
$stdoutPath = Join-Path $projectRoot ".payroll-v2-test-$PID.stdout.log"
$stderrPath = Join-Path $projectRoot ".payroll-v2-test-$PID.stderr.log"
$apiProcess = $null

function Invoke-LocalSql([string]$sql) {
  & docker exec $container psql -U crm_local -d $database -v ON_ERROR_STOP=1 -c $sql *> $null
  if ($LASTEXITCODE -ne 0) { throw "Local SQL test command failed." }
}

function Invoke-Json([string]$method, [string]$path, [hashtable]$body = $null) {
  $base = "http://127.0.0.1:$port"
  $params = @{ Method = $method; Uri = "$base$path"; Headers = (Get-LocalAuthHeaders $base); ErrorAction = "Stop" }
  if ($null -ne $body) {
    $params.ContentType = "application/json"
    $params.Body = $body | ConvertTo-Json -Depth 12
  }
  try {
    Invoke-RestMethod @params
  } catch {
    $detail = $_.ErrorDetails.Message
    if ($detail) {
      try {
        $message = ($detail | ConvertFrom-Json).message
        if ($message) { throw [System.InvalidOperationException]::new([string]$message) }
      } catch [System.InvalidOperationException] { throw }
      catch { }
    }
    throw
  }
}

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
}

function Assert-Decimal([decimal]$actual, [decimal]$expected, [decimal]$tolerance, [string]$message) {
  if ([math]::Abs($actual - $expected) -gt $tolerance) {
    throw "$message (expected $expected, got $actual)"
  }
}

function Stop-TestApi {
  if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
    # Windows PowerShell/.NET on older hosts does not expose Kill(bool);
    # taskkill with the exact child PID terminates only this test process tree.
    & taskkill.exe /PID $apiProcess.Id /T /F *> $null
    $null = $apiProcess.WaitForExit(5000)
  }
}

try {
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database" *> $null
  if ($LASTEXITCODE -ne 0) { throw "Could not create isolated payroll test database." }

  $command = "`$env:LOCAL_DATABASE_URL='$databaseUrl'; `$env:LOCAL_API_PORT='$port'; `$env:LOCAL_TEST_ISOLATED='1'; `$env:LOCAL_SYNC_AUTO='false'; `$env:VITE_BACKEND_MODE='local'; npm run local:api"
  $apiProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

  $healthy = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -ErrorAction Stop
      if ($health.ok -eq $true -and $health.database -eq $database) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  Assert-True $healthy "Local payroll V2 API did not become healthy."

  # The bootstrap seed contains generic demo workers.  Keep them visible in
  # the database, but exclude them from this focused payroll fixture.
  Invoke-LocalSql "update local_workers set payroll_status='SUSPENDED' where employee_code in ('DAY-001','HOUR-001','PIECE-001','DEMO-LOCAL');"

  $suffix = Get-Date -Format "HHmmss"
  $group = Invoke-Json "POST" "/api/payroll/policy-groups" @{ code = "V2-$PID"; name = "Payroll V2 isolated"; description = "test"; reason = "isolated regression" }
  $workers = @(
    (Invoke-Json "POST" "/api/workers" @{ employee_code = "V2M-$PID"; display_name = "V2 Monthly $suffix"; worker_type = "HELPER" }),
    (Invoke-Json "POST" "/api/workers" @{ employee_code = "V2H-$PID"; display_name = "V2 Hourly $suffix"; worker_type = "CUTTER" }),
    (Invoke-Json "POST" "/api/workers" @{ employee_code = "V2P-$PID"; display_name = "V2 Piece $suffix"; worker_type = "SEWER" })
  )

  $bundles = @(
    (Invoke-Json "POST" "/api/payroll/worker-profile-bundle" @{ worker_id = $workers[0].id; compensation_type = "MONTHLY_HELPER"; payroll_policy_group_id = $group.id; effective_from = "2026-09-01"; primary_amount = 10000000; overtime_enabled = $true; allowances_enabled = $true; fixed_allowance_amount = 500000; insurance_enabled = $true; insurance_amount = 1000000; insurance_source_reference = "V2 isolated"; reason = "isolated regression"; idempotency_key = "v2-bundle-m-$PID" }),
    (Invoke-Json "POST" "/api/payroll/worker-profile-bundle" @{ worker_id = $workers[1].id; compensation_type = "HOURLY"; payroll_policy_group_id = $group.id; effective_from = "2026-09-01"; primary_amount = 50000; reason = "isolated regression"; idempotency_key = "v2-bundle-h-$PID" }),
    (Invoke-Json "POST" "/api/payroll/worker-profile-bundle" @{ worker_id = $workers[2].id; compensation_type = "PIECE_RATE"; payroll_policy_group_id = $group.id; effective_from = "2026-09-01"; piece_output_enabled = $true; reason = "isolated regression"; idempotency_key = "v2-bundle-p-$PID" })
  )
  foreach ($bundle in $bundles) {
    Invoke-Json "POST" "/api/payroll/compensation-assignments/$($bundle.assignment.id)/approve" @{ reason = "isolated regression" } | Out-Null
    if ($null -ne $bundle.rate) { Invoke-Json "POST" "/api/payroll/rates/$($bundle.rate.id)/approve" @{ reason = "isolated regression" } | Out-Null }
    Invoke-Json "POST" "/api/payroll/worker-profiles/$($bundle.profile.id)/approve" @{ reason = "isolated regression" } | Out-Null
    if ($null -ne $bundle.insurance) { Invoke-Json "POST" "/api/payroll/insurance/$($bundle.insurance.id)/approve" @{ reason = "isolated regression" } | Out-Null }
  }

  $day = Invoke-Json "POST" "/api/attendance" @{ worker_id = $workers[0].id; attendance_method = "DAY"; work_date = "2026-09-15"; day_units = 13; idempotency_key = "v2-day-$PID" }
  Assert-Decimal ([decimal]$day.calculated_amount) 5000000 0.01 "Monthly attendance formula is wrong"
  Invoke-Json "POST" "/api/attendance/status" @{ attendance_record_id = $day.id; target_status = "APPROVED"; reason = "isolated regression"; idempotency_key = "v2-day-status-$PID" } | Out-Null
  $lockedDay = Invoke-Json "POST" "/api/attendance/status" @{ attendance_record_id = $day.id; target_status = "LOCKED"; reason = "isolated locked-source regression"; idempotency_key = "v2-day-lock-$PID" }
  Assert-True ($lockedDay.status -eq "LOCKED") "Locked day attendance source was not retained as LOCKED"

  $hour = Invoke-Json "POST" "/api/attendance/hour" @{ worker_id = $workers[1].id; work_date = "2026-09-15"; check_in_time = "08:00"; check_out_time = "17:00"; break_minutes = 60; idempotency_key = "v2-hour-$PID" }
  Assert-Decimal ([decimal]$hour.attendance_value) 8 0.001 "Clock-derived hours are wrong"
  Assert-Decimal ([decimal]$hour.calculated_amount) 400000 0.01 "Hourly attendance formula is wrong"
  Invoke-Json "POST" "/api/attendance/status" @{ attendance_record_id = $hour.id; target_status = "APPROVED"; reason = "isolated regression"; idempotency_key = "v2-hour-status-$PID" } | Out-Null
  $lockedHour = Invoke-Json "POST" "/api/attendance/status" @{ attendance_record_id = $hour.id; target_status = "LOCKED"; reason = "isolated locked-source regression"; idempotency_key = "v2-hour-lock-$PID" }
  Assert-True ($lockedHour.status -eq "LOCKED") "Locked hourly attendance source was not retained as LOCKED"

  # The production picker resolves by the Excel-style piece-rate code, not a
  # CRM SKU. Create this isolated, approved rate explicitly instead of relying
  # on a historical seed whose effective date/code may legitimately change.
  $pieceRateCode = "TEST-V2-SEW-$PID"
  Invoke-LocalSql "insert into local_product_rates(product_id,rate,rate_unit,effective_from,status,piece_rate_code,piece_rate_name,reason) values(null,18000,'PIECE','2026-09-01','APPROVED','$pieceRateCode','V2 isolated sewing rate','isolated regression');"
  $product = Invoke-Json "GET" "/api/production/products?workDate=2026-09-15&search=$pieceRateCode" | Select-Object -First 1
  Assert-True ($null -ne $product -and $product.rate_available -eq $true -and $product.piece_rate_code -eq $pieceRateCode) "Piece-rate product fixture is missing its approved rate code"
  $entry = Invoke-Json "POST" "/api/production/entries" @{ worker_id = $workers[2].id; piece_rate_code = $pieceRateCode; work_date = "2026-09-15"; quantity = 10; idempotency_key = "v2-piece-$PID" }
  Assert-Decimal ([decimal]$entry.calculated_amount) 180000 0.01 "Piece-rate formula is wrong"
  Invoke-Json "POST" "/api/production/entries/status" @{ production_entry_id = $entry.id; target_status = "APPROVED"; reason = "isolated regression"; idempotency_key = "v2-piece-status-$PID" } | Out-Null
  $lockedEntry = Invoke-Json "POST" "/api/production/entries/status" @{ production_entry_id = $entry.id; target_status = "LOCKED"; reason = "isolated locked-source regression"; idempotency_key = "v2-piece-lock-$PID" }
  Assert-True ($lockedEntry.status -eq "LOCKED") "Locked production source was not retained as LOCKED"

  $overtime = Invoke-Json "POST" "/api/attendance/overtime" @{ worker_id = $workers[0].id; work_date = "2026-09-15"; overtime_type = "NORMAL_OVERTIME"; overtime_minutes = 120; reason = "isolated regression"; idempotency_key = "v2-overtime-$PID" }
  Invoke-Json "POST" "/api/attendance/overtime/status" @{ overtime_record_id = $overtime.id; target_status = "APPROVED"; reason = "isolated regression"; idempotency_key = "v2-overtime-status-$PID" } | Out-Null
  $lockedOvertime = Invoke-Json "POST" "/api/attendance/overtime/status" @{ overtime_record_id = $overtime.id; target_status = "LOCKED"; reason = "isolated locked-source regression"; idempotency_key = "v2-overtime-lock-$PID" }
  Assert-True ($lockedOvertime.status -eq "LOCKED") "Locked overtime source was not retained as LOCKED"

  # Payroll must retain immutable source facts after APPROVED advances to LOCKED.
  $preflight = Invoke-Json "GET" "/api/payroll/preflight?period_start=2026-09-01&period_end=2026-09-30&standard_days=26"
  Assert-True ($preflight.is_ready -eq $true -and [int]$preflight.blocking_count -eq 0) "Payroll preflight unexpectedly blocks the isolated fixture"
  $initialRunKey = "v2-run-$PID"
  $run = Invoke-Json "POST" "/api/payroll/runs" @{ period_start = "2026-09-01"; period_end = "2026-09-30"; standard_days = 26; idempotency_key = $initialRunKey }
  $initialRunId = [string]$run.id
  Assert-True ([int]$run.record_count -eq 3) "Payroll run must contain all active fixture workers"
  Assert-True ([int]$run.blocking_exception_count -eq 0) "Payroll preview has unexpected blocking exceptions"
  Assert-Decimal ([decimal]$run.gross_total) 6224230.769231 0.01 "Gross payroll total is wrong"
  Assert-Decimal ([decimal]$run.deductions_total) 1000000 0.01 "Payroll deduction total is wrong"
  Assert-Decimal ([decimal]$run.payment_total) 5224231 0.01 "Payroll rounding total is wrong"
  $overtimeItem = @($run.items | Where-Object item_type -eq "OVERTIME_PAY") | Select-Object -First 1
  Assert-True ($null -ne $overtimeItem -and $overtimeItem.details.rate_snapshot.attendance_method -eq "DAY" -and [decimal]$overtimeItem.details.calendar_snapshot.standard_days -eq 26 -and [decimal]$overtimeItem.details.calendar_snapshot.daily_minutes -eq 480 -and [decimal]$overtimeItem.details.rule_snapshot.multiplier -eq 1.5) "Monthly overtime must use its approved monthly base, calendar and explicit multiplier snapshots"
  foreach ($source in @(
    @{ Id = [string]$day.id; Label = "day attendance" },
    @{ Id = [string]$hour.id; Label = "hour attendance" },
    @{ Id = [string]$entry.id; Label = "production entry" },
    @{ Id = [string]$overtime.id; Label = "overtime" }
  )) {
    Assert-True (@($run.items | Where-Object { [string]$_.source_id -eq $source.Id }).Count -gt 0) "LOCKED $($source.Label) was omitted from the payroll preview"
  }

  # A caller can retain a now-inactive worker id while the page is refreshing.
  # A suspended worker with earned approved facts remains eligible for settlement.
  # Excluding those facts would silently drop the known 180000 piece payment.
  Invoke-LocalSql "update local_workers set payroll_status='SUSPENDED' where id='$($workers[2].id)';"
  $scopeIds = @([string]$workers[0].id, [string]$workers[1].id)
  $scopedRequestIds = @($scopeIds + [string]$workers[2].id)
  $scopeCsv = $scopedRequestIds -join ","
  $scopedPreflight = Invoke-Json "GET" "/api/payroll/preflight?period_start=2026-09-01&period_end=2026-09-30&standard_days=26&worker_ids=$scopeCsv"
  Assert-True ($scopedPreflight.is_ready -eq $true -and @($scopedPreflight.workers).Count -eq 3) "Scoped payroll preflight must retain the suspended worker's earned settlement"
  Assert-True (@($scopedPreflight.requested_worker_ids).Count -eq 3 -and @($scopedPreflight.resolved_worker_ids).Count -eq 3 -and @($scopedPreflight.resolved_worker_ids) -contains [string]$workers[2].id) "Inactive worker with approved facts was omitted from settlement"
  $emptyScopePreflight = Invoke-Json "GET" "/api/payroll/preflight?period_start=2026-09-01&period_end=2026-09-30&standard_days=26&worker_ids="
  Assert-True ($emptyScopePreflight.is_ready -eq $false -and @($emptyScopePreflight.issues | Where-Object code -eq "NO_ACTIVE_WORKERS").Count -eq 1) "An explicit empty payroll scope must not fall back to all employees"
  $scopedKey = "v2-scoped-run-$PID"
  $scopedRun = Invoke-Json "POST" "/api/payroll/runs" @{ period_start = "2026-09-01"; period_end = "2026-09-30"; standard_days = 26; worker_ids = $scopedRequestIds; idempotency_key = $scopedKey }
  Assert-True ([int]$scopedRun.record_count -eq 3) "Scoped payroll run must include all three employees with earned facts"
  Assert-True (@($scopedRun.items | Where-Object { [string]$_.worker_id -eq [string]$workers[2].id -and [string]$_.source_id -eq [string]$entry.id }).Count -eq 1) "Suspended employee's approved production source must be paid exactly once"
  Assert-True (@($scopedRun.config_snapshot.worker_scope.requested_worker_ids) -contains [string]$workers[2].id -and @($scopedRun.config_snapshot.worker_scope.resolved_worker_ids) -contains [string]$workers[2].id) "Payroll scope snapshot must retain settlement worker"
  Assert-Decimal ([decimal]$scopedRun.gross_total) 6224230.769231 0.01 "Suspended settlement must retain the original full-source financial total"
  $scopeConflict = $false
  try {
    Invoke-Json "POST" "/api/payroll/runs" @{ period_start = "2026-09-01"; period_end = "2026-09-30"; standard_days = 26; worker_ids = @([string]$workers[0].id, [string]$workers[2].id); idempotency_key = $scopedKey } | Out-Null
  } catch {
    $scopeConflict = $true
  }
  Assert-True $scopeConflict "Reusing an idempotency key with a different payroll scope must fail"
  # Add a real eligible employee after preview creation: locking the partial
  # run must still refuse to close the whole period for that employee.
  $lockGuardWorker = Invoke-Json "POST" "/api/workers" @{ employee_code = "V2L-$PID"; display_name = "V2 Lock Guard $suffix"; worker_type = "HELPER" }
  $scopeLockRejected = $false
  try {
    Invoke-RestMethod -Method "POST" -Uri "http://127.0.0.1:$port/api/payroll/runs/$($scopedRun.id)/lock" -Headers (Get-LocalAuthHeaders "http://127.0.0.1:$port") -ContentType "application/json" -Body "{}" -ErrorAction Stop | Out-Null
  } catch {
    $scopeLockRejected = ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409)
  }
  Assert-True $scopeLockRejected "Locking a scoped run that omits a real active worker must return HTTP 409"
  Invoke-LocalSql "update local_workers set payroll_status='SUSPENDED' where id='$($lockGuardWorker.id)';"

  # A recalculation keeps the first snapshot immutable but marks it as history
  # so the operator has exactly one active preview for an open period.
  $recalculated = Invoke-Json "POST" "/api/payroll/runs" @{ period_start = "2026-09-01"; period_end = "2026-09-30"; standard_days = 26; idempotency_key = "v2-rerun-$PID" }
  Assert-True ($recalculated.status -eq "PREVIEW" -and [int]$recalculated.run_number -eq 3) "Payroll recalculation did not create the next preview run"
  $superseded = Invoke-Json "GET" "/api/payroll/runs/$($run.id)"
  Assert-True ($superseded.status -eq "SUPERSEDED") "Previous payroll preview was not marked superseded"
  $run = $recalculated

  $locked = Invoke-Json "POST" "/api/payroll/runs/$($run.id)/lock" @{}
  Assert-True ($locked.status -eq "LOCKED") "Payroll run did not lock"
  $deactivatedRetry = Invoke-Json "POST" "/api/payroll/runs" @{ period_start = "2026-09-01"; period_end = "2026-09-30"; standard_days = 26; idempotency_key = $initialRunKey }
  Assert-True ([string]$deactivatedRetry.id -eq $initialRunId -and [int]$deactivatedRetry.record_count -eq 3) "Idempotent payroll retry did not return its original snapshot after a worker deactivated"
  $blockedAfterLock = $false
  try {
    Invoke-Json "POST" "/api/attendance/overtime" @{ worker_id = $workers[0].id; work_date = "2026-09-15"; overtime_type = "NORMAL_OVERTIME"; overtime_minutes = 60; reason = "must fail after lock"; idempotency_key = "v2-after-lock-$PID" } | Out-Null
  } catch {
    $blockedAfterLock = $true
  }
  Assert-True $blockedAfterLock "Locked payroll accepted a new overtime source row"

  Write-Host ("Local payroll V2 regression passed: records={0}, gross={1}, deductions={2}, payment={3}" -f $run.record_count, $run.gross_total, $run.deductions_total, $run.payment_total)
}
finally {
  Stop-TestApi
  Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $database" *> $null
}
