$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$containerName = "crm-factory-attendance-acl-$PID"
$image = "public.ecr.aws/supabase/postgres:17.6.1.159"
$started = $false

function Assert-NativeSuccess([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
}

try {
  docker run --rm -d --name $containerName -e POSTGRES_PASSWORD=test -e POSTGRES_DB=postgres $image | Out-Null
  Assert-NativeSuccess "Starting isolated PostgreSQL"
  $started = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    docker exec $containerName pg_isready -U postgres -d postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Isolated PostgreSQL did not become ready" }
  Start-Sleep -Seconds 2

  docker exec $containerName psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY, email text); GRANT USAGE, CREATE ON SCHEMA auth TO postgres; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO postgres;" | Out-Null
  Assert-NativeSuccess "Preparing auth schema"

  $files = @(
    "supabase/tests/cost_management_bootstrap.sql",
    "supabase/migrations/20260824150000_cost_management_foundation.sql",
    "supabase/migrations/20260824160000_cost_management_security_fixes.sql",
    "supabase/migrations/20260824170000_inventory_material_costing_foundation.sql",
    "supabase/migrations/20260825090000_inventory_hardening.sql",
    "supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql",
    "supabase/migrations/20260826120000_production_execution_foundation.sql",
    "supabase/migrations/20260828100000_production_execution_hardening.sql",
    "supabase/migrations/20260829090000_labor_costing_foundation.sql",
    "supabase/migrations/20260829110000_production_attendance_foundation.sql",
    "supabase/migrations/20260829130000_production_attendance_hardening.sql",
    "supabase/migrations/20260829150000_factory_attendance_independent.sql",
    "supabase/migrations/20260829170000_factory_attendance_time_clock.sql",
    "supabase/migrations/20260906090000_payroll_master_data_foundation.sql",
    "supabase/migrations/20260906100000_payroll_master_data_security_workflow_hardening.sql",
    "supabase/migrations/20260906110000_payroll_master_data_completion.sql",
    "supabase/migrations/20260906120000_payroll_master_data_immutability_and_audit.sql",
    "supabase/migrations/20260907100000_factory_attendance_workflow.sql",
    "supabase/migrations/20260907120000_factory_attendance_concurrency_hardening.sql",
    "supabase/migrations/20260907130000_factory_attendance_day_status.sql",
    "supabase/migrations/20260907140000_factory_attendance_invariant_guards.sql",
    "supabase/migrations/20260907150000_factory_attendance_status_consistency.sql",
    "supabase/migrations/20260907160000_factory_attendance_rejected_fact_closure_hardening.sql",
    "supabase/migrations/20260907170000_factory_attendance_acl_hardening.sql",
    "supabase/migrations/20260907180000_factory_attendance_scope_hardening.sql",
    "supabase/migrations/20260907190000_factory_attendance_scope_completion.sql",
    "supabase/migrations/20260907200000_factory_attendance_hour_entry_guard.sql",
    "supabase/migrations/20260907210000_factory_attendance_team_approval.sql",
    "supabase/migrations/20260907220000_factory_attendance_rate_resolution_boundary.sql"
  )
  foreach ($file in $files) {
    $applied = $false
    for ($attempt = 0; $attempt -lt 3 -and -not $applied; $attempt++) {
      Get-Content -Raw (Join-Path $projectRoot $file) |
        docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres | Out-Null
      if ($LASTEXITCODE -eq 0) { $applied = $true } else { Start-Sleep -Seconds 2 }
    }
    if (-not $applied) { throw "Applying $file failed" }
  }

  Get-Content -Raw (Join-Path $projectRoot "supabase/tests/factory_attendance_acl_test.sql") |
    docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres
  Assert-NativeSuccess "Running factory attendance ACL test"
  Write-Host "factory_attendance_acl_test: PASS"
}
finally {
  if ($started) { docker stop $containerName *> $null }
}
