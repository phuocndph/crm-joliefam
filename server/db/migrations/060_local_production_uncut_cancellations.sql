-- Append-only cancellations of planned output that has not entered cutting.
-- No backfill, no changes to original plans, Sale allocations, wages or stock.
CREATE TABLE local_production_uncut_cancellations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 production_order_id uuid NOT NULL REFERENCES local_production_orders(id),
 production_batch_id uuid NOT NULL REFERENCES local_production_batches(id),
 order_item_id uuid NOT NULL REFERENCES local_production_order_items(id),
 quantity numeric(18,4) NOT NULL CHECK(quantity>0),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 idempotency_key text NOT NULL UNIQUE
);
CREATE INDEX local_production_uncut_scope_idx ON local_production_uncut_cancellations(production_order_id,production_batch_id,order_item_id);
CREATE FUNCTION local_production_uncut_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Production uncut cancellations are append-only'; END;
$$;
CREATE TRIGGER local_production_uncut_immutable BEFORE UPDATE OR DELETE ON local_production_uncut_cancellations FOR EACH ROW EXECUTE FUNCTION local_production_uncut_immutable();
REVOKE ALL ON local_production_uncut_cancellations FROM PUBLIC;
REVOKE ALL ON FUNCTION local_production_uncut_immutable() FROM PUBLIC;
