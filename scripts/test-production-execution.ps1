$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$containerName = "crm-production-test-$PID"
$image = "public.ecr.aws/supabase/postgres:17.6.1.159"
$started = $false

function Assert-NativeSuccess([string]$step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step failed with exit code $LASTEXITCODE"
  }
}

try {
  docker run --rm -d --name $containerName -e POSTGRES_PASSWORD=test -e POSTGRES_DB=postgres $image | Out-Null
  Assert-NativeSuccess "Starting isolated PostgreSQL"
  $started = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $containerName pg_isready -U postgres -d postgres *> $null
    if ($LASTEXITCODE -eq 0) {
      Start-Sleep -Seconds 2
      docker exec $containerName pg_isready -U postgres -d postgres *> $null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Isolated PostgreSQL did not become ready" }

  docker exec $containerName psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "GRANT USAGE, CREATE ON SCHEMA auth TO postgres; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO postgres;" | Out-Null
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
    "supabase/tests/production_execution_test.sql"
  )
  foreach ($file in $files) {
    Get-Content -Raw (Join-Path $projectRoot $file) |
      docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres | Out-Null
    Assert-NativeSuccess "Applying $file"
  }

  $jobs = @('prod-concurrent-tolerance-a', 'prod-concurrent-tolerance-b') | ForEach-Object {
    Start-Job -ScriptBlock {
      param($targetContainer, $idempotencyKey)
      $query = "SELECT public.production_test_confirm_result((SELECT id FROM public.inventory_documents WHERE idempotency_key='$idempotencyKey'), '80000000-0000-0000-0000-000000000001'::uuid);"
      docker exec $targetContainer psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c $query
      if ($LASTEXITCODE -ne 0) { throw "Concurrent production issue failed for $idempotencyKey" }
    } -ArgumentList $containerName, $_
  }
  try {
    $jobs | Wait-Job | Out-Null
    foreach ($job in $jobs) {
      Receive-Job -Job $job | Out-Null
      if ($job.State -ne 'Completed') { throw "Concurrent production issue job failed" }
    }
  }
  finally {
    $jobs | Remove-Job -Force
  }

  Get-Content -Raw (Join-Path $projectRoot "supabase/tests/production_execution_concurrency_assert.sql") |
    docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres | Out-Null
  Assert-NativeSuccess "Checking production material tolerance concurrency"
  Write-Host "production_execution_test: PASS"
}
finally {
  if ($started) { docker stop $containerName *> $null }
}
