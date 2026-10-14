-- Keep local fabric usage and its outbound transaction linked so edits and
-- reversals can restore stock without touching the Supabase project.
ALTER TABLE local_fabric_usage
  ADD COLUMN IF NOT EXISTS order_group text NOT NULL DEFAULT 'unclassified';

ALTER TABLE local_fabric_transactions
  ADD COLUMN IF NOT EXISTS fabric_usage_id text;

UPDATE local_fabric_usage
SET order_group = CASE customer_code
  WHEN 'don_phuoc' THEN 'don_phuoc'
  WHEN 'don_hoan' THEN 'don_hoan'
  ELSE order_group
END
WHERE order_group = 'unclassified' AND customer_code IN ('don_phuoc', 'don_hoan');

CREATE INDEX IF NOT EXISTS local_fabric_transactions_usage_idx
  ON local_fabric_transactions(fabric_usage_id)
  WHERE fabric_usage_id IS NOT NULL;
