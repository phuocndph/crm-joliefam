param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('adjustments', 'hardening', 'concurrency', 'bulk-workflow')]
  [string]$Suite
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$container = 'crm-joliefam-local-postgres'
$database = "crm_local_test_${Suite}_$PID".Replace('-', '_')
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$databaseUrl = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/$database"
$stdoutPath = Join-Path $projectRoot ".isolated-$Suite-$PID.stdout.log"
$stderrPath = Join-Path $projectRoot ".isolated-$Suite-$PID.stderr.log"
$apiProcess = $null
$created = $false
$environmentNames = @('LOCAL_API_URL', 'LOCAL_DATABASE_URL', 'LOCAL_API_PORT', 'LOCAL_ATTENDANCE_BULK_TEST_ISOLATED', 'LOCAL_TEST_ISOLATED')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

try {
  & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test database.' }
  $created = $true
  $env:LOCAL_DATABASE_URL = $databaseUrl
  $env:LOCAL_API_PORT = "$port"
  $env:LOCAL_API_URL = "http://127.0.0.1:$port"
  $env:LOCAL_ATTENDANCE_BULK_TEST_ISOLATED = '1'
  $env:LOCAL_TEST_ISOLATED = '1'
  $apiProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'npm run local:api') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  $healthy = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if ($apiProcess.HasExited) { break }
    try {
      $health = Invoke-RestMethod "$env:LOCAL_API_URL/health" -ErrorAction Stop
      if ($health.ok -and $health.database -eq $database) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $healthy) { throw 'Isolated API failed to start or targets the wrong database.' }

  if ($Suite -eq 'adjustments') {
    & docker exec $container psql -U crm_local -d $database -v ON_ERROR_STOP=1 -c "update local_workers set payroll_status='SUSPENDED'" *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Could not isolate payroll fixture workers.' }
  }
  $scripts = @{
    'adjustments' = 'test-local-payroll-adjustments.ps1'
    'hardening' = 'test-local-attendance-hardening.ps1'
    'concurrency' = 'test-local-attendance-concurrency.mjs'
    'bulk-workflow' = 'test-local-attendance-bulk-workflow.mjs'
  }
  $script = Join-Path $PSScriptRoot $scripts[$Suite]
  if ($script.EndsWith('.ps1')) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
  } else {
    & node $script
  }
  if ($LASTEXITCODE -ne 0) { throw "Isolated $Suite suite failed." }
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    & taskkill.exe /PID $apiProcess.Id /T /F *> $null
    $null = $apiProcess.WaitForExit(5000)
  }
  if ($created) {
    & docker exec $container psql -U crm_local -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $database" *> $null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove test database $database." }
  }
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
}
