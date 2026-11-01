-- Keep imported financial snapshots and duplicate historical numbers unchanged.
ALTER TABLE local_einvoices ADD COLUMN IF NOT EXISTS manager_id text;
ALTER TABLE local_einvoices ADD COLUMN IF NOT EXISTS tenant_id text;
UPDATE local_einvoices i SET tenant_id=nullif(s.payload->>'tenant_id','')
FROM local_source_snapshots s WHERE s.source='SUPABASE' AND s.source_table='einvoices'
AND s.source_key=i.id AND i.tenant_id IS NULL;
UPDATE local_einvoices i SET manager_id=nullif(s.payload->>'manager_id','')
FROM local_source_snapshots s WHERE s.source='SUPABASE' AND s.source_table='einvoices'
AND s.source_key=i.id AND i.manager_id IS NULL;
UPDATE local_einvoices i SET manager_id=c.manager_id FROM local_contracts c
WHERE i.contract_id=c.id AND i.manager_id IS NULL AND NOT i.is_snapshot_record AND i.invoice_action='local_draft';
UPDATE local_einvoices i SET tenant_id=c.tenant_id FROM local_contracts c
WHERE i.contract_id=c.id AND i.tenant_id IS NULL AND NOT i.is_snapshot_record AND i.invoice_action='local_draft';
-- A later source refresh must carry the authoritative source owner as well.
CREATE OR REPLACE FUNCTION local_invoice_source_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_payload jsonb;
BEGIN
 IF NEW.is_snapshot_record AND NEW.local_modified_at IS NULL THEN
  SELECT payload INTO source_payload FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='einvoices' AND source_key=NEW.id AND NOT is_deleted;
  IF FOUND THEN
   NEW.manager_id=nullif(source_payload->>'manager_id','');
   NEW.tenant_id=nullif(source_payload->>'tenant_id','');
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER local_invoice_source_scope BEFORE INSERT OR UPDATE ON local_einvoices FOR EACH ROW EXECUTE FUNCTION local_invoice_source_scope();
CREATE INDEX IF NOT EXISTS local_einvoices_owner_idx ON local_einvoices(manager_id,created_at DESC);
CREATE INDEX IF NOT EXISTS local_contracts_owner_idx ON local_contracts(manager_id,created_at DESC);
CREATE INDEX IF NOT EXISTS local_contracts_number_key_idx ON local_contracts(coalesce(tenant_id,''),lower(btrim(contract_number)));
CREATE OR REPLACE FUNCTION local_contract_number_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.contract_number,NEW.tenant_id) IS NOT DISTINCT FROM (OLD.contract_number,OLD.tenant_id) THEN RETURN NEW; END IF;
 IF nullif(btrim(NEW.contract_number),'') IS NULL THEN RAISE EXCEPTION 'Số hợp đồng là bắt buộc.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.tenant_id,'')||':'||lower(btrim(NEW.contract_number)),0));
 IF EXISTS(SELECT 1 FROM local_contracts c WHERE coalesce(c.tenant_id,'')=coalesce(NEW.tenant_id,'') AND lower(btrim(c.contract_number))=lower(btrim(NEW.contract_number)) AND c.id<>NEW.id) THEN RAISE EXCEPTION 'Số hợp đồng đã tồn tại. Vui lòng dùng số khác.' USING ERRCODE='23505'; END IF;
 NEW.contract_number=btrim(NEW.contract_number);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS local_contract_number_guard ON local_contracts;
CREATE TRIGGER local_contract_number_guard BEFORE INSERT OR UPDATE OF contract_number,tenant_id ON local_contracts FOR EACH ROW EXECUTE FUNCTION local_contract_number_guard();
