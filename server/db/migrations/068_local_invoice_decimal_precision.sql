-- Preserve source amounts and ISO currencies with three/four minor decimals.
-- Widen only: existing ledger values keep their exact numeric value.
ALTER TABLE local_einvoices
 ALTER COLUMN total_amount TYPE numeric(24,6),
 ALTER COLUMN vat_amount TYPE numeric(24,6),
 ALTER COLUMN total_with_vat TYPE numeric(24,6);
ALTER TABLE local_invoice_lines
 ALTER COLUMN quantity TYPE numeric(24,6),
 ALTER COLUMN unit_price TYPE numeric(24,6),
 ALTER COLUMN subtotal TYPE numeric(24,6),
 ALTER COLUMN vat_amount TYPE numeric(24,6),
 ALTER COLUMN total TYPE numeric(24,6);
ALTER TABLE local_invoice_contract_allocations ALTER COLUMN amount TYPE numeric(24,6);
ALTER TABLE local_invoice_payment_allocations ALTER COLUMN amount TYPE numeric(24,6);
