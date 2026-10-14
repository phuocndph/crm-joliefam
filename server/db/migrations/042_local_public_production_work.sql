-- Public offers are quotas only. A claim creates the canonical assignment row.
CREATE TABLE local_production_job_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE RESTRICT,
  production_batch_id uuid NOT NULL REFERENCES local_production_batches(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES local_production_order_items(id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('CUTTING','SEWING')),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  eligible_worker_type text NOT NULL CHECK (eligible_worker_type IN ('CUTTER','SEWER','SEWING')),
  eligible_supervisor_worker_id uuid REFERENCES local_workers(id) ON DELETE RESTRICT,
  piece_rate_code text,
  rate_unit text,
  assigned_from date NOT NULL,
  assigned_to date,
  notes text,
  created_by text NOT NULL,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (assigned_to IS NULL OR assigned_to >= assigned_from),
  CHECK (stage='CUTTING' OR (length(btrim(coalesce(piece_rate_code,''))) > 0 AND rate_unit IS NOT NULL))
);

ALTER TABLE local_assignments ADD COLUMN IF NOT EXISTS publication_id uuid REFERENCES local_production_job_publications(id) ON DELETE RESTRICT;
ALTER TABLE local_production_stage_events ADD COLUMN IF NOT EXISTS source_stage_event_id uuid REFERENCES local_production_stage_events(id) ON DELETE RESTRICT;
ALTER TABLE local_production_stage_events ADD COLUMN IF NOT EXISTS repair_kind text CHECK (repair_kind IS NULL OR repair_kind IN ('REWORK','REMAKE'));
ALTER TABLE local_production_stage_events ADD COLUMN IF NOT EXISTS is_payable boolean NOT NULL DEFAULT true;

CREATE INDEX local_publications_open_scope_idx ON local_production_job_publications(status,stage,eligible_worker_type,assigned_from,assigned_to);
CREATE INDEX local_publications_batch_idx ON local_production_job_publications(production_batch_id,order_item_id,stage);
CREATE INDEX local_assignments_publication_idx ON local_assignments(publication_id) WHERE publication_id IS NOT NULL;
CREATE INDEX local_stage_events_source_idx ON local_production_stage_events(source_stage_event_id) WHERE source_stage_event_id IS NOT NULL;
