-- Server-only account scope; backups/database operators are the credential boundary.
-- No credentials copied from historical settings and no company backfill.
CREATE TABLE integration_private.invoice_provider_accounts (
 company_id text PRIMARY KEY REFERENCES local_invoice_companies(id), enabled boolean NOT NULL DEFAULT false,
 username text, password text, supplier_tax_code text NOT NULL, page_start int NOT NULL DEFAULT 1 CHECK(page_start IN (0,1)),
 revision bigint NOT NULL DEFAULT 1, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 last_checked_at timestamptz, last_check_status text, last_check_code text,
 CHECK(NOT enabled OR (length(username)>0 AND length(password)>0))
);
REVOKE ALL ON integration_private.invoice_provider_accounts FROM PUBLIC;
ALTER TABLE integration_private.invoice_provider_accounts ENABLE ROW LEVEL SECURITY;
