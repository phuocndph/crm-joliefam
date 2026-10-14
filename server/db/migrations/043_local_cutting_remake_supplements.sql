-- Additive material supplements for cutting remakes. The approved BASE estimate
-- remains immutable; every REMAKE estimate has its own source and allowance.
ALTER TABLE local_cutting_estimates
  ADD COLUMN IF NOT EXISTS estimate_kind text NOT NULL DEFAULT 'BASE',
  ADD COLUMN IF NOT EXISTS base_estimate_id uuid REFERENCES local_cutting_estimates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_stage_event_id uuid REFERENCES local_production_stage_events(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS remake_quantity numeric(18,4);

ALTER TABLE local_cutting_estimate_lines
  ADD COLUMN IF NOT EXISTS base_estimate_line_id uuid REFERENCES local_cutting_estimate_lines(id) ON DELETE RESTRICT;

ALTER TABLE local_cutting_estimate_lines DROP CONSTRAINT IF EXISTS local_cutting_estimate_lines_calculation_method_check;
ALTER TABLE local_cutting_estimate_lines ADD CONSTRAINT local_cutting_estimate_lines_calculation_method_check
  CHECK (calculation_method IN ('BOM_PER_UNIT','BOM_STANDARD','CUTTING_ENGINE','MANUAL_MEASURED'));

ALTER TABLE local_production_stage_events
  ADD COLUMN IF NOT EXISTS cutting_estimate_id uuid REFERENCES local_cutting_estimates(id) ON DELETE RESTRICT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='local_cutting_estimate_kind_check') THEN
    ALTER TABLE local_cutting_estimates ADD CONSTRAINT local_cutting_estimate_kind_check
      CHECK (estimate_kind IN ('BASE','REMAKE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='local_cutting_estimate_remake_link_check') THEN
    ALTER TABLE local_cutting_estimates ADD CONSTRAINT local_cutting_estimate_remake_link_check CHECK (
      (estimate_kind='BASE' AND base_estimate_id IS NULL AND source_stage_event_id IS NULL AND remake_quantity IS NULL)
      OR
      (estimate_kind='REMAKE' AND base_estimate_id IS NOT NULL AND source_stage_event_id IS NOT NULL AND remake_quantity IS NOT NULL AND remake_quantity>0 AND no_material_required=false)
    );
  END IF;
END $$;

DROP INDEX IF EXISTS local_cutting_estimates_one_approved_idx;
CREATE UNIQUE INDEX IF NOT EXISTS local_cutting_estimates_one_approved_base_idx
  ON local_cutting_estimates(production_order_id,production_batch_id)
  WHERE status='APPROVED' AND estimate_kind='BASE';
CREATE INDEX IF NOT EXISTS local_cutting_estimates_remake_source_idx
  ON local_cutting_estimates(source_stage_event_id,status,created_at)
  WHERE estimate_kind='REMAKE';
CREATE INDEX IF NOT EXISTS local_cutting_estimate_lines_base_idx
  ON local_cutting_estimate_lines(base_estimate_line_id)
  WHERE base_estimate_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_stage_events_cutting_estimate_idx
  ON local_production_stage_events(cutting_estimate_id)
  WHERE cutting_estimate_id IS NOT NULL;

-- Promote the historical typed copies into the generic local standards master
-- only when that product/profile has not already been edited in the new UI.
INSERT INTO local_manufacturing_records(
  id,record_type,product_id,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT p.id::text,'manufacturing_profile',p.product_id::text,'ACTIVE',to_jsonb(p),p.created_at,p.updated_at,false
FROM local_manufacturing_profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM local_manufacturing_records r
  WHERE r.record_type='manufacturing_profile' AND r.product_id=p.product_id::text
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,product_id,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT h.id::text,'bom_header',h.product_id::text,
  CASE WHEN h.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
  to_jsonb(h),h.created_at,h.updated_at,false
FROM local_bom_headers h
WHERE NOT EXISTS (
  SELECT 1 FROM local_manufacturing_records r
  WHERE r.record_type='bom_header' AND r.product_id=h.product_id::text
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,parent_id,version_number,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT v.id::text,'bom_version',v.bom_id::text,v.version_number,v.status,to_jsonb(v),v.created_at,v.created_at,false
FROM local_bom_versions v
JOIN local_manufacturing_records h ON h.id=v.bom_id::text AND h.record_type='bom_header'
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,parent_id,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT l.id::text,'bom_line',l.bom_version_id::text,'HISTORICAL',to_jsonb(l),now(),now(),false
FROM local_bom_lines l
JOIN local_manufacturing_records v ON v.id=l.bom_version_id::text AND v.record_type='bom_version'
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,product_id,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT p.id::text,'cutting_profile',p.product_id::text,
  CASE WHEN p.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
  to_jsonb(p),p.created_at,p.updated_at,false
FROM local_cutting_profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM local_manufacturing_records r
  WHERE r.record_type='cutting_profile' AND r.product_id=p.product_id::text
    AND lower(coalesce(r.payload->>'code',''))=lower(p.code)
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,parent_id,version_number,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT v.id::text,'cutting_version',v.cutting_profile_id::text,v.version_number,v.status,to_jsonb(v),v.created_at,v.updated_at,false
FROM local_cutting_versions v
JOIN local_manufacturing_records p ON p.id=v.cutting_profile_id::text AND p.record_type='cutting_profile'
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,product_id,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT h.id::text,'routing_header',h.product_id::text,
  CASE WHEN h.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
  to_jsonb(h),h.created_at,h.updated_at,false
FROM local_routing_headers h
WHERE NOT EXISTS (
  SELECT 1 FROM local_manufacturing_records r
  WHERE r.record_type='routing_header' AND r.product_id=h.product_id::text
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,parent_id,version_number,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT v.id::text,'routing_version',v.routing_id::text,v.version_number,v.status,to_jsonb(v),v.created_at,v.updated_at,false
FROM local_routing_versions v
JOIN local_manufacturing_records h ON h.id=v.routing_id::text AND h.record_type='routing_header'
ON CONFLICT(id) DO NOTHING;

INSERT INTO local_manufacturing_records(
  id,record_type,parent_id,status,payload,created_at,updated_at,is_snapshot_record
)
SELECT o.id::text,'routing_operation',o.routing_version_id::text,'HISTORICAL',to_jsonb(o),o.created_at,o.updated_at,false
FROM local_routing_operations o
JOIN local_manufacturing_records v ON v.id=o.routing_version_id::text AND v.record_type='routing_version'
ON CONFLICT(id) DO NOTHING;
