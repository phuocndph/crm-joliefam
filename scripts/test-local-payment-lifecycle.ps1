param([string]$Base = "http://127.0.0.1:8787")

$ErrorActionPreference = "Stop"
$base = $Base.TrimEnd('/')
$session = Invoke-RestMethod "$base/api/local-auth/session"
$headers = @{ Authorization = "Bearer $($session.token)" }
$suffix = [guid]::NewGuid().ToString("N").Substring(0, 10)
$customer = $null
$order = $null

function Invoke-Json($url, $method, $body = $null) {
  $params = @{ Uri = $url; Method = $method; Headers = $headers }
  if ($null -ne $body) {
    $params.ContentType = "application/json"
    $params.Body = ($body | ConvertTo-Json -Depth 10 -Compress)
  }
  return Invoke-RestMethod @params
}

try {
  $customer = Invoke-Json "$base/api/customers" POST @{ name = "Payment compat $suffix" }
  $order = Invoke-Json "$base/api/orders" POST @{ order_number = "PAY-COMPAT-$suffix"; customer_id = $customer.id; total_amount = 100000; subtotal = 100000; items = @() }
  $recorded = Invoke-Json "$base/api/order-payments/record" POST @{ order_id = $order.id; payment_amount = 25000; payment_date = "2025-01-02T00:00:00Z"; payment_method = "cash"; transaction = @{ description = "Compat payment $suffix" } }
  $paymentId = [string]$recorded.payment.id
  if ([string]::IsNullOrWhiteSpace($paymentId)) { throw "Payment record did not return an ID." }
  $deleted = Invoke-Json "$base/api/order-payments/by-id/$paymentId" DELETE
  if ($deleted.order_id -ne $order.id) { throw "Payment delete returned the wrong order." }
  $remaining = @(Invoke-Json "$base/api/order-payments?orderId=$($order.id)" GET | ForEach-Object { $_ })
  if ($remaining.Count -ne 0) { throw "Payment-by-id delete removed only part of the payment row set." }
  $orders = @(Invoke-Json "$base/api/orders?search=PAY-COMPAT-$suffix&limit=10" GET | ForEach-Object { $_ })
  $after = $orders | Where-Object { $_.id -eq $order.id } | Select-Object -First 1
  if (-not $after -or $after.payment_status -notin @("pending", "unpaid")) { throw "Order payment status was not recalculated after deleting the payment." }
  Write-Host "Local payment lifecycle test passed: delete-by-id is scoped and order payment status is recalculated."
}
finally {
  if ($order) { try { Invoke-Json "$base/api/orders/$($order.id)" DELETE | Out-Null } catch {} }
  if ($customer) { try { Invoke-Json "$base/api/customers/$($customer.id)" DELETE | Out-Null } catch {} }
}
