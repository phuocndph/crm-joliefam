$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$container = 'crm-joliefam-local-postgres'
$database = "crm_local_scope_test_$PID"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$databaseUrl = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/$database"
$stdoutPath = Join-Path $projectRoot ".scope-test-$PID.stdout.log"
$stderrPath = Join-Path $projectRoot ".scope-test-$PID.stderr.log"
$apiProcess = $null
$created = $false
$environmentNames = @('LOCAL_API_URL','LOCAL_DATABASE_URL','LOCAL_TEST_DATABASE','LOCAL_TEST_ISOLATED','LOCAL_SYNC_AUTO','LOCAL_API_PORT','VITE_BACKEND_MODE')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

function Stop-OwnedApi {
  if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
    & taskkill.exe /PID $apiProcess.Id /T /F *> $null
    $null = $apiProcess.WaitForExit(5000)
  }
}

try {
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Could not create owned isolated scope test database.' }
  $created = $true
  $command = "`$env:LOCAL_DATABASE_URL='$databaseUrl'; `$env:LOCAL_API_PORT='$port'; `$env:LOCAL_TEST_ISOLATED='1'; `$env:LOCAL_SYNC_AUTO='false'; `$env:VITE_BACKEND_MODE='local'; npm run local:api"
  $apiProcess = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$command) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    try { $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 2; if ($health.ok -and $health.database -eq $database) { $ready = $true; break } } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Owned isolated scope API did not become healthy on its expected database.' }
  $env:LOCAL_API_URL = "http://127.0.0.1:$port"
  $env:LOCAL_DATABASE_URL = $databaseUrl
  $env:LOCAL_TEST_DATABASE = $database
  $env:LOCAL_TEST_ISOLATED = '1'
  $env:LOCAL_SYNC_AUTO = 'false'
  node (Join-Path $PSScriptRoot 'test-local-payroll-scope-concurrency.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated payroll scope/concurrency test failed.' }
} finally {
  Stop-OwnedApi
  if ($created) { & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $database WITH (FORCE)" *> $null }
  Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
}
