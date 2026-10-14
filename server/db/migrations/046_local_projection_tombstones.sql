-- Keep local deletes durable across future Supabase snapshot refreshes.
-- LOCAL tombstones always win over SOURCE tombstones for the same key.

CREATE TABLE IF NOT EXISTS local_projection_tombstones (
  source_table text NOT NULL,
  source_key text NOT NULL,
  tombstone_kind text NOT NULL CHECK (tombstone_kind IN ('LOCAL', 'SOURCE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_table, source_key)
);

CREATE INDEX IF NOT EXISTS local_projection_tombstones_kind_idx
  ON local_projection_tombstones(tombstone_kind, source_table, updated_at DESC);

-- Rows that never had an imported snapshot are local rows. Mark all three
-- canonical projections explicitly so a later refresh cannot overwrite them.
UPDATE local_order_payments payment
SET is_snapshot_record = false,
    local_modified_at = COALESCE(payment.local_modified_at, payment.updated_at, payment.created_at, now())
WHERE NOT EXISTS (
  SELECT 1 FROM local_source_snapshots snapshot
  WHERE snapshot.source = 'SUPABASE'
    AND snapshot.source_table = 'order_payments'
    AND snapshot.source_key = payment.id
);

UPDATE local_transactions transaction_row
SET is_snapshot_record = false,
    local_modified_at = COALESCE(transaction_row.local_modified_at, transaction_row.updated_at, transaction_row.created_at, now())
WHERE NOT EXISTS (
  SELECT 1 FROM local_source_snapshots snapshot
  WHERE snapshot.source = 'SUPABASE'
    AND snapshot.source_table = 'transactions'
    AND snapshot.source_key = transaction_row.id
);

UPDATE local_ghn_tracking tracking
SET is_snapshot_record = false,
    local_modified_at = COALESCE(tracking.local_modified_at, tracking.updated_at, tracking.created_at, now())
WHERE NOT EXISTS (
  SELECT 1 FROM local_source_snapshots snapshot
  WHERE snapshot.source = 'SUPABASE'
    AND snapshot.source_table = 'ghn_tracking'
    AND snapshot.source_key = tracking.id
);

-- Materialize source deletions immediately. The sync projection repeats this
-- operation, making it safe to replay after every incremental or full import.
INSERT INTO local_projection_tombstones(source_table, source_key, tombstone_kind)
SELECT snapshot.source_table, snapshot.source_key, 'SOURCE'
FROM local_source_snapshots snapshot
WHERE snapshot.source = 'SUPABASE'
  AND snapshot.source_table IN ('order_payments', 'transactions', 'ghn_tracking')
  AND snapshot.is_deleted
ON CONFLICT (source_table, source_key) DO UPDATE SET
  tombstone_kind = CASE
    WHEN local_projection_tombstones.tombstone_kind = 'LOCAL' THEN 'LOCAL'
    ELSE 'SOURCE'
  END,
  updated_at = now();

DELETE FROM local_order_payments payment
USING local_projection_tombstones tombstone
WHERE tombstone.source_table = 'order_payments'
  AND tombstone.tombstone_kind = 'SOURCE'
  AND tombstone.source_key = payment.id
  AND payment.local_modified_at IS NULL;

DELETE FROM local_transactions transaction_row
USING local_projection_tombstones tombstone
WHERE tombstone.source_table = 'transactions'
  AND tombstone.tombstone_kind = 'SOURCE'
  AND tombstone.source_key = transaction_row.id
  AND transaction_row.local_modified_at IS NULL;

DELETE FROM local_ghn_tracking tracking
USING local_projection_tombstones tombstone
WHERE tombstone.source_table = 'ghn_tracking'
  AND tombstone.tombstone_kind = 'SOURCE'
  AND tombstone.source_key = tracking.id
  AND tracking.local_modified_at IS NULL;
