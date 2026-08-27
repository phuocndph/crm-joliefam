$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$containerName = "crm-bom-cutting-test-$PID"
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
    "supabase/tests/bom_cutting_standards_test.sql"
  )
  foreach ($file in $files) {
    Get-Content -Raw (Join-Path $projectRoot $file) |
      docker exec -i $containerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres | Out-Null
    Assert-NativeSuccess "Applying $file"
  }
  Write-Host "bom_cutting_standards_test: PASS"
}
finally {
  if ($started) { docker stop $containerName *> $null }
}
