-- Canonical invoice workspace. No historical company assignment/backfill.
CREATE TABLE local_invoice_companies (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, tenant_id text NOT NULL, tax_code text NOT NULL,
 legal_name text NOT NULL, address text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,tax_code),
 CHECK(tax_code ~ '^[0-9]{10}([0-9]{3})?$')
);
CREATE TABLE local_invoice_grants (
 company_id text NOT NULL REFERENCES local_invoice_companies(id), user_id text NOT NULL,
 capability text NOT NULL CHECK(capability IN ('view','import','draft','link','review','configure','files')),
 created_by text NOT NULL, PRIMARY KEY(company_id,user_id,capability)
);
ALTER TABLE local_einvoices ADD COLUMN company_id text REFERENCES local_invoice_companies(id),
 ADD COLUMN direction text NOT NULL DEFAULT 'UNASSIGNED' CHECK(direction IN ('IN','OUT','UNASSIGNED')),
 ADD COLUMN revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN review_state text NOT NULL DEFAULT 'needs_review',
 ADD COLUMN seller_tax_code text, ADD COLUMN seller_name text, ADD COLUMN seller_address text,
 ADD COLUMN source_kind text NOT NULL DEFAULT 'LEGACY', ADD COLUMN source_owner_restricted boolean NOT NULL DEFAULT false,
 ADD COLUMN discrepancy jsonb NOT NULL DEFAULT '[]', ADD COLUMN internal_notes text,
 ADD COLUMN source_snapshot jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX local_invoice_identity ON local_einvoices(company_id,seller_tax_code,coalesce(template_code,''),coalesce(invoice_series,''),invoice_number)
 WHERE company_id IS NOT NULL AND nullif(invoice_number,'') IS NOT NULL;
