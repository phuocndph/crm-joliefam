-- Drop view payment_summary temporarily to allow column type changes
DROP VIEW IF EXISTS public.payment_summary CASCADE;

-- Remove numeric precision limits on quotes table to allow larger values
ALTER TABLE public.quotes 
  ALTER COLUMN total_amount TYPE numeric,
  ALTER COLUMN subtotal TYPE numeric,
  ALTER COLUMN vat_amount TYPE numeric;

-- Update orders table
ALTER TABLE public.orders 
  ALTER COLUMN total_amount TYPE numeric,
  ALTER COLUMN cost_price TYPE numeric,
  ALTER COLUMN profit_before TYPE numeric,
  ALTER COLUMN profit_after TYPE numeric;

-- Update order_payments table
ALTER TABLE public.order_payments 
  ALTER COLUMN payment_amount TYPE numeric;

-- Update transactions table
ALTER TABLE public.transactions 
  ALTER COLUMN amount TYPE numeric,
  ALTER COLUMN remaining_amount TYPE numeric;

-- Update expenses table
ALTER TABLE public.expenses 
  ALTER COLUMN amount TYPE numeric;

-- Update finance_data table
ALTER TABLE public.finance_data 
  ALTER COLUMN amount TYPE numeric;

-- Recreate payment_summary view with updated column types
CREATE OR REPLACE VIEW public.payment_summary AS
SELECT 
  o.id AS order_id,
  o.order_number,
  o.payment_status,
  o.total_amount,
  o.payment_date AS final_payment_date,
  c.name AS customer_name,
  c.customer_code,
  COALESCE(SUM(op.payment_amount), 0) AS total_paid,
  o.total_amount - COALESCE(SUM(op.payment_amount), 0) AS remaining_amount,
  COUNT(op.id) AS payment_count,
  MIN(op.payment_date) AS first_payment_date,
  MAX(op.payment_date) AS last_payment_date
FROM public.orders o
LEFT JOIN public.order_payments op ON o.id = op.order_id
LEFT JOIN public.customers c ON o.customer_id = c.id
GROUP BY o.id, o.order_number, o.payment_status, o.total_amount, o.payment_date, c.name, c.customer_code;

COMMENT ON COLUMN public.quotes.total_amount IS 'Tổng tiền không giới hạn';
COMMENT ON COLUMN public.orders.total_amount IS 'Tổng tiền không giới hạn';