$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "docs/attendance-payroll-operations/chain-manifest.tsv"
$containerName = "crm-attendance-payroll-chain-$PID"
$image = "public.ecr.aws/supabase/postgres:17.6.1.159"
$containerCreated = $false

function Assert-NativeSuccess([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
}

function Assert-File([string]$relativePath) {
  $path = Join-Path $projectRoot $relativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required file is missing: $relativePath"
  }
}

function Invoke-SqlFile([string]$relativePath, [string]$label) {
  $path = Join-Path $projectRoot $relativePath
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    Get-Content -Raw -LiteralPath $path | & docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres
    Assert-NativeSuccess $label
  } finally {
    $timer.Stop()
    Write-Host ("{0} [{1:N0} ms]" -f $label, $timer.Elapsed.TotalMilliseconds)
  }
}

function Invoke-ProductionConcurrencyTest {
  $keys = @('prod-concurrent-tolerance-a', 'prod-concurrent-tolerance-b')
  $jobs = $keys | ForEach-Object {
    Start-Job -ScriptBlock {
      param($targetContainer, $idempotencyKey)
      $query = "SELECT public.production_test_confirm_result((SELECT id FROM public.inventory_documents WHERE idempotency_key='$idempotencyKey'), '80000000-0000-0000-0000-000000000001'::uuid);"
      $output = @(& docker exec $targetContainer psql -X -q -t -A -v ON_ERROR_STOP=1 -U postgres -d postgres -c $query 2>&1)
      if ($LASTEXITCODE -ne 0) { throw "Concurrent production issue failed for $idempotencyKey" }
      [pscustomobject]@{ Key = $idempotencyKey; Result = (($output -join "`n").Trim() | ConvertFrom-Json) }
    } -ArgumentList $containerName, $_
  }
  try {
    $jobs | Wait-Job | Out-Null
    $results = @($jobs | Receive-Job)
    if (@($jobs | Where-Object State -ne 'Completed').Count -ne 0) {
      throw "Concurrent production issue job failed"
    }
    if (@($results | Where-Object { $_.Result.success -eq $true }).Count -ne 1) {
      throw "Concurrent production issue test expected exactly one successful confirmation"
    }
    $rejected = @($results | Where-Object { $_.Result.success -eq $false })
    if ($rejected.Count -ne 1 -or $rejected[0].Result.error -notmatch 'dung sai') {
      throw "Competing production issue was not rejected by the material tolerance guard"
    }
  }
  finally {
    $jobs | Remove-Job -Force
  }

  & docker exec $containerName psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT public.production_test_assert_concurrent_issue_results();" | Out-Null
  Assert-NativeSuccess "Checking production material tolerance concurrency"
  Write-Host "production_execution_concurrency_test: PASS"
}

function Invoke-PostChainSmoke {
  $relativePath = "docs/attendance-payroll-operations/post-chain-smoke.sql"
  $path = Join-Path $projectRoot $relativePath
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $output = @(Get-Content -Raw -LiteralPath $path | & docker exec -i $containerName psql -X --csv -v ON_ERROR_STOP=1 -U postgres -d postgres)
    Assert-NativeSuccess "Run read-only post-chain smoke"
    $rows = @(($output -join [Environment]::NewLine) | ConvertFrom-Csv)
    $final = @($rows | Where-Object { $_.check_name -eq 'FINAL' })
    if ($final.Count -ne 1 -or $final[0].status -ne 'OK' -or $final[0].actual -ne 'OK') {
      throw "Post-chain smoke FINAL status is FAIL or missing"
    }
    $output | Write-Host
    Write-Host "post_chain_smoke: PASS"
  } finally {
    $timer.Stop()
    Write-Host ("{0} [{1:N0} ms]" -f "Run read-only post-chain smoke", $timer.Elapsed.TotalMilliseconds)
  }
}