CREATE INDEX local_invoice_workspace_list ON local_einvoices(company_id,direction,issued_date DESC,created_at DESC);
CREATE TABLE local_invoice_lines (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, invoice_id text NOT NULL REFERENCES local_einvoices(id) ON DELETE CASCADE,
 line_no int NOT NULL, name text NOT NULL, quantity numeric(20,6) NOT NULL, unit text, unit_price numeric(20,6) NOT NULL,
 vat_rate text NOT NULL, subtotal numeric(18,2) NOT NULL, vat_amount numeric(18,2) NOT NULL, total numeric(18,2) NOT NULL,
 source_line text, UNIQUE(invoice_id,line_no)
);
CREATE TABLE local_invoice_observations (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, company_id text NOT NULL REFERENCES local_invoice_companies(id),
 invoice_id text NOT NULL REFERENCES local_einvoices(id), source text NOT NULL, source_identity text NOT NULL,
 content_hash text NOT NULL, payload jsonb NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), actor_id text NOT NULL,
 UNIQUE(company_id,source,source_identity,content_hash)
);
CREATE INDEX local_invoice_observation_identity ON local_invoice_observations(company_id,source,source_identity);
CREATE TABLE local_invoice_files (
 id text PRIMARY KEY, company_id text NOT NULL REFERENCES local_invoice_companies(id), invoice_id text REFERENCES local_einvoices(id),
 storage_key text NOT NULL UNIQUE, name text NOT NULL, media_type text NOT NULL, sha256 text NOT NULL, size_bytes int NOT NULL,
 source text NOT NULL, original boolean NOT NULL, actor_id text NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_invoice_import_jobs (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, company_id text NOT NULL REFERENCES local_invoice_companies(id),
 actor_id text NOT NULL, request_key text NOT NULL, request_hash text NOT NULL, staged_payload jsonb NOT NULL,
 file_ids jsonb NOT NULL, status text NOT NULL DEFAULT 'PREVIEW', result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', UNIQUE(company_id,actor_id,request_key)
);
CREATE TABLE local_invoice_requests (
 company_id text NOT NULL REFERENCES local_invoice_companies(id), actor_id text NOT NULL, request_key text NOT NULL,
 request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,actor_id,request_key)
);
CREATE TABLE local_invoice_contract_allocations (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, invoice_id text NOT NULL REFERENCES local_einvoices(id),
 company_id text NOT NULL REFERENCES local_invoice_companies(id), contract_id text NOT NULL REFERENCES local_contracts(id),
 amount numeric(18,2) NOT NULL CHECK(amount>0), currency text NOT NULL, reservation boolean NOT NULL,
 source_revision text NOT NULL, reason text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(invoice_id,contract_id)
);
CREATE TABLE local_invoice_payment_allocations (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, invoice_id text NOT NULL REFERENCES local_einvoices(id),
 company_id text NOT NULL REFERENCES local_invoice_companies(id), source_type text NOT NULL CHECK(source_type IN ('ORDER_PAYMENT','TRANSACTION')),
 source_id text NOT NULL, amount numeric(18,2) NOT NULL CHECK(amount>0), currency text NOT NULL, source_revision text NOT NULL,
 reason text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(invoice_id,source_type,source_id)
);
CREATE INDEX local_invoice_payment_source ON local_invoice_payment_allocations(source_type,source_id);
CREATE TABLE local_invoice_document_links (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, company_id text NOT NULL REFERENCES local_invoice_companies(id),
 invoice_id text NOT NULL REFERENCES local_einvoices(id), kind text NOT NULL CHECK(kind IN ('DELIVERY','ACCEPTANCE','CONTRACT','COST','OTHER')),
 reference text NOT NULL, file_id text REFERENCES local_invoice_files(id), reason text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_invoice_relations (
 invoice_id text NOT NULL REFERENCES local_einvoices(id), original_id text NOT NULL REFERENCES local_einvoices(id),
 kind text NOT NULL CHECK(kind IN ('REPLACES','ADJUSTS')), verified boolean NOT NULL DEFAULT false, reason text NOT NULL,
 created_by text NOT NULL, PRIMARY KEY(invoice_id,original_id), CHECK(invoice_id<>original_id)
);
CREATE TABLE local_invoice_audit (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, company_id text REFERENCES local_invoice_companies(id), invoice_id text,
 actor_id text NOT NULL, action text NOT NULL, reason text NOT NULL, snapshot jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_invoice_sync_jobs (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, company_id text NOT NULL REFERENCES local_invoice_companies(id), actor_id text NOT NULL,
 source text NOT NULL, date_from date NOT NULL, date_to date NOT NULL, cursor text, status text NOT NULL DEFAULT 'INCOMPLETE',
 pages int NOT NULL DEFAULT 0, received int NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_invoice_periods (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, company_id text NOT NULL REFERENCES local_invoice_companies(id), period text NOT NULL,
 snapshot jsonb NOT NULL, content_hash text NOT NULL, actor_id text NOT NULL, reason text NOT NULL, closed_at timestamptz NOT NULL DEFAULT now(),
 reopened_at timestamptz, reopened_by text, reopen_reason text
);
CREATE OR REPLACE FUNCTION local_invoice_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Bằng chứng hóa đơn bất biến.' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_invoice_files BEFORE UPDATE OR DELETE ON local_invoice_files FOR EACH ROW EXECUTE FUNCTION local_invoice_immutable();
CREATE TRIGGER immutable_invoice_observations BEFORE UPDATE OR DELETE ON local_invoice_observations FOR EACH ROW EXECUTE FUNCTION local_invoice_immutable();
CREATE TRIGGER immutable_invoice_audit BEFORE UPDATE OR DELETE ON local_invoice_audit FOR EACH ROW EXECUTE FUNCTION local_invoice_immutable();
-- Existing payment/contract routes also obey these guards, including mirror deletes.
CREATE OR REPLACE FUNCTION local_invoice_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='local_contracts' THEN
  IF EXISTS(SELECT 1 FROM local_invoice_contract_allocations WHERE contract_id=OLD.id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Hợp đồng có phân bổ hóa đơn; giữ hồ sơ để đối chiếu.' USING ERRCODE='23514'; END IF;
   IF (NEW.total_amount,NEW.items,NEW.vat_rate,NEW.manager_id,NEW.tenant_id,NEW.buyer_info,NEW.seller_info,NEW.order_id,NEW.status) IS DISTINCT FROM (OLD.total_amount,OLD.items,OLD.vat_rate,OLD.manager_id,OLD.tenant_id,OLD.buyer_info,OLD.seller_info,OLD.order_id,OLD.status) THEN RAISE EXCEPTION 'Hợp đồng đã giữ chỗ/phân bổ hóa đơn. Gỡ phân bổ có lý do trước khi đổi nguồn.' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM local_invoice_payment_allocations WHERE source_id=OLD.id AND source_type=CASE WHEN TG_TABLE_NAME='local_order_payments' THEN 'ORDER_PAYMENT' ELSE 'TRANSACTION' END) THEN
   RAISE EXCEPTION 'Khoản tiền đã phân bổ hóa đơn. Gỡ phân bổ có lý do trước.' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER invoice_contract_guard BEFORE UPDATE OR DELETE ON local_contracts FOR EACH ROW EXECUTE FUNCTION local_invoice_source_guard();
CREATE TRIGGER invoice_order_payment_guard BEFORE UPDATE OR DELETE ON local_order_payments FOR EACH ROW EXECUTE FUNCTION local_invoice_source_guard();
CREATE TRIGGER invoice_transaction_guard BEFORE UPDATE OR DELETE ON local_transactions FOR EACH ROW EXECUTE FUNCTION local_invoice_source_guard();
-- Browser access is only through company/action APIs; database roles receive no new grants.
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['local_invoice_companies','local_invoice_grants','local_invoice_lines','local_invoice_observations','local_invoice_files','local_invoice_import_jobs','local_invoice_requests','local_invoice_contract_allocations','local_invoice_payment_allocations','local_invoice_document_links','local_invoice_relations','local_invoice_audit','local_invoice_sync_jobs','local_invoice_periods'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP; END $$;
