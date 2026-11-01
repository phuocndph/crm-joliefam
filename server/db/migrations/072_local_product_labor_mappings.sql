-- Additive decision/audit store; labor codes remain in local_product_rates.
CREATE TABLE local_labor_mapping_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN('EXACT','RULE')),
 product_id uuid REFERENCES local_products(id),owner_id text,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='EXACT' AND product_id IS NOT NULL) OR (kind='RULE' AND product_id IS NULL))
);
CREATE UNIQUE INDEX local_labor_mapping_exact_product ON local_labor_mapping_decisions(product_id) WHERE kind='EXACT';
CREATE TABLE local_labor_mapping_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),decision_id uuid NOT NULL REFERENCES local_labor_mapping_decisions(id),
 version integer NOT NULL CHECK(version>0),action text NOT NULL CHECK(action IN('DRAFT','APPROVE','RETIRE')),
 effective_from date NOT NULL,effective_to date,CHECK(effective_to IS NULL OR effective_to>=effective_from),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(decision_id,version)
);
CREATE INDEX local_labor_mapping_effective ON local_labor_mapping_versions(decision_id,effective_from,version DESC) WHERE action<>'DRAFT';
CREATE TABLE local_labor_mapping_receipts (
 idempotency_key text PRIMARY KEY CHECK(length(idempotency_key) BETWEEN 1 AND 200),
 actor_id text NOT NULL,fingerprint text NOT NULL CHECK(length(fingerprint)=64),result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION local_labor_mapping_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Lịch sử gán mã may chỉ được bổ sung phiên bản mới.'; END; $$;
CREATE TRIGGER local_labor_mapping_decisions_immutable BEFORE UPDATE OR DELETE ON local_labor_mapping_decisions FOR EACH ROW EXECUTE FUNCTION local_labor_mapping_immutable();
CREATE TRIGGER local_labor_mapping_versions_immutable BEFORE UPDATE OR DELETE ON local_labor_mapping_versions FOR EACH ROW EXECUTE FUNCTION local_labor_mapping_immutable();
CREATE TRIGGER local_labor_mapping_receipts_immutable BEFORE UPDATE OR DELETE ON local_labor_mapping_receipts FOR EACH ROW EXECUTE FUNCTION local_labor_mapping_immutable();
REVOKE ALL ON local_labor_mapping_decisions,local_labor_mapping_versions,local_labor_mapping_receipts FROM PUBLIC;
