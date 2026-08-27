$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot ".local-staging-runtime"
$runtimeSupabase = Join-Path $runtimeRoot "supabase"
$runtimeMigrations = Join-Path $runtimeSupabase "migrations"

function Assert-NativeSuccess([string]$step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step failed with exit code $LASTEXITCODE"
  }
}

New-Item -ItemType Directory -Path $runtimeMigrations -Force | Out-Null

$resolvedProject = [System.IO.Path]::GetFullPath($projectRoot)
$resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
if (-not $resolvedRuntime.StartsWith($resolvedProject + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Local staging runtime resolved outside the project directory"
}

Get-ChildItem -LiteralPath $runtimeMigrations -File -Filter "*.sql" | Remove-Item -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "supabase/local-staging.config.toml") -Destination (Join-Path $runtimeSupabase "config.toml") -Force

$migrationMap = [ordered]@{
  "supabase/tests/cost_management_bootstrap.sql" = "20260824000000_cost_management_bootstrap.sql"
  "supabase/migrations/20260824150000_cost_management_foundation.sql" = "20260824150000_cost_management_foundation.sql"
  "supabase/migrations/20260824160000_cost_management_security_fixes.sql" = "20260824160000_cost_management_security_fixes.sql"
  "supabase/migrations/20260824170000_inventory_material_costing_foundation.sql" = "20260824170000_inventory_material_costing_foundation.sql"
  "supabase/migrations/20260825090000_inventory_hardening.sql" = "20260825090000_inventory_hardening.sql"
  "supabase/migrations/20260825110000_bom_cutting_standards_foundation.sql" = "20260825110000_bom_cutting_standards_foundation.sql"
}

foreach ($entry in $migrationMap.GetEnumerator()) {
  $source = Join-Path $projectRoot $entry.Key
  $destination = Join-Path $runtimeMigrations $entry.Value
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

# Supabase migrations run through the migration engine, not the psql client.
# Strip the single psql-only control command from the generated bootstrap copy.
$runtimeBootstrap = Join-Path $runtimeMigrations "20260824000000_cost_management_bootstrap.sql"
$bootstrapLines = Get-Content -LiteralPath $runtimeBootstrap
$bootstrapLines | Where-Object { $_ -ne '\set ON_ERROR_STOP on' } |
  Set-Content -LiteralPath $runtimeBootstrap -Encoding utf8

Write-Host "Starting isolated Supabase staging from $runtimeRoot"
$startOutput = & cmd.exe /d /s /c "npx --yes supabase@latest start --workdir `"$runtimeRoot`" 2>&1"
if ($LASTEXITCODE -ne 0) {
  Write-Error ($startOutput -join [Environment]::NewLine)
  throw "Starting local Supabase staging failed with exit code $LASTEXITCODE"
}

$statusText = & cmd.exe /d /s /c "npx --yes supabase@latest status --workdir `"$runtimeRoot`" -o json 2>nul"
Assert-NativeSuccess "Reading local Supabase staging status"
$status = $statusText | ConvertFrom-Json
if ($status.linked_project) {
  throw "Generated local staging must not be linked to a remote project"
}
Write-Host "Local API: $($status.API_URL)"
Write-Host "Local Studio: $($status.STUDIO_URL)"
Write-Host "Linked project: $($status.linked_project)"
