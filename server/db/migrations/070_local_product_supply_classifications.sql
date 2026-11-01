-- Product identity stays in local_products; these are immutable classification decisions.
CREATE TABLE local_product_supply_classifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES local_products(id),
 version integer NOT NULL CHECK(version>0),
 route text NOT NULL CHECK(route IN ('SEW','PURCHASE','UNCLASSIFIED')),
 source_fingerprint text NOT NULL CHECK(length(source_fingerprint)=64),
 rule_version text NOT NULL,
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
 created_by text NOT NULL CHECK(length(btrim(created_by))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,version)
);
CREATE INDEX local_product_supply_latest_idx ON local_product_supply_classifications(product_id,version DESC);
CREATE TABLE local_product_supply_receipts (
 idempotency_key text PRIMARY KEY CHECK(length(idempotency_key) BETWEEN 1 AND 200),
 actor_id text NOT NULL,
 fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION local_product_supply_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Lịch sử phân loại chỉ được bổ sung phiên bản mới.'; END;
$$;
CREATE TRIGGER local_product_supply_history_immutable BEFORE UPDATE OR DELETE ON local_product_supply_classifications
 FOR EACH ROW EXECUTE FUNCTION local_product_supply_immutable();
CREATE TRIGGER local_product_supply_receipt_immutable BEFORE UPDATE OR DELETE ON local_product_supply_receipts
 FOR EACH ROW EXECUTE FUNCTION local_product_supply_immutable();
-- No browser/database-public access. Authenticated local API enforces product owner scope.
REVOKE ALL ON local_product_supply_classifications,local_product_supply_receipts FROM PUBLIC;
