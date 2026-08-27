-- Additive financial snapshots for VAT-excluded reporting and auditable cost backfill.
-- All columns are nullable/defaulted so existing users and orders continue to work.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric,
  ADD COLUMN IF NOT EXISTS include_vat boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_price_source text DEFAULT 'historical',
  ADD COLUMN IF NOT EXISTS cost_price_is_estimated boolean DEFAULT false;

COMMENT ON COLUMN public.orders.subtotal IS 'Revenue amount before VAT captured at order time';
COMMENT ON COLUMN public.orders.vat_amount IS 'VAT amount captured at order time';
COMMENT ON COLUMN public.orders.cost_price_source IS 'historical, quote, product_estimated, or missing';
COMMENT ON COLUMN public.orders.cost_price_is_estimated IS 'True when cost_price was backfilled or inferred';
