$ErrorActionPreference = "Stop"

# Isolated local API regression test. The temporary database, API process, and
# log files are owned by this script and are removed in finally.
$projectRoot = Split-Path -Parent $PSScriptRoot
$container = "crm-joliefam-local-postgres"
$database = "crm_local_attendance_scope_$PID"
$port = 8891 + ($PID % 100)
$databaseUrl = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/$database"
$stdoutPath = Join-Path $projectRoot ".attendance-scope-test-$PID.stdout.log"
$stderrPath = Join-Path $projectRoot ".attendance-scope-test-$PID.stderr.log"
$apiProcess = $null

function Invoke-LocalSql([string]$sql) {
  & docker exec $container psql -U crm_local -d $database -v ON_ERROR_STOP=1 -c $sql *> $null
  if ($LASTEXITCODE -ne 0) { throw "Local SQL test command failed." }
}

function Get-JsonError([System.Management.Automation.ErrorRecord]$errorRecord) {
  $detail = $errorRecord.ErrorDetails.Message
  if ($detail) {
    try { return (($detail | ConvertFrom-Json).message) } catch { }
  }
  return $errorRecord.Exception.Message
}

function Invoke-Api([string]$method, [string]$path, [hashtable]$headers, [hashtable]$body = $null, [int]$expected = 200) {
  $params = @{ Method = $method; Uri = "http://127.0.0.1:$port$path"; Headers = $headers; ErrorAction = "Stop" }
  if ($null -ne $body) {
    $params.ContentType = "application/json"
    $params.Body = $body | ConvertTo-Json -Depth 20
  }
  try {
    $response = Invoke-RestMethod @params
    if ($expected -ne 200 -and $expected -ne 201) { throw "Expected HTTP $expected for $method $path, got HTTP 2xx." }
    return $response
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    if ($status -ne $expected) {
      throw "Expected HTTP $expected for $method $path, got HTTP ${status}: $(Get-JsonError $_)"
    }
    return $null
  }
}

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
}

function New-Headers([string]$token) {
  return @{ Authorization = "Bearer $token"; Origin = "http://127.0.0.1:8090" }
}

function Stop-TestApi {
  if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
    & taskkill.exe /PID $apiProcess.Id /T /F *> $null
    $null = $apiProcess.WaitForExit(5000)
  }
}

