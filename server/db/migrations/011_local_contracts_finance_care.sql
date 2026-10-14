-- Canonical local tables for contracts, finance and customer-care operations.
-- Source snapshots remain immutable import history; local_modified_at protects local edits.

CREATE TABLE IF NOT EXISTS local_contract_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  legal_basis jsonb NOT NULL DEFAULT '[]'::jsonb,
  seller_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  articles jsonb NOT NULL DEFAULT '[]'::jsonb,
  include_vat boolean NOT NULL DEFAULT false,
  vat_rate numeric(8,3) NOT NULL DEFAULT 8,
  payment_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE TABLE IF NOT EXISTS local_contracts (
  id text PRIMARY KEY,
  contract_number text NOT NULL,
  customer_id text,
  quote_id text,
  order_id text,
  template_id text,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  contract_date timestamptz,
  start_date timestamptz,
  end_date timestamptz,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  vat_rate numeric(8,3) NOT NULL DEFAULT 0,
  vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  deposit_amount numeric(18,2) NOT NULL DEFAULT 0,
  deposit_percentage numeric(8,3),
  include_vat boolean NOT NULL DEFAULT false,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  legal_basis jsonb NOT NULL DEFAULT '[]'::jsonb,
  articles jsonb NOT NULL DEFAULT '[]'::jsonb,
  seller_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  buyer_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  content text,
  document_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE INDEX IF NOT EXISTS local_contracts_created_idx ON local_contracts(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS local_contracts_status_idx ON local_contracts(status, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS local_contracts_customer_idx ON local_contracts(customer_id, created_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS local_transactions (
  id text PRIMARY KEY,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  date timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  description text,
  category text,
  payment_type text,
  order_id text,
  installment_number integer,
  total_installments integer,
  remaining_amount numeric(18,2),
  manager_id text,
  tenant_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE INDEX IF NOT EXISTS local_transactions_date_idx ON local_transactions(date DESC);
CREATE INDEX IF NOT EXISTS local_transactions_order_idx ON local_transactions(order_id, date DESC);
CREATE INDEX IF NOT EXISTS local_transactions_type_idx ON local_transactions(type, date DESC);

CREATE TABLE IF NOT EXISTS local_expenses (
  id text PRIMARY KEY,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  expense_date timestamptz NOT NULL DEFAULT now(),
  person_name text,
  expense_code text,
  manager_id text,
  tenant_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

CREATE INDEX IF NOT EXISTS local_expenses_date_idx ON local_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS local_expenses_manager_idx ON local_expenses(manager_id, expense_date DESC);

CREATE TABLE IF NOT EXISTS local_assignees (
  id text PRIMARY KEY,
  name text NOT NULL,
  manager_id text,
  tenant_id text,
  created_at timestamptz,
  updated_at timestamptz,
  is_snapshot_record boolean NOT NULL DEFAULT true,
  local_modified_at timestamptz
);

INSERT INTO local_contract_templates (id,name,legal_basis,seller_info,item_columns,articles,include_vat,vat_rate,payment_terms,manager_id,tenant_id,created_at,updated_at)
SELECT source_key, COALESCE(payload->>'name','Mẫu hợp đồng'),
  CASE WHEN jsonb_typeof(payload->'legal_basis')='array' THEN payload->'legal_basis' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'seller_info')='object' THEN payload->'seller_info' ELSE '{}'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'item_columns')='array' THEN payload->'item_columns' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'articles')='array' THEN payload->'articles' ELSE '[]'::jsonb END,
  COALESCE(NULLIF(payload->>'include_vat','')::boolean,false), COALESCE(NULLIF(payload->>'vat_rate','')::numeric,8),
  CASE WHEN jsonb_typeof(payload->'payment_terms')='object' THEN payload->'payment_terms' ELSE '{}'::jsonb END,
  payload->>'manager_id', payload->>'tenant_id', NULLIF(payload->>'created_at','')::timestamptz, NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='contract_templates' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET name=excluded.name,legal_basis=excluded.legal_basis,seller_info=excluded.seller_info,item_columns=excluded.item_columns,articles=excluded.articles,include_vat=excluded.include_vat,vat_rate=excluded.vat_rate,payment_terms=excluded.payment_terms,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at
WHERE local_contract_templates.local_modified_at IS NULL;

INSERT INTO local_contracts (id,contract_number,customer_id,quote_id,order_id,template_id,title,status,contract_date,start_date,end_date,subtotal,vat_rate,vat_amount,total_amount,deposit_amount,deposit_percentage,include_vat,items,terms,legal_basis,articles,seller_info,buyer_info,content,document_overrides,notes,manager_id,tenant_id,created_at,updated_at)
SELECT source_key, COALESCE(payload->>'contract_number',''), payload->>'customer_id',payload->>'quote_id',payload->>'order_id',payload->>'template_id',COALESCE(payload->>'title',''),COALESCE(payload->>'status','draft'),
  NULLIF(payload->>'contract_date','')::timestamptz,NULLIF(payload->>'start_date','')::timestamptz,NULLIF(payload->>'end_date','')::timestamptz,
  COALESCE(NULLIF(payload->>'subtotal','')::numeric,0),COALESCE(NULLIF(payload->>'vat_rate','')::numeric,0),COALESCE(NULLIF(payload->>'vat_amount','')::numeric,0),COALESCE(NULLIF(payload->>'total_amount','')::numeric,0),COALESCE(NULLIF(payload->>'deposit_amount','')::numeric,0),NULLIF(payload->>'deposit_percentage','')::numeric,COALESCE(NULLIF(payload->>'include_vat','')::boolean,false),
  CASE WHEN jsonb_typeof(payload->'items')='array' THEN payload->'items' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'terms')='array' THEN payload->'terms' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'legal_basis')='array' THEN payload->'legal_basis' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'articles')='array' THEN payload->'articles' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'seller_info')='object' THEN payload->'seller_info' ELSE '{}'::jsonb END,
  CASE WHEN jsonb_typeof(payload->'buyer_info')='object' THEN payload->'buyer_info' ELSE '{}'::jsonb END,
  payload->>'content', CASE WHEN jsonb_typeof(payload->'document_overrides')='object' THEN payload->'document_overrides' ELSE '{}'::jsonb END,
  payload->>'notes',payload->>'manager_id',payload->>'tenant_id',NULLIF(payload->>'created_at','')::timestamptz,NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='contracts' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET contract_number=excluded.contract_number,customer_id=excluded.customer_id,quote_id=excluded.quote_id,order_id=excluded.order_id,template_id=excluded.template_id,title=excluded.title,status=excluded.status,contract_date=excluded.contract_date,start_date=excluded.start_date,end_date=excluded.end_date,subtotal=excluded.subtotal,vat_rate=excluded.vat_rate,vat_amount=excluded.vat_amount,total_amount=excluded.total_amount,deposit_amount=excluded.deposit_amount,deposit_percentage=excluded.deposit_percentage,include_vat=excluded.include_vat,items=excluded.items,terms=excluded.terms,legal_basis=excluded.legal_basis,articles=excluded.articles,seller_info=excluded.seller_info,buyer_info=excluded.buyer_info,content=excluded.content,document_overrides=excluded.document_overrides,notes=excluded.notes,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at
