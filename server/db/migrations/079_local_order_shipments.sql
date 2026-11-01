-- One shipment ledger for sewn outputs and purchased finished goods.
ALTER TABLE local_production_orders ALTER COLUMN order_id TYPE text USING order_id::text;
ALTER TABLE local_production_shipments ALTER COLUMN production_order_id DROP NOT NULL;
ALTER TABLE local_production_shipments ALTER COLUMN inventory_document_id DROP NOT NULL;
ALTER TABLE local_production_shipments DROP CONSTRAINT local_production_shipments_status_check;
ALTER TABLE local_production_shipments ADD CHECK(status IN ('DISPATCHED','PARTIALLY_DELIVERED','DELIVERED'));
ALTER TABLE local_production_shipments ADD COLUMN order_source_snapshot jsonb NOT NULL DEFAULT '{"legacy":true}'::jsonb;
ALTER TABLE local_production_shipment_lines ALTER COLUMN output_id DROP NOT NULL;
ALTER TABLE local_production_shipment_lines ADD COLUMN purchase_plan_id uuid REFERENCES local_purchase_fulfillment_plans(id) ON DELETE RESTRICT;
ALTER TABLE local_production_shipment_lines ADD COLUMN delivered_quantity numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE local_production_shipment_lines ADD COLUMN source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE local_production_shipment_lines l SET delivered_quantity=CASE WHEN s.status='DELIVERED' THEN l.quantity ELSE 0 END FROM local_production_shipments s WHERE s.id=l.shipment_id;
UPDATE local_production_shipment_lines l SET source_snapshot=jsonb_build_object('legacy',true,'product_id',i.product_id,'product_name',i.product_name,'color',i.color,'size',i.size,'dimensions',i.dimensions)
 FROM local_production_shipments s,local_production_outputs x,local_production_order_items i
 WHERE s.id=l.shipment_id AND x.id=l.output_id AND i.id=x.order_item_id;
ALTER TABLE local_production_shipment_lines ADD CHECK((output_id IS NOT NULL)::int+(purchase_plan_id IS NOT NULL)::int=1);
ALTER TABLE local_production_shipment_lines ADD CHECK(delivered_quantity>=0 AND delivered_quantity<=quantity);
CREATE UNIQUE INDEX local_shipment_purchase_plan_idx ON local_production_shipment_lines(shipment_id,purchase_plan_id) WHERE purchase_plan_id IS NOT NULL;
CREATE INDEX local_shipment_purchase_lookup_idx ON local_production_shipment_lines(purchase_plan_id);
CREATE TABLE local_order_delivery_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shipment_id uuid NOT NULL REFERENCES local_production_shipments(id) ON DELETE RESTRICT,
 shipment_line_id uuid NOT NULL REFERENCES local_production_shipment_lines(id) ON DELETE RESTRICT,
 quantity numeric(18,4) NOT NULL CHECK(quantity>0),recipient_name text,delivery_evidence text,
 provenance text NOT NULL DEFAULT 'CUSTOMER_RECEIPT' CHECK(provenance IN ('CUSTOMER_RECEIPT','LEGACY_HEADER')),
 delivered_at timestamptz NOT NULL,actor_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO local_order_delivery_events(shipment_id,shipment_line_id,quantity,recipient_name,delivery_evidence,delivered_at,actor_id,provenance)
 SELECT s.id,l.id,l.delivered_quantity,s.recipient_name,s.delivery_evidence,coalesce(s.delivered_at,s.dispatched_at),coalesce(s.delivered_by,s.created_by),'LEGACY_HEADER'
 FROM local_production_shipments s JOIN local_production_shipment_lines l ON l.shipment_id=s.id WHERE l.delivered_quantity>0;
CREATE FUNCTION local_order_delivery_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Lịch sử nhận hàng không được sửa hoặc xóa.'; END; $$;
CREATE TRIGGER local_order_delivery_event_immutable BEFORE UPDATE OR DELETE ON local_order_delivery_events FOR EACH ROW EXECUTE FUNCTION local_order_delivery_event_immutable();
CREATE TABLE local_shipment_hold_consumptions (
 shipment_line_id uuid NOT NULL REFERENCES local_production_shipment_lines(id) ON DELETE RESTRICT,
 reservation_id uuid NOT NULL REFERENCES local_purchase_stock_reservations(id) ON DELETE RESTRICT,
 quantity numeric(18,4) NOT NULL CHECK(quantity>0),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(shipment_line_id,reservation_id)
);
CREATE TRIGGER local_shipment_hold_consumptions_immutable BEFORE UPDATE OR DELETE ON local_shipment_hold_consumptions FOR EACH ROW EXECUTE FUNCTION local_order_delivery_event_immutable();
CREATE FUNCTION local_shipment_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot OR NEW.output_id IS DISTINCT FROM OLD.output_id OR NEW.purchase_plan_id IS DISTINCT FROM OLD.purchase_plan_id OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id OR NEW.source_order_item_key IS DISTINCT FROM OLD.source_order_item_key OR NEW.inventory_movement_id IS DISTINCT FROM OLD.inventory_movement_id THEN RAISE EXCEPTION 'Nguồn phiếu giao đã ghi không được sửa.'; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER local_shipment_source_immutable BEFORE UPDATE ON local_production_shipment_lines FOR EACH ROW EXECUTE FUNCTION local_shipment_source_immutable();
REVOKE ALL ON local_order_delivery_events,local_shipment_hold_consumptions FROM PUBLIC;
