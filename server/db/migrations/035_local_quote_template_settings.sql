CREATE TABLE IF NOT EXISTS local_quote_template_settings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL UNIQUE DEFAULT 'local-tenant',
  company_name text NOT NULL,
  company_title text,
  address text,
  phone text,
  tax_code text,
  headquarters text,
  bank_info text,
  quote_title_color text,
  company_title_color text,
  logo_url text,
  terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  footer_note text,
  signature_url text,
  stamp_url text,
  stamp_position jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_position jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_snapshot_record boolean NOT NULL DEFAULT false,
  local_modified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO local_quote_template_settings (
  id, tenant_id, company_name, company_title, address, phone, tax_code,
  headquarters, bank_info, quote_title_color, company_title_color, logo_url,
  terms, footer_note, signature_url, stamp_url, stamp_position,
  signature_position, is_snapshot_record, created_at, updated_at
)
SELECT
  source_key,
  'local-tenant',
  COALESCE(payload->>'company_name', 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT'),
  payload->>'company_title', payload->>'address', payload->>'phone', payload->>'tax_code',
  payload->>'headquarters', payload->>'bank_info', payload->>'quote_title_color',
  payload->>'company_title_color', payload->>'logo_url',
  COALESCE(payload->'terms', '[]'::jsonb), payload->>'footer_note', payload->>'signature_url',
  payload->>'stamp_url', COALESCE(payload->'stamp_position', '{}'::jsonb),
  COALESCE(payload->'signature_position', '{}'::jsonb), true,
  COALESCE(source_updated_at, now()), COALESCE(source_updated_at, now())
FROM local_source_snapshots
WHERE source = 'SUPABASE' AND source_table = 'quote_template_settings' AND NOT is_deleted
ON CONFLICT (tenant_id) DO NOTHING;
