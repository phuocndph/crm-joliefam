$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8787"

$health = Invoke-RestMethod "$base/health"
if (-not $health.ok -or $health.backend -ne "local-postgresql") { throw "Local API health check failed." }
$session = Invoke-RestMethod "$base/api/local-auth/session"
$headers = @{ Authorization = "Bearer $($session.token)" }

$products = Invoke-RestMethod "$base/api/catalog/products?includeInactive=true" -Headers $headers
if (@($products).Count -lt 2) { throw "Expected seeded local catalog products." }

$shirt = @($products | Where-Object { $_.sku -eq "AO-SO-MI-001" })[0]
$pants = @($products | Where-Object { $_.sku -eq "QUAN-001" })[0]
if (-not $shirt -or -not $pants) { throw "Seeded local catalog products are missing." }
if ([decimal]$shirt.current_rate -ne 18000 -or [decimal]$pants.current_rate -ne 22000) { throw "Local catalog rate mapping is incorrect." }
if ($shirt.price -le 0 -or $shirt.cost_price -le 0) { throw "Local catalog price fields are missing." }

$activeProducts = Invoke-RestMethod "$base/api/catalog/products" -Headers $headers
if (-not (@($activeProducts | Where-Object { $_.sku -eq "AO-SO-MI-001" }))) { throw "Active local catalog product is missing from the default list." }

# Legacy quote/product screens may use these compatibility RPCs when their
# normal query is empty or paged. They must resolve against local SQL too.
$rpcCatalog = Invoke-RestMethod "$base/api/local-rpc/get_products_catalog" -Method Post -Headers $headers -ContentType "application/json" -Body (@{ _limit = 3; _offset = 0; _in_stock = $true } | ConvertTo-Json)
if (@($rpcCatalog.data).Count -eq 0 -or [int]$rpcCatalog.data[0].total_count -lt 1) { throw "Local get_products_catalog RPC adapter returned no rows." }
$rpcIds = @($rpcCatalog.data | Select-Object -ExpandProperty id)
$rpcCosts = Invoke-RestMethod "$base/api/local-rpc/get_products_cost_prices" -Method Post -Headers $headers -ContentType "application/json" -Body (@{ _ids = $rpcIds } | ConvertTo-Json)
if (@($rpcCosts.data).Count -ne $rpcIds.Count) { throw "Local get_products_cost_prices RPC adapter returned an incomplete result." }

$productionProducts = Invoke-RestMethod "$base/api/production/products?workDate=$(Get-Date -Format yyyy-MM-dd)" -Headers $headers
$productionShirt = @($productionProducts | Where-Object { $_.sku -eq "AO-SO-MI-001" })[0]
if (-not $productionShirt -or -not $productionShirt.rate_available -or [decimal]$productionShirt.rate -ne 18000) {
  throw "Production product rate availability is incorrect for the seeded product."
}
if ($productionShirt.mapping_status -ne "UNIQUE_SKU") { throw "Seeded local product should have a unique SKU mapping." }

$payrollProducts = Invoke-RestMethod "$base/api/payroll/products" -Headers $headers
if (-not (@($payrollProducts | Where-Object { $_.sku -eq "AO-SO-MI-001" }))) { throw "Payroll product list is missing the seeded product." }
foreach ($group in @($payrollProducts | Where-Object { $_.price_list_id } | Group-Object sku | Where-Object { $_.Name -and $_.Count -gt 1 })) {
  if (@($group.Group | Where-Object { $_.mapping_status -eq "UNIQUE_SKU" }).Count -gt 0) {
    throw "Duplicate SKU group '$($group.Name)' was incorrectly marked UNIQUE_SKU."
  }
}
if (@($payrollProducts | Where-Object { $_.price_list_id -and (-not $_.price_list_name) }).Count -gt 0) {
  throw "Payroll product price-list mapping is incomplete."
}

Write-Host "Local catalog test passed: $(@($products).Count) products, rates, mapping, price-list fields and legacy RPC adapters verified."
