$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot ".local-staging-runtime"

if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot "supabase/config.toml"))) {
  Write-Host "Local inventory staging is not initialized."
  exit 0
}

npx --yes supabase@latest stop --workdir $runtimeRoot
if ($LASTEXITCODE -ne 0) {
  throw "Stopping local Supabase staging failed with exit code $LASTEXITCODE"
}

