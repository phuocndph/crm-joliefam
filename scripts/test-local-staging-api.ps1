$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot ".local-staging-runtime"

$statusText = & cmd.exe /d /s /c "npx --yes supabase@latest status --workdir `"$runtimeRoot`" -o json 2>nul"
if ($LASTEXITCODE -ne 0) {
  throw "Local Supabase staging is not running. Run npm run staging:inventory:start first."
}

$status = $statusText | ConvertFrom-Json
if ($status.linked_project) {
  throw "Refusing staging test because the generated runtime is linked to a remote project."
}

npx --yes supabase@latest db reset --local --workdir $runtimeRoot --no-seed
if ($LASTEXITCODE -ne 0) {
  throw "Resetting local staging failed with exit code $LASTEXITCODE"
}

$env:LOCAL_SUPABASE_URL = $status.API_URL
$env:LOCAL_SUPABASE_ANON_KEY = $status.ANON_KEY
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY

node (Join-Path $PSScriptRoot "test-local-staging-api.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "Local staging API acceptance failed with exit code $LASTEXITCODE"
}
