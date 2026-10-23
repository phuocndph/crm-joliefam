-- Additive local workflow. Historical generations keep their original completion rules.
ALTER TABLE local_production_orders ALTER COLUMN workflow_generation SET DEFAULT 'WORKFLOW_V3';
ALTER TABLE local_assignments DROP CONSTRAINT local_dispatch_assignment_check;
ALTER TABLE local_assignments ADD CONSTRAINT local_dispatch_assignment_check CHECK (dispatch_stage IS NULL OR
 (dispatch_stage IN ('CUTTING','SEWING','FINISHING','COUNTING') AND production_batch_id IS NOT NULL AND allocated_quantity>0 AND returned_quantity>=0
 AND (accepted_quantity IS NULL OR accepted_quantity BETWEEN 0 AND allocated_quantity) AND returned_quantity<=coalesce(accepted_quantity,0)
 AND dispatch_status IN ('PENDING','ACCEPTED','REJECTED') AND (dispatch_stage<>'SEWING' OR (length(trim(piece_rate_code))>0 AND rate_unit IS NOT NULL))));
ALTER TABLE local_production_job_publications DROP CONSTRAINT local_production_job_publications_stage_check;
ALTER TABLE local_production_job_publications DROP CONSTRAINT local_production_job_publications_eligible_worker_type_check;
ALTER TABLE local_production_job_publications DROP CONSTRAINT local_production_job_publications_check1;
ALTER TABLE local_production_job_publications ADD CHECK(stage IN ('CUTTING','SEWING','FINISHING','COUNTING'));
ALTER TABLE local_production_job_publications ADD CHECK(eligible_worker_type IN ('CUTTER','SEWER','SEWING','IRONING','QC','PACKER'));
ALTER TABLE local_production_job_publications ADD CHECK(stage<>'SEWING' OR (length(btrim(coalesce(piece_rate_code,'')))>0 AND rate_unit IS NOT NULL));
ALTER TABLE local_production_outputs ADD COLUMN production_batch_id uuid REFERENCES local_production_batches(id);
ALTER TABLE local_production_outputs ADD COLUMN order_item_id uuid REFERENCES local_production_order_items(id);
ALTER TABLE local_production_outputs ADD COLUMN inventory_item_id uuid REFERENCES local_inventory_items(id);
ALTER TABLE local_production_outputs ADD COLUMN inventory_receipt_id uuid REFERENCES local_inventory_documents(id);
ALTER TABLE local_production_outputs ADD COLUMN inventory_movement_id uuid REFERENCES local_inventory_movements(id);
ALTER TABLE local_production_outputs ADD COLUMN created_by text;
ALTER TABLE local_production_outputs ADD COLUMN valuation_status text NOT NULL DEFAULT 'UNVALUED' CHECK(valuation_status IN ('UNVALUED','VALUED'));
CREATE UNIQUE INDEX local_production_output_movement_idx ON local_production_outputs(inventory_movement_id) WHERE inventory_movement_id IS NOT NULL;
CREATE INDEX local_production_output_lot_idx ON local_production_outputs(production_order_id,production_batch_id,order_item_id);
CREATE TABLE local_production_product_inventory_maps (
 product_id uuid PRIMARY KEY REFERENCES local_products(id), inventory_item_id uuid NOT NULL UNIQUE REFERENCES local_inventory_items(id),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_production_shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),production_order_id uuid NOT NULL REFERENCES local_production_orders(id),
 order_id text NOT NULL REFERENCES local_orders(id),shipment_number text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED','DELIVERED')),
 inventory_document_id uuid NOT NULL UNIQUE REFERENCES local_inventory_documents(id),
 dispatched_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,recipient_name text,delivery_evidence text,
 carrier_reference text,created_by text NOT NULL,delivered_by text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_production_shipment_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shipment_id uuid NOT NULL REFERENCES local_production_shipments(id),
 output_id uuid NOT NULL REFERENCES local_production_outputs(id),source_order_item_key text NOT NULL,
 quantity numeric(18,4) NOT NULL CHECK(quantity>0),inventory_movement_id uuid NOT NULL UNIQUE REFERENCES local_inventory_movements(id),
 UNIQUE(shipment_id,output_id)
);
CREATE INDEX local_production_shipment_order_idx ON local_production_shipments(order_id,status);
CREATE INDEX local_production_shipment_output_idx ON local_production_shipment_lines(output_id);
CREATE TABLE local_production_repair_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),production_order_id uuid NOT NULL REFERENCES local_production_orders(id),
 production_batch_id uuid NOT NULL REFERENCES local_production_batches(id),order_item_id uuid NOT NULL REFERENCES local_production_order_items(id),
 source_stage_event_id uuid NOT NULL REFERENCES local_production_stage_events(id),quantity numeric(18,4) NOT NULL CHECK(quantity>0),
 target_stage text NOT NULL CHECK(target_stage IN ('SEWING','FINISHING')),return_stage text NOT NULL CHECK(return_stage IN ('FINISHING','COUNTING')),
 reason text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE local_assignments ADD COLUMN repair_ticket_id uuid REFERENCES local_production_repair_tickets(id);
ALTER TABLE local_production_job_publications ADD COLUMN repair_ticket_id uuid REFERENCES local_production_repair_tickets(id);
CREATE INDEX local_production_repair_source_idx ON local_production_repair_tickets(source_stage_event_id);
CREATE VIEW local_production_effective_stage_good AS
 SELECT e.production_order_id,e.production_batch_id,e.order_item_id,e.stage,e.quantity_good,e.id,e.assignment_id
 FROM local_production_stage_events e JOIN local_assignments a ON a.id=e.assignment_id
 LEFT JOIN local_production_repair_tickets t ON t.id=a.repair_ticket_id
 WHERE e.status IN ('APPROVED','LOCKED') AND (a.repair_ticket_id IS NULL OR e.stage=t.return_stage);
-- Browser users use the authenticated local API; these are never public SQL tables.
REVOKE ALL ON local_production_product_inventory_maps,local_production_shipments,local_production_shipment_lines,local_production_repair_tickets,local_production_effective_stage_good FROM PUBLIC;
