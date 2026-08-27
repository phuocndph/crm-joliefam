$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$containerName = "crm-inventory-test-$PID"
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
    "supabase/tests/inventory_material_costing_test.sql"
  )
  foreach ($file in $files) {
    Get-Content -Raw (Join-Path $projectRoot $file) |
      docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres
    Assert-NativeSuccess "Applying $file"
  }

  function Invoke-ConcurrentConfirmPair([string]$firstKey, [string]$secondKey) {
    $jobs = @($firstKey, $secondKey) | ForEach-Object {
      Start-Job -ScriptBlock {
        param($targetContainer, $stateKey)
        $query = "SELECT public.inventory_test_confirm_result((SELECT value::uuid FROM public.inventory_test_state WHERE key='$stateKey'), '40000000-0000-0000-0000-000000000001'::uuid);"
        docker exec $targetContainer psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c $query
        if ($LASTEXITCODE -ne 0) { throw "Concurrent confirm failed for $stateKey" }
      } -ArgumentList $containerName, $_
    }
    try {
      $jobs | Wait-Job | Out-Null
      foreach ($job in $jobs) {
        Receive-Job -Job $job
        if ($job.State -ne 'Completed') { throw "Concurrent inventory confirmation job failed" }
      }
    }
    finally {
      $jobs | Remove-Job -Force
    }
  }

  Invoke-ConcurrentConfirmPair 'concurrent_issue_a' 'concurrent_issue_b'
  Invoke-ConcurrentConfirmPair 'concurrent_receipt_a' 'concurrent_receipt_b'

  Get-Content -Raw (Join-Path $projectRoot "supabase/tests/inventory_material_costing_concurrency_assert.sql") |
    docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres
  Assert-NativeSuccess "Checking inventory concurrency results"
}
finally {
  if ($started) { docker stop $containerName *> $null }
}
