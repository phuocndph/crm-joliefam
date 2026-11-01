-- Invoice evidence and reviewed business dossier; no backfill of verified business facts.
ALTER TABLE local_invoice_files ADD COLUMN purpose text NOT NULL DEFAULT 'INVOICE_ORIGINAL' CHECK(purpose IN ('INVOICE_ORIGINAL','BUSINESS_ATTACHMENT','INTERNAL_PREVIEW'));
CREATE TABLE local_invoice_source_evidence (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, observation_id text NOT NULL REFERENCES local_invoice_observations(id), invoice_id text NOT NULL REFERENCES local_einvoices(id),
 evidence_type text NOT NULL CHECK(evidence_type IN ('LINE','TAX_GROUP','RELATION')), ordinal int NOT NULL, payload jsonb NOT NULL, source_path text NOT NULL, spec text, content_hash text NOT NULL,
 UNIQUE(observation_id,evidence_type,ordinal)
);
CREATE TABLE local_invoice_checklist (
 invoice_id text NOT NULL REFERENCES local_einvoices(id), item text NOT NULL CHECK(item IN ('XML','PDF','CONTRACT_OR_COST','APPENDIX','DELIVERY','ACCEPTANCE','PAYMENT_EVIDENCE')),
 assessment text NOT NULL CHECK(assessment IN ('REQUIRED','NOT_APPLICABLE')), reason text NOT NULL, reviewed_by text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(invoice_id,item)
);
CREATE TABLE local_invoice_business_links (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, invoice_id text NOT NULL REFERENCES local_einvoices(id), company_id text NOT NULL REFERENCES local_invoice_companies(id),
 kind text NOT NULL CHECK(kind IN ('CONTRACT','COST','APPENDIX','DELIVERY','ACCEPTANCE','OTHER')), source_type text NOT NULL CHECK(source_type IN ('CONTRACT','BUSINESS_TRANSACTION','PRODUCTION_SHIPMENT','INVENTORY_DOCUMENT','CONTRACT_DOCUMENT','EXTERNAL')),
 source_id text NOT NULL, source_revision text NOT NULL, source_snapshot jsonb NOT NULL, verification_state text NOT NULL CHECK(verification_state IN ('REVIEWED_ASSOCIATION','EXTERNAL_REVIEWED','INTERNAL_EDITABLE')),
 axis text NOT NULL CHECK(axis IN ('EVIDENCE','OBLIGATION','FULFILMENT','SETTLEMENT')), amount numeric(24,6), currency text, file_id text REFERENCES local_invoice_files(id),
 reference text NOT NULL, document_date date, counterparty text, reason text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(invoice_id,source_type,source_id,kind,axis),
 CHECK((axis='EVIDENCE' AND amount IS NULL) OR (axis<>'EVIDENCE' AND amount>0 AND currency IS NOT NULL))
);
CREATE TABLE local_invoice_contract_payment_splits (
 payment_allocation_id text NOT NULL REFERENCES local_invoice_payment_allocations(id) ON DELETE CASCADE, contract_id text NOT NULL REFERENCES local_contracts(id), amount numeric(24,6) NOT NULL CHECK(amount>0), currency text NOT NULL,
 source_revision text NOT NULL, reason text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(payment_allocation_id,contract_id)
);
CREATE TABLE local_invoice_sync_items (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, job_id text NOT NULL REFERENCES local_invoice_sync_jobs(id), page_no int NOT NULL, source_identity text NOT NULL, content_hash text NOT NULL,
 invoice_id text NOT NULL REFERENCES local_einvoices(id), outcome text NOT NULL CHECK(outcome IN ('NEW','OBSERVED_UPDATE','EXISTING')), needs_review boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(job_id,page_no,source_identity)
);
CREATE TABLE local_invoice_sync_attempts (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,job_id text NOT NULL REFERENCES local_invoice_sync_jobs(id), page_no int NOT NULL, status text NOT NULL CHECK(status IN ('COMPLETE','FAILED')), code text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_invoice_source_evidence BEFORE UPDATE OR DELETE ON local_invoice_source_evidence FOR EACH ROW EXECUTE FUNCTION local_invoice_immutable();
CREATE TRIGGER immutable_invoice_sync_items BEFORE UPDATE OR DELETE ON local_invoice_sync_items FOR EACH ROW EXECUTE FUNCTION local_invoice_immutable();
CREATE TRIGGER immutable_invoice_sync_attempts BEFORE UPDATE OR DELETE ON local_invoice_sync_attempts FOR EACH ROW EXECUTE FUNCTION local_invoice_immutable();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['local_invoice_source_evidence','local_invoice_checklist','local_invoice_business_links','local_invoice_contract_payment_splits','local_invoice_sync_items','local_invoice_sync_attempts'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t); END LOOP; END $$;

CREATE INDEX local_invoice_source_evidence_invoice_idx ON local_invoice_source_evidence(invoice_id,evidence_type);
CREATE INDEX local_invoice_business_links_invoice_idx ON local_invoice_business_links(invoice_id,axis);
CREATE INDEX local_invoice_business_links_source_idx ON local_invoice_business_links(source_type,source_id,axis);
CREATE INDEX local_invoice_payment_splits_contract_idx ON local_invoice_contract_payment_splits(contract_id);
CREATE INDEX local_invoice_sync_items_job_idx ON local_invoice_sync_items(job_id);
