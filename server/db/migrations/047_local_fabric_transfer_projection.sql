-- Keep the fabric-transfer canonical table in step with imported snapshots.
-- This is append-only; the original bootstrap migration remains unchanged.

UPDATE local_fabric_transfers transfer_row
SET is_snapshot_record = false,
    local_modified_at = COALESCE(transfer_row.local_modified_at, transfer_row.updated_at, transfer_row.created_at, now())
WHERE NOT EXISTS (
  SELECT 1 FROM local_source_snapshots snapshot
  WHERE snapshot.source = 'SUPABASE'
    AND snapshot.source_table = 'fabric_transfers'
    AND snapshot.source_key = transfer_row.id
);

INSERT INTO local_fabric_transfers (
  id, fabric_variant_id, from_warehouse_id, to_warehouse_id, quantity,
  transfer_date, status, notes, approved_by, received_by, manager_id,
  tenant_id, created_at, updated_at, is_snapshot_record
)
SELECT
  snapshot.source_key,
  snapshot.payload->>'fabric_variant_id',
  snapshot.payload->>'from_warehouse_id',
  snapshot.payload->>'to_warehouse_id',
  COALESCE(NULLIF(snapshot.payload->>'quantity', '')::numeric, 0),
  NULLIF(snapshot.payload->>'transfer_date', '')::timestamptz,
  snapshot.payload->>'status',
  snapshot.payload->>'notes',
  snapshot.payload->>'approved_by',
  snapshot.payload->>'received_by',
  snapshot.payload->>'manager_id',
  snapshot.payload->>'tenant_id',
  COALESCE(NULLIF(snapshot.payload->>'created_at', '')::timestamptz, snapshot.source_updated_at, now()),
  COALESCE(NULLIF(snapshot.payload->>'updated_at', '')::timestamptz, snapshot.source_updated_at, now()),
  true
FROM local_source_snapshots snapshot
WHERE snapshot.source = 'SUPABASE'
  AND snapshot.source_table = 'fabric_transfers'
  AND NOT snapshot.is_deleted
ON CONFLICT (id) DO UPDATE SET
  fabric_variant_id = excluded.fabric_variant_id,
  from_warehouse_id = excluded.from_warehouse_id,
  to_warehouse_id = excluded.to_warehouse_id,
  quantity = excluded.quantity,
  transfer_date = excluded.transfer_date,
  status = excluded.status,
  notes = excluded.notes,
  approved_by = excluded.approved_by,
  received_by = excluded.received_by,
  manager_id = excluded.manager_id,
  tenant_id = excluded.tenant_id,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  is_snapshot_record = true
WHERE local_fabric_transfers.local_modified_at IS NULL;