try {
  Assert-File "supabase/tests/cost_management_bootstrap.sql"
  Assert-File "supabase/tests/production_execution_test.sql"
  Assert-File "supabase/tests/payroll_master_data_pre_hardening_fixture.sql"
  Assert-File "supabase/tests/attendance_payroll_chain_assert.sql"
  Assert-File "supabase/tests/labor_costing_test.sql"
  Assert-File "supabase/tests/payroll_master_data_test.sql"
  Assert-File "supabase/tests/factory_attendance_acl_test.sql"
  Assert-File "supabase/tests/production_workflow_mvp_operations_test.sql"
  Assert-File "docs/attendance-payroll-operations/post-chain-smoke.sql"
  Assert-File "docs/attendance-payroll-operations/chain-manifest.tsv"

  $targetRows = @(Get-Content -LiteralPath $manifestPath | Where-Object {
    $_.Trim() -and -not $_.StartsWith("#") -and -not $_.StartsWith("migration_file`t")
  } | ConvertFrom-Csv -Delimiter "`t" -Header migration_file,family,gate_type,reconcile_key,notes)
  if ($targetRows.Count -ne 17) { throw "Manifest must contain exactly 17 target migrations; found $($targetRows.Count)" }
  foreach ($row in $targetRows) { Assert-File ("supabase/migrations/{0}" -f $row.migration_file) }

  & docker run --rm -d --name $containerName -e POSTGRES_PASSWORD=test -e POSTGRES_DB=postgres $image | Out-Null
  $runExitCode = $LASTEXITCODE
  if ($runExitCode -ne 0) { throw "Starting isolated PostgreSQL failed with exit code $runExitCode" }
  $containerCreated = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec $containerName pg_isready -U postgres -d postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Isolated PostgreSQL did not become ready" }
  Start-Sleep -Seconds 2

  & docker exec $containerName psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY, email text); GRANT USAGE, CREATE ON SCHEMA auth TO postgres; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO postgres;" | Out-Null
  Assert-NativeSuccess "Preparing auth schema"

  $prerequisites = @(
    "supabase/tests/cost_management_bootstrap.sql",
    "supabase/migrations/20260824150000_cost_management_foundation.sql",
    "supabase/migrations/20260824160000_cost_management_security_fixes.sql",
    "supabase/migrations/20260824170000_inventory_material_costing_foundation.sql",
    "supabase/migrations/20260825090000_inventory_hardening.sql",
    "supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql",
    "supabase/migrations/20260826120000_production_execution_foundation.sql",
    "supabase/migrations/20260828100000_production_execution_hardening.sql",
    "supabase/tests/production_execution_test.sql",
    "supabase/migrations/20260829090000_labor_costing_foundation.sql",
    "supabase/migrations/20260829110000_production_attendance_foundation.sql",
    "supabase/migrations/20260829130000_production_attendance_hardening.sql",
    "supabase/migrations/20260829150000_factory_attendance_independent.sql"
  )
  foreach ($file in $prerequisites) { Assert-File $file; Invoke-SqlFile $file "Apply $file" }
  Invoke-ProductionConcurrencyTest
  foreach ($row in $targetRows) {
    Invoke-SqlFile ("supabase/migrations/{0}" -f $row.migration_file) "Apply $($row.migration_file)"
    if ($row.migration_file -eq "20260906090000_payroll_master_data_foundation.sql") {
      Invoke-SqlFile "supabase/tests/payroll_master_data_pre_hardening_fixture.sql" "Apply payroll pre-hardening fixture"
    }
  }

  # The production attendance UI also consumes the order/batch/stage workflow.
  # Apply that append-only chain after payroll and factory-attendance foundations
  # so the local smoke environment matches the application dependency order.
  foreach ($file in @(
    "supabase/migrations/20260911100000_production_entries_foundation.sql",
    "supabase/migrations/20260913100000_production_workflow_mvp_foundation.sql",
    "supabase/migrations/20260913110000_production_workflow_mvp_hardening.sql",
    "supabase/migrations/20260913120000_production_workflow_mvp_operations.sql"
  )) { Invoke-SqlFile $file "Apply $file" }

  foreach ($test in @(
    "supabase/tests/attendance_payroll_chain_assert.sql",
    "supabase/tests/labor_costing_test.sql",
    "supabase/tests/payroll_master_data_test.sql",
    "supabase/tests/factory_attendance_acl_test.sql",
    "supabase/tests/production_workflow_mvp_operations_test.sql"
  )) { Invoke-SqlFile $test "Run $test"; Write-Host ("{0}: PASS" -f [IO.Path]::GetFileNameWithoutExtension($test)) }
  Invoke-PostChainSmoke
}
finally {
  if ($containerCreated) {
    & docker rm -f $containerName *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Failed to remove isolated PostgreSQL container $containerName"
    }
  }
}
