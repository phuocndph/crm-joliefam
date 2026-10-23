[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$UiPort = 8090
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$apiPort = 8787
$apiBase = "http://127.0.0.1:$apiPort"
$uiLoopbackOrigin = "http://127.0.0.1:$UiPort"
$uiLocalhostOrigin = "http://localhost:$UiPort"
$localAllowedOrigins = "$uiLoopbackOrigin,$uiLocalhostOrigin"
$script:lastApiCheckError = $null

function Get-ListeningTcpConnections {
  param([int]$Port)

  return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Assert-UiPortAvailable {
  $listeners = Get-ListeningTcpConnections -Port $UiPort
  if ($listeners.Count -gt 0) {
    $ownerIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
    throw "Cổng UI $UiPort đang được sử dụng (PID: $ownerIds). Launcher không tự dừng tiến trình; hãy chọn -UiPort khác hoặc dừng tiến trình đang sở hữu cổng."
  }
}

function Test-VerifiedLocalApi {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/health" -Headers @{ Origin = $uiLoopbackOrigin } -TimeoutSec 2 -ErrorAction Stop
    $health = $response.Content | ConvertFrom-Json
    $allowedOrigin = [string]$response.Headers["Access-Control-Allow-Origin"]

    if ($response.StatusCode -ne 200) {
      throw "HTTP $($response.StatusCode)"
    }
    if ($allowedOrigin -ne $uiLoopbackOrigin) {
      throw "CORS không cho phép Origin $uiLoopbackOrigin (Access-Control-Allow-Origin: '$allowedOrigin')."
    }
    if (-not $health.ok -or $health.backend -ne "local-postgresql") {
      throw "Phản hồi health không phải Local PostgreSQL hợp lệ."
    }
    if ($health.capabilities.production_dispatch -ne 3 -or $health.capabilities.production_sales_workflow -ne 1 -or $health.capabilities.production_workspace -ne 5) {
      throw "Local API chưa hỗ trợ đầy đủ quy trình sản xuất mới."
    }

    $script:lastApiCheckError = $null
    return $health
  } catch {
    $script:lastApiCheckError = $_.Exception.Message
    return $null
  }
}

function Start-LocalApi {
  $previousAllowedOrigins = [Environment]::GetEnvironmentVariable("LOCAL_ALLOWED_ORIGINS", "Process")
  $previousApiHost = [Environment]::GetEnvironmentVariable("LOCAL_API_HOST", "Process")
  $setDefaultAllowedOrigins = [string]::IsNullOrWhiteSpace($previousAllowedOrigins)
  $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop
  $nodeExecutable = if ($nodeCommand.Path) { $nodeCommand.Path } else { $nodeCommand.Source }

  if (-not $setDefaultAllowedOrigins) {
    $configuredOrigins = @($previousAllowedOrigins.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($configuredOrigins -notcontains $uiLoopbackOrigin) {
      throw "LOCAL_ALLOWED_ORIGINS được đặt rõ nhưng không chứa Origin bắt buộc $uiLoopbackOrigin. Giữ nguyên cấu hình hiện tại; hãy thêm đúng origin này hoặc chọn -UiPort khớp với cấu hình."
    }
  }

  try {
    # Chỉ đặt mặc định khi tiến trình không có cấu hình CORS rõ ràng.
    if ($setDefaultAllowedOrigins) {
      $env:LOCAL_ALLOWED_ORIGINS = $localAllowedOrigins
    }
    $env:LOCAL_API_HOST = "127.0.0.1"
    return Start-Process -FilePath $nodeExecutable -ArgumentList @("--env-file-if-exists=.env", "--env-file-if-exists=.env.local", "--import", "tsx", "server/index.ts") -WorkingDirectory $projectRoot `
      -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog -WindowStyle Hidden -PassThru
  } finally {
    if ($setDefaultAllowedOrigins) {
      if ($null -eq $previousAllowedOrigins) {
        Remove-Item Env:LOCAL_ALLOWED_ORIGINS -ErrorAction SilentlyContinue
      } else {
        $env:LOCAL_ALLOWED_ORIGINS = $previousAllowedOrigins
      }
    }
    if ($null -eq $previousApiHost) {
      Remove-Item Env:LOCAL_API_HOST -ErrorAction SilentlyContinue
    } else {
      $env:LOCAL_API_HOST = $previousApiHost
    }
  }
}

# Kiểm tra trước khi tạo DB/API để không làm gián đoạn một UI đang chạy.
if ($UiPort -in @($apiPort, 55432)) {
  throw "Cổng UI $UiPort được dành cho Local API hoặc PostgreSQL. Hãy chọn một cổng UI khác, ví dụ 8090 hoặc 8083."
}
Assert-UiPortAvailable

& docker compose -f docker-compose.local.yml up -d
if ($LASTEXITCODE -ne 0) { throw "Không thể khởi động PostgreSQL local (docker compose exit code $LASTEXITCODE)." }

Write-Host "Đang chờ PostgreSQL local..."
$databaseReady = $false
for ($i = 0; $i -lt 30; $i++) {
  $ready = & docker exec crm-joliefam-local-postgres pg_isready -U crm_local -d crm_local 2>$null
  if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $databaseReady) { throw "PostgreSQL local không sẵn sàng sau 30 giây." }

$env:LOCAL_DATABASE_URL = "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/crm_local"
$env:LOCAL_API_PORT = "$apiPort"
$env:VITE_BACKEND_MODE = "local"
$env:VITE_LOCAL_API_URL = $apiBase
# Backend chỉ xác thực SQL local; biến bridge Supabase cũ không có tác dụng.

$apiLog = Join-Path $projectRoot ".local-api.log"
$apiErrorLog = Join-Path $projectRoot ".local-api.error.log"
$apiProcess = $null
$apiOwned = $false
try {
  $existingHealth = Test-VerifiedLocalApi
  if ($existingHealth) {
    Write-Host "Đang dùng Local API đã chạy sẵn ở cổng $apiPort (CORS: $uiLoopbackOrigin)."
  } else {
    $apiListeners = Get-ListeningTcpConnections -Port $apiPort
    if ($apiListeners.Count -gt 0) {
      $ownerIds = @($apiListeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
      $reason = if ($script:lastApiCheckError) { " $script:lastApiCheckError" } else { "" }
      throw "Cổng $apiPort đang được sử dụng (PID: $ownerIds), nhưng API không vượt qua health/CORS cho Origin $uiLoopbackOrigin.$reason Tiến trình hiện tại được giữ nguyên; hãy khởi động lại đúng Local API hoặc chọn UI port mà API hiện có cho phép."
    }

    $apiProcess = Start-LocalApi
    if ($null -eq $apiProcess) { throw "Không thể khởi động Local API." }
    $apiOwned = $true
    $apiReady = $false
    for ($i = 0; $i -lt 30; $i++) {
      if ($apiProcess.HasExited) {
        $details = if (Test-Path $apiErrorLog) { Get-Content $apiErrorLog -Tail 12 -ErrorAction SilentlyContinue } else { "" }
        throw "Local API đã dừng trước khi sẵn sàng. $details"
      }
      $health = Test-VerifiedLocalApi
      if ($health) { $apiReady = $true; break }
      Start-Sleep -Seconds 1
    }
    if (-not $apiReady) {
      $reason = if ($script:lastApiCheckError) { " Lỗi cuối: $script:lastApiCheckError" } else { "" }
      throw "Local API không vượt qua health/CORS check trong 30 giây.$reason Xem .local-api.log và .local-api.error.log."
    }
  }

  Write-Host "Local API: $apiBase (đã health/CORS check)"
  Write-Host "Local UI:  $uiLoopbackOrigin/production-attendance"
  & npm.cmd run dev -- --host 127.0.0.1 --port $UiPort --strictPort
  if ($LASTEXITCODE -ne 0) { throw "Vite UI dừng với mã $LASTEXITCODE." }
} finally {
  if ($apiOwned -and $apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
