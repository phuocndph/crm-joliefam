-- Nullable extensions preserve legacy assignments and stage reports unchanged.
ALTER TABLE local_production_orders ADD COLUMN IF NOT EXISTS dispatch_priority text NOT NULL DEFAULT 'NORMAL';
ALTER TABLE local_production_orders ADD COLUMN IF NOT EXISTS dispatch_reference text;
ALTER TABLE local_production_orders ADD COLUMN IF NOT EXISTS dispatch_notes text;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS dispatch_stage text;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS production_batch_id uuid REFERENCES local_production_batches(id);
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES local_production_order_items(id);
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS allocated_quantity numeric(12,2);
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS accepted_quantity numeric(12,2);
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS returned_quantity numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS dispatch_status text;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS piece_rate_code text;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS rate_unit text;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS accepted_by text;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS discrepancy_reason text;
ALTER TABLE local_production_stage_events ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES local_assignments(id);
ALTER TABLE local_production_stage_events ADD COLUMN IF NOT EXISTS work_date date;
ALTER TABLE local_production_entries ADD COLUMN IF NOT EXISTS source_stage_event_id uuid REFERENCES local_production_stage_events(id);
CREATE UNIQUE INDEX IF NOT EXISTS local_entries_stage_lineage_idx ON local_production_entries(source_stage_event_id) WHERE source_stage_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS local_stage_entry_lineage_idx ON local_production_stage_events(production_entry_id) WHERE production_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_dispatch_assignment_batch_idx ON local_assignments(production_batch_id,dispatch_stage) WHERE dispatch_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_dispatch_assignment_worker_idx ON local_assignments(worker_id,assigned_from) WHERE dispatch_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_dispatch_assignment_item_idx ON local_assignments(order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_dispatch_report_assignment_idx ON local_production_stage_events(assignment_id,status) WHERE assignment_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='local_dispatch_assignment_check') THEN
    ALTER TABLE local_assignments ADD CONSTRAINT local_dispatch_assignment_check CHECK (dispatch_stage IS NULL OR
      (dispatch_stage IN ('CUTTING','SEWING') AND production_batch_id IS NOT NULL AND allocated_quantity > 0 AND returned_quantity >= 0 AND
       (accepted_quantity IS NULL OR accepted_quantity BETWEEN 0 AND allocated_quantity) AND returned_quantity <= coalesce(accepted_quantity,0) AND
       dispatch_status IN ('PENDING','ACCEPTED','REJECTED') AND (dispatch_stage='CUTTING' OR (length(trim(piece_rate_code))>0 AND rate_unit IS NOT NULL))));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS local_dispatch_requests (
  idempotency_key text PRIMARY KEY, actor_id text NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_dispatch_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), production_order_id uuid NOT NULL REFERENCES local_production_orders(id),
  assignment_id uuid REFERENCES local_assignments(id), stage_event_id uuid REFERENCES local_production_stage_events(id),
  action text NOT NULL, quantity numeric(12,2), reason text, actor_id text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_dispatch_audit_order_idx ON local_dispatch_audit_events(production_order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS local_dispatch_audit_assignment_idx ON local_dispatch_audit_events(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS local_dispatch_audit_report_idx ON local_dispatch_audit_events(stage_event_id) WHERE stage_event_id IS NOT NULL;
-- Linked payroll rows can only be changed by the dispatch transaction. Payroll
-- finalization may lock an approved row without altering its source or amounts.
CREATE OR REPLACE FUNCTION guard_dispatch_entry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.source_stage_event_id IS NOT NULL AND coalesce(current_setting('app.dispatch_write',true),'') <> 'on' THEN
    IF TG_OP='UPDATE' AND OLD.workflow_status='APPROVED' AND NEW.workflow_status='LOCKED' AND
      (to_jsonb(OLD)-ARRAY['workflow_status','workflow_reason','workflow_at','workflow_actor_id']) =
      (to_jsonb(NEW)-ARRAY['workflow_status','workflow_reason','workflow_at','workflow_actor_id']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Bản ghi lương gắn giao việc phải được xử lý tại báo cáo công đoạn.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS local_dispatch_entry_guard ON local_production_entries;
CREATE TRIGGER local_dispatch_entry_guard BEFORE UPDATE OR DELETE ON local_production_entries FOR EACH ROW EXECUTE FUNCTION guard_dispatch_entry_mutation();
