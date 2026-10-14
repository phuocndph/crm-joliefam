param(
  [switch]$KeepForQA,
  [ValidateSet('dispatch', 'sales-production')][string]$Suite = 'dispatch'
)

$ErrorActionPreference = 'Stop'

# Dedicated temporary database/API. Never run this suite against crm_local.
$projectRoot = Split-Path -Parent $PSScriptRoot
$container = 'crm-joliefam-local-postgres'
$database = "crm_local_test_dispatch_$PID"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$databaseUrl = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/$database"
$stdoutPath = Join-Path $projectRoot ".isolated-dispatch-$PID.stdout.log"
$stderrPath = Join-Path $projectRoot ".isolated-dispatch-$PID.stderr.log"
$qaManifestPath = Join-Path $projectRoot ".isolated-dispatch-$PID.qa.json"
$restartCheckpointPath = Join-Path $projectRoot ".isolated-dispatch-$PID.restart.json"
$apiProcess = $null
$created = $false
$keepOwnedRuntime = $false
$suiteFile = if ($Suite -eq 'sales-production') { 'test-local-sales-production.mjs' } else { 'test-local-production-dispatch.mjs' }
$environmentNames = @('LOCAL_API_URL', 'LOCAL_DATABASE_URL', 'LOCAL_API_PORT', 'LOCAL_DISPATCH_TEST_ISOLATED', 'LOCAL_TEST_ISOLATED', 'LOCAL_SYNC_AUTO', 'VITE_BACKEND_MODE', 'LOCAL_DISPATCH_QA_MANIFEST', 'LOCAL_DISPATCH_QA_API_PID', 'LOCAL_DISPATCH_RESTART_CHECKPOINT')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

function Start-OwnedDispatchApi {
  $ownedProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'npm run local:api') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if ($ownedProcess.HasExited) { break }
    try {
      $health = Invoke-RestMethod "$env:LOCAL_API_URL/health" -ErrorAction Stop
      if ($health.ok -and $health.database -eq $database) { return $ownedProcess }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ownedProcess.HasExited) { & taskkill.exe /PID $ownedProcess.Id /T /F *> $null }
  throw 'Isolated dispatch API failed to start or targets the wrong database.'
}

try {
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Could not create dedicated dispatch test database.' }
  $created = $true
  $env:LOCAL_DATABASE_URL = $databaseUrl
  $env:LOCAL_API_PORT = "$port"
  $env:LOCAL_API_URL = "http://127.0.0.1:$port"
  $env:LOCAL_DISPATCH_TEST_ISOLATED = '1'
  $env:LOCAL_TEST_ISOLATED = '1'
  $env:LOCAL_SYNC_AUTO = 'false'
  $env:VITE_BACKEND_MODE = 'local'
  $apiProcess = Start-OwnedDispatchApi

  $env:LOCAL_DISPATCH_QA_MANIFEST = if ($KeepForQA) { $qaManifestPath } else { $null }
  $env:LOCAL_DISPATCH_QA_API_PID = if ($KeepForQA) { [string]$apiProcess.Id } else { $null }
  $env:LOCAL_DISPATCH_RESTART_CHECKPOINT = $restartCheckpointPath

  & node (Join-Path $PSScriptRoot $suiteFile)
  if ($LASTEXITCODE -ne 0) { throw 'Isolated production dispatch integration suite failed.' }
  & taskkill.exe /PID $apiProcess.Id /T /F *> $null
  $null = $apiProcess.WaitForExit(5000)
  $apiProcess = Start-OwnedDispatchApi
  $env:LOCAL_DISPATCH_QA_API_PID = if ($KeepForQA) { [string]$apiProcess.Id } else { $null }
  & node (Join-Path $PSScriptRoot $suiteFile) --verify-restart
  if ($LASTEXITCODE -ne 0) { throw 'Isolated dispatch API restart persistence verification failed.' }
  Remove-Item -LiteralPath $restartCheckpointPath -Force
  if ($KeepForQA) {
    if (-not (Test-Path -LiteralPath $qaManifestPath)) { throw 'Successful suite did not provide owned QA manifest.' }
    $keepOwnedRuntime = $true
    Write-Output "QA runtime retained: database=$database API=http://127.0.0.1:$port rootPID=$($apiProcess.Id) manifest=$qaManifestPath"
  }
} finally {
  if (-not $keepOwnedRuntime -and $apiProcess -and -not $apiProcess.HasExited) {
    & taskkill.exe /PID $apiProcess.Id /T /F *> $null
    $null = $apiProcess.WaitForExit(5000)
  }
  if (-not $keepOwnedRuntime -and $created) {
    & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $database" *> $null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove owned dispatch test database $database." }
  }
  if (-not $keepOwnedRuntime) { Remove-Item -LiteralPath $stdoutPath, $stderrPath, $qaManifestPath, $restartCheckpointPath -Force -ErrorAction SilentlyContinue }
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
}
