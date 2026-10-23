param([switch]$KeepForQA, [switch]$StartupOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$container = 'crm-joliefam-local-postgres'
$database = "crm_local_test_dispatch_$PID"
if ($database -notmatch '^crm_local_test_dispatch_[0-9]+$') { throw 'Invalid owned test database.' }
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$stdoutPath = Join-Path $projectRoot ".isolated-workspace-$PID.stdout.log"
$stderrPath = Join-Path $projectRoot ".isolated-workspace-$PID.stderr.log"
$qaPath = Join-Path $projectRoot ".isolated-dispatch-$PID.qa.json"
$checkpointPath = Join-Path $projectRoot ".isolated-dispatch-$PID.restart.json"
$apiProcess = $null
$created = $false
$retained = $false
$names = @('LOCAL_DATABASE_URL','LOCAL_API_PORT','LOCAL_API_URL','LOCAL_TEST_ISOLATED','LOCAL_DISPATCH_TEST_ISOLATED','LOCAL_SYNC_AUTO','VITE_BACKEND_MODE','LOCAL_DISPATCH_QA_MANIFEST','LOCAL_DISPATCH_QA_API_PID','LOCAL_DISPATCH_RESTART_CHECKPOINT','LOCAL_DEMO_AUTH')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
function Start-OwnedApi {
  $process = Start-Process -FilePath 'node.exe' -ArgumentList @('--import','tsx','server/index.ts') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    $process.Refresh()
    if ($process.HasExited) { break }
    try {
      $health = Invoke-RestMethod "$env:LOCAL_API_URL/health" -TimeoutSec 2 -ErrorAction Stop
      if ($health.ok -and $health.database -eq $database) { return $process }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  Write-Host 'Owned API startup stderr (last 70 lines):'
  if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Tail 70 | ForEach-Object { Write-Host $_ } }
  Write-Host 'Owned API startup stdout (last 20 lines):'
  if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Tail 20 | ForEach-Object { Write-Host $_ } }
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  throw 'Isolated workspace API failed startup or database identity check.'
}
try {
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database"
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create owned isolated database.' }
  $created = $true
  $env:LOCAL_DATABASE_URL = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/$database"
  $env:LOCAL_API_PORT = [string]$port
  $env:LOCAL_API_URL = "http://127.0.0.1:$port"
  $env:LOCAL_TEST_ISOLATED = '1'
  $env:LOCAL_DISPATCH_TEST_ISOLATED = '1'
  $env:LOCAL_SYNC_AUTO = 'false'
  $env:LOCAL_DEMO_AUTH = 'true'
  $env:VITE_BACKEND_MODE = 'local'
  $env:LOCAL_DISPATCH_QA_MANIFEST = if ($KeepForQA) { $qaPath } else { $null }
  $env:LOCAL_DISPATCH_RESTART_CHECKPOINT = $checkpointPath
  $apiProcess = Start-OwnedApi
  $env:LOCAL_DISPATCH_QA_API_PID = [string]$apiProcess.Id
  Write-Output "Owned workspace API healthy: database=$database port=$port PID=$($apiProcess.Id)"
  if (-not $StartupOnly) {
    & node (Join-Path $PSScriptRoot 'test-local-production-workspace.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Workspace integration suite failed.' }
    Stop-Process -Id $apiProcess.Id -Force
    $null = $apiProcess.WaitForExit(5000)
    $apiProcess = Start-OwnedApi
    $env:LOCAL_DISPATCH_QA_API_PID = [string]$apiProcess.Id
    & node (Join-Path $PSScriptRoot 'test-local-production-workspace.mjs') --verify-restart
    if ($LASTEXITCODE -ne 0) { throw 'Workspace restart verification failed.' }
  }
  if ($KeepForQA) {
    $retained = $true
    Write-Output "Retained owned runtime: database=$database API=$env:LOCAL_API_URL PID=$($apiProcess.Id) manifest=$qaPath"
  }
} finally {
  if (-not $retained -and $apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue }
  if (-not $retained -and $created) {
    & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $database WITH (FORCE)"
  }
  if (-not $retained) { Remove-Item -LiteralPath $stdoutPath,$stderrPath,$qaPath,$checkpointPath -Force -ErrorAction SilentlyContinue }
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
}
