param([string]$Base = "http://127.0.0.1:8787")

$ErrorActionPreference = "Stop"
$base = $Base.TrimEnd('/')
$session = Invoke-RestMethod "$base/api/local-auth/session"
$headers = @{ Authorization = "Bearer $($session.token)" }
$suffix = [guid]::NewGuid().ToString("N").Substring(0, 10)
$listA = $null
$listB = $null

function Invoke-Json($url, $method, $body = $null) {
  $params = @{ Uri = $url; Method = $method; Headers = $headers }
  if ($null -ne $body) {
    $params.ContentType = "application/json"
    $params.Body = ($body | ConvertTo-Json -Depth 10 -Compress)
  }
  $response = Invoke-RestMethod @params
  if ($response -is [System.Array]) { return @($response | ForEach-Object { $_ }) }
  return $response
}

try {
  $listA = Invoke-Json "$base/api/catalog/price-lists" POST @{ name = "Compat $suffix A"; year = 2091; status = "active" } | Select-Object -First 1
  $listB = Invoke-Json "$base/api/catalog/price-lists" POST @{ name = "Compat $suffix B"; year = 2091; status = "active" } | Select-Object -First 1
  $listAId = [string]$listA.id
  $listBId = [string]$listB.id
  if ([string]::IsNullOrWhiteSpace($listAId) -or [string]::IsNullOrWhiteSpace($listBId)) { throw "Price-list create did not return IDs." }
  $lists = @(Invoke-Json "$base/api/catalog/price-lists?includeInactive=true" GET | ForEach-Object { $_ })
  $created = $lists | Where-Object { [string]$_.id -eq $listAId } | Select-Object -First 1
  if (-not $created -or $created.name -ne "Compat $suffix A" -or [int]$created.year -ne 2091) { throw "Price-list read-after-write failed." }

  1..120 | ForEach-Object {
    Invoke-Json "$base/api/catalog/products" POST @{ sku = "COMPAT-$suffix-A-$($_.ToString('000'))"; name = "Compat product A $_"; price = 1000; cost_price = 500; price_list_id = $listAId } | Out-Null
  }
  Invoke-Json "$base/api/catalog/products" POST @{ sku = "COMPAT-$suffix-B-001"; name = "Compat product B"; price = 2000; cost_price = 1000; price_list_id = $listBId } | Out-Null

  $before = @(Invoke-Json "$base/api/catalog/products?priceListId=$listAId&includeInactive=true" GET)
  if ($before.Count -ne 120) { throw "Expected 120 products before bulk archive, got $($before.Count)." }
  $bulk = Invoke-Json "$base/api/catalog/products/by-price-list/$listAId" DELETE
  if ([int]$bulk.archived_count -ne 120) { throw "Bulk archive count mismatch." }
  $activeA = @(Invoke-Json "$base/api/catalog/products?priceListId=$listAId" GET)
  $activeB = @(Invoke-Json "$base/api/catalog/products?priceListId=$listBId" GET)
  if ($activeA.Count -ne 0 -or $activeB.Count -ne 1) { throw "Bulk archive escaped its price-list scope." }

  Invoke-Json "$base/api/catalog/price-lists/$listAId" DELETE | Out-Null
  Write-Host "Local catalog compatibility test passed: uncapped reads, price-list CRUD, read-after-write and scoped bulk archive verified."
}
finally {
  if ($listB) {
    $cleanupListBId = [string]$listB.id
    try { Invoke-Json "$base/api/catalog/products/by-price-list/$cleanupListBId" DELETE | Out-Null } catch {}
    try { Invoke-Json "$base/api/catalog/price-lists/$cleanupListBId" DELETE | Out-Null } catch {}
  }
  if ($listA) {
    $cleanupListAId = [string]$listA.id
    try { Invoke-Json "$base/api/catalog/products/by-price-list/$cleanupListAId" DELETE | Out-Null } catch {}
    try { Invoke-Json "$base/api/catalog/price-lists/$cleanupListAId" DELETE | Out-Null } catch {}
  }
}