WHERE local_contracts.local_modified_at IS NULL;

INSERT INTO local_transactions (id,amount,date,type,description,category,payment_type,order_id,installment_number,total_installments,remaining_amount,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,COALESCE(NULLIF(payload->>'amount','')::numeric,0),COALESCE(NULLIF(payload->>'date','')::timestamptz,now()),COALESCE(payload->>'type',''),payload->>'description',payload->>'category',payload->>'payment_type',payload->>'order_id',NULLIF(payload->>'installment_number','')::integer,NULLIF(payload->>'total_installments','')::integer,NULLIF(payload->>'remaining_amount','')::numeric,payload->>'manager_id',payload->>'tenant_id',COALESCE(NULLIF(payload->>'created_at','')::timestamptz,now()),COALESCE(NULLIF(payload->>'updated_at','')::timestamptz,now())
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='transactions' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET amount=excluded.amount,date=excluded.date,type=excluded.type,description=excluded.description,category=excluded.category,payment_type=excluded.payment_type,order_id=excluded.order_id,installment_number=excluded.installment_number,total_installments=excluded.total_installments,remaining_amount=excluded.remaining_amount,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at
WHERE local_transactions.local_modified_at IS NULL;

INSERT INTO local_expenses (id,amount,category,description,expense_date,person_name,expense_code,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,COALESCE(NULLIF(payload->>'amount','')::numeric,0),COALESCE(payload->>'category',''),COALESCE(payload->>'description',''),COALESCE(NULLIF(payload->>'expense_date','')::timestamptz,now()),payload->>'person_name',payload->>'expense_code',payload->>'manager_id',payload->>'tenant_id',COALESCE(NULLIF(payload->>'created_at','')::timestamptz,now()),COALESCE(NULLIF(payload->>'updated_at','')::timestamptz,now())
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='expenses' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET amount=excluded.amount,category=excluded.category,description=excluded.description,expense_date=excluded.expense_date,person_name=excluded.person_name,expense_code=excluded.expense_code,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at
WHERE local_expenses.local_modified_at IS NULL;

INSERT INTO local_assignees (id,name,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,COALESCE(payload->>'name',''),payload->>'manager_id',payload->>'tenant_id',NULLIF(payload->>'created_at','')::timestamptz,NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='assignees' AND NOT is_deleted
ON CONFLICT (id) DO UPDATE SET name=excluded.name,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,updated_at=excluded.updated_at
WHERE local_assignees.local_modified_at IS NULL;
