-- Canonical current profile remains local_manufacturing_records manufacturing_profile.
CREATE TABLE local_product_technical_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES local_products(id),
 profile_id text NOT NULL REFERENCES local_manufacturing_records(id),version integer NOT NULL CHECK(version>0),
 action text NOT NULL CHECK(action IN ('DRAFT','CONFIRM','LEGACY_EDIT')),
 source_fingerprint text NOT NULL CHECK(length(source_fingerprint)=64),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(product_id,version)
);
CREATE INDEX local_product_technical_profile_idx ON local_product_technical_versions(profile_id,version DESC);
CREATE INDEX local_product_technical_latest_idx ON local_product_technical_versions(product_id,version DESC);
CREATE TABLE local_product_technical_receipts (
 idempotency_key text PRIMARY KEY CHECK(length(idempotency_key) BETWEEN 1 AND 200),actor_id text NOT NULL,
 fingerprint text NOT NULL CHECK(length(fingerprint)=64),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION local_product_technical_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Lịch sử đặc điểm sản phẩm chỉ được bổ sung phiên bản mới.'; END; $$;
CREATE TRIGGER local_product_technical_versions_immutable BEFORE UPDATE OR DELETE ON local_product_technical_versions FOR EACH ROW EXECUTE FUNCTION local_product_technical_immutable();
CREATE TRIGGER local_product_technical_receipts_immutable BEFORE UPDATE OR DELETE ON local_product_technical_receipts FOR EACH ROW EXECUTE FUNCTION local_product_technical_immutable();
-- Refuse duplicate active canonical profiles; old duplicate data is preserved for explicit review.
CREATE FUNCTION local_product_technical_single_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.record_type='manufacturing_profile' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('technical-profile:'||coalesce(NEW.product_id,''),0));
  IF coalesce((NEW.payload->>'is_active')::boolean,true) AND EXISTS(
   SELECT 1 FROM local_manufacturing_records r WHERE r.record_type='manufacturing_profile' AND r.product_id=NEW.product_id AND r.id<>NEW.id AND coalesce((r.payload->>'is_active')::boolean,true)
  ) THEN RAISE EXCEPTION 'Sản phẩm có nhiều hồ sơ sản xuất đang hoạt động; cần kiểm tra trước.'; END IF;
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER local_product_technical_single_profile BEFORE INSERT OR UPDATE ON local_manufacturing_records FOR EACH ROW EXECUTE FUNCTION local_product_technical_single_profile();
REVOKE ALL ON local_product_technical_versions,local_product_technical_receipts FROM PUBLIC;
