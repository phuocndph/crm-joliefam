-- Keep the local order aggregate compatible with the original order form.
-- These columns are additive and do not alter the Supabase public database.
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS tenant_id text DEFAULT 'local-tenant';
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS subtotal numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS vat_rate numeric(8,3) NOT NULL DEFAULT 0;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS vat_amount numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS include_vat boolean NOT NULL DEFAULT false;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS cost_price_source text;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS cost_price_is_estimated boolean NOT NULL DEFAULT false;
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS is_snapshot_record boolean NOT NULL DEFAULT true;
