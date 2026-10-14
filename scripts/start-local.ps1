$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

docker compose -f docker-compose.local.yml up -d
Write-Host "Đang chờ PostgreSQL local..."
$databaseReady = $false
for ($i = 0; $i -lt 30; $i++) {
  $ready = docker exec crm-joliefam-local-postgres pg_isready -U crm_local -d crm_local 2>$null
  if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $databaseReady) { throw "PostgreSQL local không sẵn sàng sau 30 giây." }

$env:LOCAL_DATABASE_URL = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/crm_local"
$env:LOCAL_API_PORT = "8787"
$env:VITE_BACKEND_MODE = "local"
$env:VITE_LOCAL_API_URL = "http://127.0.0.1:8787"
# Backend chỉ xác thực SQL local; biến bridge Supabase cũ không có tác dụng.

$apiLog = Join-Path $projectRoot ".local-api.log"
$apiErrorLog = Join-Path $projectRoot ".local-api.error.log"
$apiProcess = $null
$apiOwned = $false
try {
  try {
    $existingHealth = Invoke-RestMethod "http://127.0.0.1:8787/health" -TimeoutSec 2
  } catch { $existingHealth = $null }
  if ($existingHealth.ok -and $existingHealth.backend -eq "local-postgresql") {
    if ($existingHealth.capabilities.production_dispatch -ne 2 -or $existingHealth.capabilities.production_sales_workflow -ne 1) {
      throw "Local API cổng 8787 đang chạy bản cũ chưa có giao việc sản xuất. Hãy khởi động lại đúng Local API trước khi mở dự án; tiến trình hiện tại được giữ nguyên."
    }
    Write-Host "Đang dùng Local API đã chạy sẵn ở cổng 8787."
  } else {
    if (Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue) {
      throw "Cổng 8787 đang bị tiến trình khác chiếm dụng."
    }
    $apiProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run local:api" -WorkingDirectory $projectRoot `
      -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog -WindowStyle Hidden -PassThru
    $apiOwned = $true
    $apiReady = $false
    for ($i = 0; $i -lt 30; $i++) {
      if ($apiProcess.HasExited) {
        $details = if (Test-Path $apiErrorLog) { Get-Content $apiErrorLog -Tail 12 -ErrorAction SilentlyContinue } else { "" }
        throw "Local API đã dừng trước khi sẵn sàng. $details"
      }
      try {
        $health = Invoke-RestMethod "http://127.0.0.1:8787/health" -TimeoutSec 2
        if ($health.ok -and $health.backend -eq "local-postgresql" -and $health.capabilities.production_dispatch -eq 2 -and $health.capabilities.production_sales_workflow -eq 1) { $apiReady = $true; break }
      } catch { }
      Start-Sleep -Seconds 1
    }
    if (-not $apiReady) { throw "Local API không vượt qua health check trong 30 giây. Xem .local-api.log và .local-api.error.log." }
  }
  Write-Host "Local API: http://127.0.0.1:8787 (đã health check)"
  Write-Host "Local UI:  http://127.0.0.1:8090/production-attendance"
  npm run dev -- --host 127.0.0.1 --port 8090 --strictPort
} finally {
  if ($apiOwned -and $apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
