-- Versioned cutting estimates and explicit links to the authoritative inventory ledger.
CREATE TABLE local_fabric_inventory_item_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fabric_variant_id text NOT NULL UNIQUE,
  inventory_item_id uuid NOT NULL REFERENCES local_inventory_items(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_cutting_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES local_production_orders(id) ON DELETE RESTRICT,
  production_batch_id uuid NOT NULL REFERENCES local_production_batches(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','SUPERSEDED')),
  no_material_required boolean NOT NULL DEFAULT false,
  reason text,
  created_by text NOT NULL,
  submitted_by text,
  reviewed_by text,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  UNIQUE(production_order_id,production_batch_id,version_number),
  CHECK (NOT no_material_required OR length(btrim(coalesce(reason,''))) > 0)
);

CREATE TABLE local_cutting_estimate_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES local_cutting_estimates(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES local_production_order_items(id) ON DELETE RESTRICT,
  fabric_variant_id text,
  inventory_item_id uuid NOT NULL REFERENCES local_inventory_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES local_inventory_warehouses(id) ON DELETE RESTRICT,
  output_quantity numeric(18,4) NOT NULL CHECK (output_quantity > 0),
  calculation_method text NOT NULL CHECK (calculation_method IN ('BOM_PER_UNIT','CUTTING_ENGINE','MANUAL_MEASURED')),
  unit_per_output numeric(18,6),
  waste_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK (waste_rate >= 0),
  waste_already_included boolean NOT NULL DEFAULT false,
  estimated_quantity numeric(18,4) NOT NULL CHECK (estimated_quantity > 0),
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (calculation_method <> 'MANUAL_MEASURED' OR length(btrim(coalesce(override_reason,''))) > 0)
);

ALTER TABLE local_inventory_documents ADD COLUMN IF NOT EXISTS cutting_estimate_id uuid REFERENCES local_cutting_estimates(id) ON DELETE RESTRICT;
ALTER TABLE local_inventory_document_lines ADD COLUMN IF NOT EXISTS cutting_estimate_line_id uuid REFERENCES local_cutting_estimate_lines(id) ON DELETE RESTRICT;
ALTER TABLE local_inventory_movements ADD COLUMN IF NOT EXISTS cutting_estimate_line_id uuid REFERENCES local_cutting_estimate_lines(id) ON DELETE RESTRICT;

CREATE INDEX local_cutting_estimates_order_idx ON local_cutting_estimates(production_order_id,production_batch_id,status,version_number DESC);
CREATE UNIQUE INDEX local_cutting_estimates_one_approved_idx ON local_cutting_estimates(production_order_id,production_batch_id) WHERE status='APPROVED';
CREATE INDEX local_cutting_estimate_lines_estimate_idx ON local_cutting_estimate_lines(estimate_id,order_item_id);
CREATE INDEX local_cutting_estimate_lines_inventory_idx ON local_cutting_estimate_lines(inventory_item_id,warehouse_id);
CREATE INDEX local_inventory_docs_estimate_idx ON local_inventory_documents(cutting_estimate_id) WHERE cutting_estimate_id IS NOT NULL;
CREATE INDEX local_inventory_movements_estimate_line_idx ON local_inventory_movements(cutting_estimate_line_id,warehouse_id) WHERE cutting_estimate_line_id IS NOT NULL;