try {
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database" *> $null
  if ($LASTEXITCODE -ne 0) { throw "Could not create isolated attendance scope database." }

  $command = "`$env:LOCAL_DATABASE_URL='$databaseUrl'; `$env:LOCAL_API_PORT='$port'; npm run local:api"
  $apiProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

  $healthy = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    try {
      $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -ErrorAction Stop
      if ($health.ok -eq $true) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  Assert-True $healthy "Local attendance scope API did not become healthy."

  $origin = @{ Origin = "http://127.0.0.1:8090" }
  $adminSession = Invoke-Api "GET" "/api/local-auth/session" $origin
  $admin = New-Headers $adminSession.token
  Invoke-Api "POST" "/API/ATTENDANCE/status" $origin @{ attendance_record_id = "00000000-0000-0000-0000-000000000000"; target_status = "APPROVED"; reason = "must fail unauthenticated"; idempotency_key = "scope-uppercase-unauth-$PID" } 401 | Out-Null
  Invoke-Api "GET" "/api/rates/" $origin $null 401 | Out-Null
  Invoke-Api "GET" "/api/payroll/runs" $origin $null 401 | Out-Null
  Invoke-Api "GET" "/api/payroll/bank-accounts" $origin $null 401 | Out-Null
  $suffix = "$PID-$(Get-Date -Format HHmmss)"
  $password = "ScopeTest-$PID!"

  $employee = Invoke-Api "POST" "/api/users" $admin @{ email = "scope.employee.$suffix@local.test"; password = $password; first_name = "Scope"; last_name = "Employee"; role = "employee" } 201
  $leader = Invoke-Api "POST" "/api/users" $admin @{ email = "scope.leader.$suffix@local.test"; password = $password; first_name = "Scope"; last_name = "Leader"; role = "team_leader" } 201
  $leaderNoPermission = Invoke-Api "POST" "/api/users" $admin @{ email = "scope.no-permission.$suffix@local.test"; password = $password; first_name = "Scope"; last_name = "No Permission"; role = "team_leader" } 201
  $outsideLeader = Invoke-Api "POST" "/api/users" $admin @{ email = "scope.outside.$suffix@local.test"; password = $password; first_name = "Scope"; last_name = "Outside"; role = "team_leader" } 201

  $employeeWorker = Invoke-Api "POST" "/api/workers" $admin @{ employee_code = "SCOPE-E-$suffix"; display_name = "Scope Employee"; worker_type = "HELPER" } 201
  $teamWorker = Invoke-Api "POST" "/api/workers" $admin @{ employee_code = "SCOPE-T-$suffix"; display_name = "Scope Team Worker"; worker_type = "HELPER" } 201
  $outsideWorker = Invoke-Api "POST" "/api/workers" $admin @{ employee_code = "SCOPE-O-$suffix"; display_name = "Scope Outside Worker"; worker_type = "HELPER" } 201
  $leaderWorker = Invoke-Api "POST" "/api/workers" $admin @{ employee_code = "SCOPE-L-$suffix"; display_name = "Scope Team Leader"; worker_type = "HELPER" } 201
  $noPermissionWorker = Invoke-Api "POST" "/api/workers" $admin @{ employee_code = "SCOPE-N-$suffix"; display_name = "Scope No Permission"; worker_type = "HELPER" } 201
  $outsideLeaderWorker = Invoke-Api "POST" "/api/workers" $admin @{ employee_code = "SCOPE-X-$suffix"; display_name = "Scope Outside Leader"; worker_type = "HELPER" } 201

  Invoke-LocalSql @"
update local_workers set user_id='$($employee.user_id)' where id='$($employeeWorker.id)';
update local_workers set user_id='$($leader.user_id)' where id='$($leaderWorker.id)';
update local_workers set user_id='$($leaderNoPermission.user_id)' where id='$($noPermissionWorker.id)';
update local_workers set user_id='$($outsideLeader.user_id)' where id='$($outsideLeaderWorker.id)';
insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,reason,created_by)
values('$($leaderWorker.id)','$($teamWorker.id)',current_date - 30,'isolated role scope test','local-admin'),
('$($noPermissionWorker.id)','$($teamWorker.id)',current_date - 30,'isolated role scope test','local-admin');
insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason)
values('$($leader.user_id)','production_attendance_approve',true,'local-admin','isolated role scope test'),
('$($outsideLeader.user_id)','production_attendance_approve',true,'local-admin','isolated role scope test'),
('$($employee.user_id)','production_attendance_view',true,'local-admin','isolated role scope test');
insert into local_worker_rates(worker_id,compensation_type,attendance_method,rate_amount,effective_from,reason)
select id,'MONTHLY_HELPER','DAY',2600000,current_date - 30,'isolated role scope test'
from local_workers where employee_code like 'SCOPE-%';
"@

  $employeeSession = Invoke-Api "POST" "/api/local-auth/login" $origin @{ email = $employee.email; password = $password }
  $leaderSession = Invoke-Api "POST" "/api/local-auth/login" $origin @{ email = $leader.email; password = $password }
  $noPermissionSession = Invoke-Api "POST" "/api/local-auth/login" $origin @{ email = $leaderNoPermission.email; password = $password }
  $outsideLeaderSession = Invoke-Api "POST" "/api/local-auth/login" $origin @{ email = $outsideLeader.email; password = $password }
  $employeeHeaders = New-Headers $employeeSession.token
  $leaderHeaders = New-Headers $leaderSession.token
  $noPermissionHeaders = New-Headers $noPermissionSession.token
  $outsideLeaderHeaders = New-Headers $outsideLeaderSession.token

  # Identity reads: an employee may inspect only their own permission rows.
  $ownPermissions = Invoke-Api "GET" "/api/users/$($employee.user_id)/permissions" $employeeHeaders
  Assert-True (@($ownPermissions).Count -eq 1 -and $ownPermissions.user_id -eq $employee.user_id) "Employee could not read own explicit permission row."
  Invoke-Api "GET" "/api/users/$($leader.user_id)/permissions" $employeeHeaders $null 403 | Out-Null

  # Self-service reads/writes are always tied to the linked worker.
  $ownRows = Invoke-Api "GET" "/api/my-attendance?month=$(Get-Date -Format yyyy-MM)" $employeeHeaders
  Assert-True ($ownRows.worker.id -eq $employeeWorker.id) "Employee self attendance returned the wrong worker."
  Invoke-Api "POST" "/api/attendance" $employeeHeaders @{ worker_id = $teamWorker.id; attendance_method = "DAY"; work_date = (Get-Date).AddDays(-2).ToString("yyyy-MM-dd"); day_units = 1; idempotency_key = "scope-generic-other-$suffix" } 403 | Out-Null
  Invoke-Api "POST" "/api/attendance/status/" $employeeHeaders @{ attendance_record_id = "00000000-0000-0000-0000-000000000000"; target_status = "APPROVED"; reason = "must fail trailing route"; idempotency_key = "scope-trailing-employee-$suffix" } 403 | Out-Null
  Invoke-Api "GET" "/api/payroll/runs" $employeeHeaders $null 403 | Out-Null
  Invoke-Api "GET" "/api/payroll/bank-accounts" $employeeHeaders $null 403 | Out-Null
  Invoke-Api "GET" "/api/rates/" $employeeHeaders $null 403 | Out-Null
  $selfRecord = Invoke-Api "POST" "/api/attendance" $employeeHeaders @{ worker_id = $employeeWorker.id; attendance_method = "DAY"; work_date = (Get-Date).AddDays(-4).ToString("yyyy-MM-dd"); day_units = 1; idempotency_key = "scope-own-generic-$suffix" } 201
  Assert-True ([bool]$selfRecord.id) "Employee generic create failed for their own linked worker."

  $workDate = (Get-Date).AddDays(-2).ToString("yyyy-MM-dd")
  $employeeRecord = Invoke-Api "POST" "/api/attendance" $admin @{ worker_id = $employeeWorker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = "scope-replay-$suffix" } 201
  # A replay made by a different actor must be rejected even with the same payload.
  Invoke-Api "POST" "/api/attendance" $employeeHeaders @{ worker_id = $employeeWorker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = "scope-replay-$suffix" } 409 | Out-Null
  $teamRecord = Invoke-Api "POST" "/api/attendance" $admin @{ worker_id = $teamWorker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = "scope-team-$suffix" } 201
  $outsideRecord = Invoke-Api "POST" "/api/attendance" $admin @{ worker_id = $outsideWorker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = "scope-outside-$suffix" } 201
  $leaderRecord = Invoke-Api "POST" "/api/attendance" $admin @{ worker_id = $leaderWorker.id; attendance_method = "DAY"; work_date = $workDate; day_units = 1; idempotency_key = "scope-leader-$suffix" } 201

  # Team leader may approve an assigned worker, but not an outside worker or self.
  $approved = Invoke-Api "POST" "/api/attendance/status" $leaderHeaders @{ attendance_record_id = $teamRecord.id; target_status = "APPROVED"; reason = "isolated team approval"; idempotency_key = "scope-approve-team-$suffix" }
  Assert-True ($approved.status -eq "APPROVED") "Team leader could not approve an assigned team worker."
  Invoke-Api "POST" "/api/attendance/status" $outsideLeaderHeaders @{ attendance_record_id = $teamRecord.id; target_status = "APPROVED"; reason = "isolated team approval"; idempotency_key = "scope-approve-team-$suffix" } 409 | Out-Null
  Invoke-Api "POST" "/api/attendance/status" $leaderHeaders @{ attendance_record_id = $outsideRecord.id; target_status = "APPROVED"; reason = "must fail outside team"; idempotency_key = "scope-approve-outside-$suffix" } 403 | Out-Null
  Invoke-Api "POST" "/api/attendance/status" $leaderHeaders @{ attendance_record_id = $leaderRecord.id; target_status = "APPROVED"; reason = "must fail self approval"; idempotency_key = "scope-approve-self-$suffix" } 403 | Out-Null
  Invoke-Api "POST" "/api/attendance/status" $noPermissionHeaders @{ attendance_record_id = $teamRecord.id; target_status = "APPROVED"; reason = "must fail missing permission"; idempotency_key = "scope-approve-no-permission-$suffix" } 403 | Out-Null
  Invoke-Api "POST" "/api/attendance/status" $leaderHeaders @{ attendance_record_id = $outsideRecord.id; target_status = "LOCKED"; reason = "must fail leader lock"; idempotency_key = "scope-lock-outside-$suffix" } 403 | Out-Null
  Invoke-Api "POST" "/api/attendance/$($teamRecord.id)/reverse" $leaderHeaders @{ reason = "must fail leader reverse"; idempotency_key = "scope-reverse-team-$suffix" } 403 | Out-Null
  $madeByLeader = Invoke-Api "POST" "/api/attendance" $leaderHeaders @{ worker_id = $teamWorker.id; attendance_method = "DAY"; work_date = (Get-Date).AddDays(-3).ToString("yyyy-MM-dd"); day_units = 1; idempotency_key = "scope-made-by-leader-$suffix" } 201
  Invoke-Api "POST" "/api/attendance/status" $leaderHeaders @{ attendance_record_id = $madeByLeader.id; target_status = "APPROVED"; reason = "must fail maker approval"; idempotency_key = "scope-maker-approve-$suffix" } 403 | Out-Null

  # A previously accepted key cannot bypass a permission subsequently revoked.
  Invoke-LocalSql "update local_employee_permissions set enabled=false where user_id='$($leader.user_id)' and permission_type='production_attendance_approve';"
  Invoke-Api "POST" "/api/attendance/status" $leaderHeaders @{ attendance_record_id = $teamRecord.id; target_status = "APPROVED"; reason = "isolated team approval"; idempotency_key = "scope-approve-team-$suffix" } 403 | Out-Null
  Invoke-LocalSql "update local_employee_permissions set enabled=true where user_id='$($leader.user_id)' and permission_type='production_attendance_approve';"

  # Team leader cannot reopen a day closure; admin creates the closure fixture.
  Invoke-Api "POST" "/api/attendance/closures" $admin @{ worker_id = $teamWorker.id; work_date = $workDate; target_status = "EMPLOYEE_CONFIRMED"; reason = "isolated closure"; idempotency_key = "scope-close-employee-$suffix" } | Out-Null
  Invoke-Api "POST" "/api/attendance/closures" $admin @{ worker_id = $teamWorker.id; work_date = $workDate; target_status = "LEADER_CONFIRMED"; reason = "isolated closure"; idempotency_key = "scope-close-leader-$suffix" } | Out-Null
  Invoke-Api "POST" "/api/attendance/closures" $leaderHeaders @{ worker_id = $teamWorker.id; work_date = $workDate; target_status = "REOPENED"; reason = "must fail leader reopen"; idempotency_key = "scope-reopen-team-$suffix" } 403 | Out-Null

  # Read scope: employee sees only own rows; team leader sees self + assigned team.
  $scopeMonth = $workDate.Substring(0, 7)
  $employeeRows = Invoke-Api "GET" "/api/attendance?month=$scopeMonth" $employeeHeaders
  Assert-True (@($employeeRows.rows | Where-Object worker_id -ne $employeeWorker.id).Count -eq 0) "Employee attendance GET leaked another worker."
  $leaderRows = Invoke-Api "GET" "/api/attendance?month=$scopeMonth" $leaderHeaders
  Assert-True (@($leaderRows.rows | Where-Object worker_id -eq $teamWorker.id).Count -gt 0) "Team leader attendance GET omitted assigned team worker."
  Assert-True (@($leaderRows.rows | Where-Object worker_id -eq $outsideWorker.id).Count -eq 0) "Team leader attendance GET leaked outside worker."
  $employeeHistory = Invoke-Api "GET" "/api/attendance/history?month=$scopeMonth" $employeeHeaders
  Assert-True (@($employeeHistory | Where-Object worker_id -ne $employeeWorker.id).Count -eq 0) "Employee attendance history leaked another worker."
  $leaderHistory = Invoke-Api "GET" "/api/attendance/history?month=$scopeMonth" $leaderHeaders
  Assert-True (@($leaderHistory | Where-Object worker_id -eq $outsideWorker.id).Count -eq 0) "Team leader attendance history leaked outside worker."
  Invoke-Api "GET" "/api/payroll/runs" $employeeHeaders $null 403 | Out-Null
  Invoke-Api "GET" "/api/payroll/runs" $leaderHeaders $null 403 | Out-Null

  # Revoked user sessions must fail closed. No admin fallback is possible.
  Invoke-LocalSql "update local_auth_sessions set expires_at=now() - interval '1 minute' where user_id='$($employee.user_id)';"
  Invoke-Api "GET" "/api/my-attendance?month=$(Get-Date -Format yyyy-MM)" $employeeHeaders $null 401 | Out-Null

  Write-Host "Local attendance role/scope regression passed: self scope, team approval, review restrictions, replay actor binding, read scope, and revoked-session fail-closed behavior."
}
finally {
  Stop-TestApi
  Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $database" *> $null
}
