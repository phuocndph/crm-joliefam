$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8787"

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok -or $health.backend -ne "local-postgresql") { throw "Local API health check failed." }
$session = Invoke-RestMethod "$base/api/local-auth/session" -Headers @{ Origin = "http://127.0.0.1:8090" }
$headers = @{ Authorization = "Bearer $($session.token)"; Origin = "http://127.0.0.1:8090" }

$items = Invoke-RestMethod "$base/api/inventory/items" -Headers $headers
$itemCodes = @($items.code)
$itemIndex = [Array]::IndexOf($itemCodes, "ZIPPER-20CM")
if ($itemIndex -lt 0) { throw "Inventory demo item ZIPPER-20CM is missing." }
$itemId = @($items.id)[$itemIndex]

$warehouses = Invoke-RestMethod "$base/api/inventory/warehouses" -Headers $headers
$warehouseTypes = @($warehouses.warehouse_type)
$warehouseIndex = [Array]::IndexOf($warehouseTypes, "RAW_MATERIAL")
if ($warehouseIndex -lt 0) { throw "Inventory demo raw-material warehouse is missing." }
$warehouseId = @($warehouses.id)[$warehouseIndex]

$balances = Invoke-RestMethod "$base/api/inventory/balances" -Headers $headers
$balanceItemIds = @($balances.inventory_item_id)
$balanceWarehouseIds = @($balances.warehouse_id)
$balanceIndex = -1
for ($index = 0; $index -lt $balanceItemIds.Count; $index++) {
  if ($balanceItemIds[$index] -eq $itemId -and $balanceWarehouseIds[$index] -eq $warehouseId) {
    $balanceIndex = $index
    break
  }
}
$beforeQuantity = if ($balanceIndex -ge 0) { [decimal]@($balances.quantity_on_hand)[$balanceIndex] } else { [decimal]0 }

$receiptBody = @{
  document_type = "RECEIPT"
  transaction_at = (Get-Date).ToString("o")
  warehouse_id = $warehouseId
  description = "Inventory automated local test receipt"
  idempotency_key = "inventory-local-test-receipt-v1"
  lines = @(@{ inventory_item_id = $itemId; quantity = 4; unit = "PIECE"; input_unit_cost = 6500; vat_rate = 0 })
} | ConvertTo-Json -Depth 6
$receipt = Invoke-RestMethod "$base/api/inventory/documents" -Method Post -Headers $headers -ContentType "application/json" -Body $receiptBody
$receiptResult = Invoke-RestMethod "$base/api/inventory/documents/$($receipt.id)/confirm" -Method Post -Headers $headers -ContentType "application/json" -Body "{}"
if ($receiptResult.status -ne "CONFIRMED") { throw "Receipt confirmation failed." }

$issueBody = @{
  document_type = "ISSUE"
  transaction_at = (Get-Date).ToString("o")
  warehouse_id = $warehouseId
  description = "Inventory automated local test issue"
  idempotency_key = "inventory-local-test-issue-v1"
  lines = @(@{ inventory_item_id = $itemId; quantity = 2; unit = "PIECE"; input_unit_cost = $null; vat_rate = 0 })
} | ConvertTo-Json -Depth 6
$issue = Invoke-RestMethod "$base/api/inventory/documents" -Method Post -Headers $headers -ContentType "application/json" -Body $issueBody
$issueResult = Invoke-RestMethod "$base/api/inventory/documents/$($issue.id)/confirm" -Method Post -Headers $headers -ContentType "application/json" -Body "{}"
if ($issueResult.status -ne "CONFIRMED") { throw "Issue confirmation failed." }

$afterBalances = Invoke-RestMethod "$base/api/inventory/balances" -Headers $headers
$afterItemIds = @($afterBalances.inventory_item_id)
$afterWarehouseIds = @($afterBalances.warehouse_id)
$afterIndex = -1
for ($index = 0; $index -lt $afterItemIds.Count; $index++) {
  if ($afterItemIds[$index] -eq $itemId -and $afterWarehouseIds[$index] -eq $warehouseId) {
    $afterIndex = $index
    break
  }
}
if ($afterIndex -lt 0) { throw "Inventory balance row is missing after confirmation." }
$afterQuantity = [decimal]@($afterBalances.quantity_on_hand)[$afterIndex]
$expected = $beforeQuantity + $(if ($receipt.reused) { 0 } else { 4 }) - $(if ($issue.reused) { 0 } else { 2 })
if ($afterQuantity -ne $expected) { throw "Inventory balance mismatch. Expected $expected, got $afterQuantity." }

$documents = Invoke-RestMethod "$base/api/inventory/documents" -Headers $headers
$movements = Invoke-RestMethod "$base/api/inventory/movements" -Headers $headers
if ($documents.Count -lt 3 -or $movements.Count -lt 5) { throw "Inventory documents or movements are incomplete." }

Write-Host "Local inventory test passed: $(@($items).Count) items, $(@($warehouses).Count) warehouses, balance $afterQuantity PIECE."
