-- Local operational copies for cost management and e-invoice drafts.
-- Snapshot rows remain immutable imports; local_modified_at protects local edits.

CREATE TABLE IF NOT EXISTS local_cost_categories (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'default', code text NOT NULL,
  name text NOT NULL, description text, parent_id text, level integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, default_behavior text NOT NULL DEFAULT 'VARIABLE',
  default_traceability text NOT NULL DEFAULT 'INDIRECT', created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS local_cost_categories_code_idx ON local_cost_categories(tenant_id, code);

CREATE TABLE IF NOT EXISTS local_cost_centers (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'default', code text NOT NULL,
  name text NOT NULL, parent_id text, center_type text NOT NULL DEFAULT 'SERVICE',
  manager_user_id text, manager_id text, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  is_snapshot_record boolean NOT NULL DEFAULT true, local_modified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS local_cost_centers_code_idx ON local_cost_centers(tenant_id, code);

CREATE TABLE IF NOT EXISTS local_cost_objects (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'default', object_type text NOT NULL,
  source_id text, display_code text NOT NULL, display_name text, status text NOT NULL DEFAULT 'ACTIVE',
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS local_cost_objects_code_idx ON local_cost_objects(tenant_id, object_type, display_code);

CREATE TABLE IF NOT EXISTS local_transaction_types (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'default', code text NOT NULL,
  name text NOT NULL, description text, is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true, has_cash_impact boolean NOT NULL DEFAULT false,
  has_inventory_impact boolean NOT NULL DEFAULT false, can_create_cost boolean NOT NULL DEFAULT false,
  can_create_asset boolean NOT NULL DEFAULT false, default_effect_kind text NOT NULL DEFAULT 'COST',
  default_direction text NOT NULL DEFAULT 'DEBIT', requires_counterparty boolean NOT NULL DEFAULT false,
  requires_cost_center boolean NOT NULL DEFAULT false, requires_cost_object boolean NOT NULL DEFAULT false,
  default_cost_category_id text, default_cost_center_id text, default_cost_behavior text,
  default_traceability text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  is_snapshot_record boolean NOT NULL DEFAULT true, local_modified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS local_transaction_types_code_idx ON local_transaction_types(tenant_id, code);

CREATE TABLE IF NOT EXISTS local_business_transactions (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'local-tenant', manager_id text,
  transaction_number text NOT NULL, transaction_type_id text NOT NULL, transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL, status text NOT NULL DEFAULT 'DRAFT', counterparty_type text,
  counterparty_id text, counterparty_name_snapshot text, currency_code text NOT NULL DEFAULT 'VND',
  subtotal numeric(18,2) NOT NULL DEFAULT 0, vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0, payment_status text, source_type text, source_id text,
  external_reference text, idempotency_key text NOT NULL, created_by text, confirmed_by text, voided_by text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz, voided_at timestamptz, void_reason text, is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS local_business_transactions_number_idx ON local_business_transactions(tenant_id, transaction_number);
CREATE UNIQUE INDEX IF NOT EXISTS local_business_transactions_idempotency_idx ON local_business_transactions(tenant_id, idempotency_key);

CREATE TABLE IF NOT EXISTS local_business_transaction_lines (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'local-tenant', business_transaction_id text NOT NULL,
  line_number integer NOT NULL, description text NOT NULL, quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'unit', unit_price numeric(18,2) NOT NULL DEFAULT 0,
  subtotal numeric(18,2) NOT NULL DEFAULT 0, vat_rate numeric(7,4) NOT NULL DEFAULT 0,
  vat_amount numeric(18,2) NOT NULL DEFAULT 0, total_amount numeric(18,2) NOT NULL DEFAULT 0,
  effect_kind text NOT NULL DEFAULT 'COST', direction text NOT NULL DEFAULT 'DEBIT', cost_category_id text,
  cost_center_id text, cost_object_id text, cost_behavior text, traceability text,
  classification_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  local_modified_at timestamptz
);
CREATE TABLE IF NOT EXISTS local_business_transaction_links (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'local-tenant', business_transaction_id text NOT NULL,
  link_type text NOT NULL, linked_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_cost_audit_events (
  id text PRIMARY KEY, tenant_id text NOT NULL DEFAULT 'local-tenant', entity_type text NOT NULL,
  entity_id text NOT NULL, action text NOT NULL, before_data jsonb, after_data jsonb,
  actor_id text, reason text, source text NOT NULL DEFAULT 'local-cost-management',
  request_id text, created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO local_cost_categories (id,tenant_id,code,name,description,parent_id,level,is_active,default_behavior,default_traceability,created_at,updated_at)
SELECT source_key, COALESCE(payload->>'tenant_id','default'), payload->>'code', COALESCE(payload->>'name',''), payload->>'description', payload->>'parent_id', COALESCE(NULLIF(payload->>'level','')::int,0), COALESCE(NULLIF(payload->>'is_active','')::boolean,true), COALESCE(payload->>'default_behavior','VARIABLE'), COALESCE(payload->>'default_traceability','INDIRECT'), NULLIF(payload->>'created_at','')::timestamptz, NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='cost_categories' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET code=excluded.code,name=excluded.name,description=excluded.description,parent_id=excluded.parent_id,level=excluded.level,is_active=excluded.is_active,default_behavior=excluded.default_behavior,default_traceability=excluded.default_traceability,updated_at=excluded.updated_at WHERE local_cost_categories.local_modified_at IS NULL;

INSERT INTO local_cost_centers (id,tenant_id,code,name,parent_id,center_type,manager_user_id,manager_id,is_active,created_at,updated_at)
SELECT source_key, COALESCE(payload->>'tenant_id','default'), payload->>'code', COALESCE(payload->>'name',''), payload->>'parent_id', COALESCE(payload->>'center_type','SERVICE'), payload->>'manager_user_id', payload->>'manager_id', COALESCE(NULLIF(payload->>'is_active','')::boolean,true), NULLIF(payload->>'created_at','')::timestamptz, NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='cost_centers' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET code=excluded.code,name=excluded.name,parent_id=excluded.parent_id,center_type=excluded.center_type,manager_user_id=excluded.manager_user_id,manager_id=excluded.manager_id,is_active=excluded.is_active,updated_at=excluded.updated_at WHERE local_cost_centers.local_modified_at IS NULL;

INSERT INTO local_cost_objects (id,tenant_id,object_type,source_id,display_code,display_name,status,is_active,created_at,updated_at)
SELECT source_key, COALESCE(payload->>'tenant_id','default'), COALESCE(payload->>'object_type','OTHER'), payload->>'source_id', COALESCE(payload->>'display_code',source_key), payload->>'display_name', COALESCE(payload->>'status','ACTIVE'), COALESCE(NULLIF(payload->>'is_active','')::boolean,true), NULLIF(payload->>'created_at','')::timestamptz, NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='cost_objects' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET object_type=excluded.object_type,source_id=excluded.source_id,display_code=excluded.display_code,display_name=excluded.display_name,status=excluded.status,is_active=excluded.is_active,updated_at=excluded.updated_at WHERE local_cost_objects.local_modified_at IS NULL;

INSERT INTO local_transaction_types (id,tenant_id,code,name,description,is_system,is_active,has_cash_impact,has_inventory_impact,can_create_cost,can_create_asset,default_effect_kind,default_direction,requires_counterparty,requires_cost_center,requires_cost_object,default_cost_category_id,default_cost_center_id,default_cost_behavior,default_traceability,created_at,updated_at)
SELECT source_key, COALESCE(payload->>'tenant_id','default'), payload->>'code', COALESCE(payload->>'name',''), payload->>'description', COALESCE(NULLIF(payload->>'is_system','')::boolean,true), COALESCE(NULLIF(payload->>'is_active','')::boolean,true), COALESCE(NULLIF(payload->>'has_cash_impact','')::boolean,false), COALESCE(NULLIF(payload->>'has_inventory_impact','')::boolean,false), COALESCE(NULLIF(payload->>'can_create_cost','')::boolean,false), COALESCE(NULLIF(payload->>'can_create_asset','')::boolean,false), COALESCE(payload->>'default_effect_kind','COST'), COALESCE(payload->>'default_direction','DEBIT'), COALESCE(NULLIF(payload->>'requires_counterparty','')::boolean,false), COALESCE(NULLIF(payload->>'requires_cost_center','')::boolean,false), COALESCE(NULLIF(payload->>'requires_cost_object','')::boolean,false), payload->>'default_cost_category_id', payload->>'default_cost_center_id', payload->>'default_cost_behavior', payload->>'default_traceability', NULLIF(payload->>'created_at','')::timestamptz, NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='transaction_types' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET code=excluded.code,name=excluded.name,description=excluded.description,is_system=excluded.is_system,is_active=excluded.is_active,has_cash_impact=excluded.has_cash_impact,has_inventory_impact=excluded.has_inventory_impact,can_create_cost=excluded.can_create_cost,can_create_asset=excluded.can_create_asset,default_effect_kind=excluded.default_effect_kind,default_direction=excluded.default_direction,requires_counterparty=excluded.requires_counterparty,requires_cost_center=excluded.requires_cost_center,requires_cost_object=excluded.requires_cost_object,default_cost_category_id=excluded.default_cost_category_id,default_cost_center_id=excluded.default_cost_center_id,default_cost_behavior=excluded.default_cost_behavior,default_traceability=excluded.default_traceability,updated_at=excluded.updated_at WHERE local_transaction_types.local_modified_at IS NULL;

CREATE TABLE IF NOT EXISTS local_einvoice_settings (
  id text PRIMARY KEY, manager_id text, tax_code text, username text, password text, api_url text,
  default_invoice_type text, default_template_code text, default_serial text, last_login_at timestamptz,
  last_login_status text, last_login_error text, created_at timestamptz, updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true, local_modified_at timestamptz
);
INSERT INTO local_einvoice_settings (id,manager_id,tax_code,username,password,api_url,default_invoice_type,default_template_code,default_serial,last_login_at,last_login_status,last_login_error,created_at,updated_at)
SELECT source_key,payload->>'manager_id',payload->>'tax_code',payload->>'username',payload->>'password',payload->>'api_url',payload->>'default_invoice_type',payload->>'default_template_code',payload->>'default_serial',NULLIF(payload->>'last_login_at','')::timestamptz,payload->>'last_login_status',payload->>'last_login_error',NULLIF(payload->>'created_at','')::timestamptz,NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='einvoice_settings' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET manager_id=excluded.manager_id,tax_code=excluded.tax_code,username=excluded.username,api_url=excluded.api_url,default_invoice_type=excluded.default_invoice_type,default_template_code=excluded.default_template_code,default_serial=excluded.default_serial,last_login_at=excluded.last_login_at,last_login_status=excluded.last_login_status,last_login_error=excluded.last_login_error,updated_at=excluded.updated_at WHERE local_einvoice_settings.local_modified_at IS NULL;

CREATE TABLE IF NOT EXISTS local_einvoices (
  id text PRIMARY KEY, contract_id text, transaction_uuid text, invoice_number text, invoice_type text,
  template_code text, invoice_series text, status text NOT NULL DEFAULT 'draft', is_draft boolean NOT NULL DEFAULT true,
  issued_date timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  total_amount numeric(18,2) NOT NULL DEFAULT 0, vat_amount numeric(18,2) NOT NULL DEFAULT 0, total_with_vat numeric(18,2) NOT NULL DEFAULT 0,
  buyer_name text, buyer_tax_code text, buyer_address text, buyer_email text, buyer_company text, response_data jsonb,
  request_data jsonb, draft_payload jsonb, invoice_action text, original_invoice_id text, replaces_uuid text, replaced_by_uuid text,
  adjusts_uuid text, adjusted_by_uuid text, adjustment_type text, email_sent_to text, pdf_url text, xml_url text,
  cancelled_at timestamptz, cancel_reason text, payment_status_synced boolean NOT NULL DEFAULT false, reservation_code text,
  last_synced_at timestamptz, error_code text, currency text NOT NULL DEFAULT 'VND', payment_method text,
  is_snapshot_record boolean NOT NULL DEFAULT true, local_modified_at timestamptz
);
CREATE INDEX IF NOT EXISTS local_einvoices_created_idx ON local_einvoices(created_at DESC);
CREATE INDEX IF NOT EXISTS local_einvoices_contract_idx ON local_einvoices(contract_id,created_at DESC);

INSERT INTO local_einvoices (id,contract_id,transaction_uuid,invoice_number,invoice_type,template_code,invoice_series,status,is_draft,issued_date,created_at,updated_at,total_amount,vat_amount,total_with_vat,buyer_name,buyer_tax_code,buyer_address,buyer_email,buyer_company,response_data,request_data,draft_payload,invoice_action,original_invoice_id,replaces_uuid,replaced_by_uuid,adjusts_uuid,adjusted_by_uuid,adjustment_type,email_sent_to,pdf_url,xml_url,cancelled_at,cancel_reason,payment_status_synced,reservation_code,last_synced_at,error_code,currency,payment_method)
SELECT source_key,payload->>'contract_id',payload->>'transaction_uuid',NULLIF(payload->>'invoice_number',''),payload->>'invoice_type',payload->>'template_code',payload->>'invoice_series',COALESCE(payload->>'status','draft'),COALESCE(NULLIF(payload->>'is_draft','')::boolean,true),NULLIF(payload->>'issued_date','')::timestamptz,COALESCE(NULLIF(payload->>'created_at','')::timestamptz,now()),COALESCE(NULLIF(payload->>'updated_at','')::timestamptz,now()),COALESCE(NULLIF(payload->>'total_amount','')::numeric,0),COALESCE(NULLIF(payload->>'vat_amount','')::numeric,0),COALESCE(NULLIF(payload->>'total_with_vat','')::numeric,0),payload->>'buyer_name',payload->>'buyer_tax_code',payload->>'buyer_address',payload->>'buyer_email',payload->>'buyer_unit_name',payload->'response_data',payload->'request_data',payload->'draft_payload',payload->>'invoice_action',payload->>'original_invoice_id',payload->>'replaces_uuid',payload->>'replaced_by_uuid',payload->>'adjusts_uuid',payload->>'adjusted_by_uuid',payload->>'adjustment_type',payload->>'email_sent_to',payload->>'pdf_url',payload->>'xml_url',NULLIF(payload->>'cancelled_at','')::timestamptz,payload->>'cancel_reason',COALESCE(NULLIF(payload->>'payment_status_synced','')::boolean,false),payload->>'reservation_code',NULLIF(payload->>'last_synced_at','')::timestamptz,payload->>'error_code',COALESCE(payload->>'currency','VND'),payload->>'payment_method'
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='einvoices' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET contract_id=excluded.contract_id,transaction_uuid=excluded.transaction_uuid,invoice_number=excluded.invoice_number,invoice_type=excluded.invoice_type,template_code=excluded.template_code,invoice_series=excluded.invoice_series,status=excluded.status,is_draft=excluded.is_draft,issued_date=excluded.issued_date,total_amount=excluded.total_amount,vat_amount=excluded.vat_amount,total_with_vat=excluded.total_with_vat,buyer_name=excluded.buyer_name,buyer_tax_code=excluded.buyer_tax_code,buyer_address=excluded.buyer_address,buyer_email=excluded.buyer_email,buyer_company=excluded.buyer_company,response_data=excluded.response_data,request_data=excluded.request_data,draft_payload=excluded.draft_payload,invoice_action=excluded.invoice_action,original_invoice_id=excluded.original_invoice_id,replaces_uuid=excluded.replaces_uuid,replaced_by_uuid=excluded.replaced_by_uuid,adjusts_uuid=excluded.adjusts_uuid,adjusted_by_uuid=excluded.adjusted_by_uuid,adjustment_type=excluded.adjustment_type,email_sent_to=excluded.email_sent_to,pdf_url=excluded.pdf_url,xml_url=excluded.xml_url,cancelled_at=excluded.cancelled_at,cancel_reason=excluded.cancel_reason,payment_status_synced=excluded.payment_status_synced,reservation_code=excluded.reservation_code,last_synced_at=excluded.last_synced_at,error_code=excluded.error_code,currency=excluded.currency,payment_method=excluded.payment_method,updated_at=excluded.updated_at WHERE local_einvoices.local_modified_at IS NULL;

CREATE TABLE IF NOT EXISTS local_einvoice_actions (
  id text PRIMARY KEY, einvoice_id text NOT NULL, action text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'LOCAL_ONLY', error_message text, created_at timestamptz NOT NULL DEFAULT now()
);
