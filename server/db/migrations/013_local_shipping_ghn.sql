-- Local copies for shipping-company directory and GHN tracking history.
CREATE TABLE IF NOT EXISTS local_shipping_companies (
  id text PRIMARY KEY, name text NOT NULL, phone text, address text, areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_person text, notes text, google_maps_url text, manager_id text, tenant_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  is_snapshot_record boolean NOT NULL DEFAULT true, local_modified_at timestamptz
);
INSERT INTO local_shipping_companies(id,name,phone,address,areas,contact_person,notes,google_maps_url,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,COALESCE(payload->>'name',''),payload->>'phone',payload->>'address',CASE WHEN jsonb_typeof(payload->'areas')='array' THEN payload->'areas' ELSE '[]'::jsonb END,payload->>'contact_person',payload->>'notes',payload->>'google_maps_url',payload->>'manager_id',payload->>'tenant_id',NULLIF(payload->>'created_at','')::timestamptz,NULLIF(payload->>'updated_at','')::timestamptz
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='shipping_companies' AND NOT is_deleted
ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,address=excluded.address,areas=excluded.areas,contact_person=excluded.contact_person,notes=excluded.notes,google_maps_url=excluded.google_maps_url,updated_at=excluded.updated_at WHERE local_shipping_companies.local_modified_at IS NULL;

CREATE TABLE IF NOT EXISTS local_ghn_tracking (
  id text PRIMARY KEY, ghn_order_code text NOT NULL UNIQUE, internal_order_code text, order_id text,
  customer_name text NOT NULL DEFAULT '', customer_phone text, customer_address text, package_weight numeric(18,3),
  created_date timestamptz, expected_delivery_date timestamptz, delivered_date timestamptz, cod_amount numeric(18,2),
  ghn_status text, ghn_status_text text, tracking_url text, last_updated_at timestamptz, tracking_notes text,
  raw_data jsonb, manager_id text, tenant_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  is_snapshot_record boolean NOT NULL DEFAULT true, local_modified_at timestamptz
);
CREATE INDEX IF NOT EXISTS local_ghn_tracking_status_idx ON local_ghn_tracking(ghn_status,delivered_date,created_date DESC);
INSERT INTO local_ghn_tracking(id,ghn_order_code,internal_order_code,order_id,customer_name,customer_phone,customer_address,package_weight,created_date,expected_delivery_date,delivered_date,cod_amount,ghn_status,ghn_status_text,tracking_url,last_updated_at,tracking_notes,raw_data,manager_id,tenant_id,created_at,updated_at)
SELECT source_key,COALESCE(payload->>'ghn_order_code',source_key),payload->>'internal_order_code',payload->>'order_id',COALESCE(payload->>'customer_name',''),payload->>'customer_phone',payload->>'customer_address',NULLIF(payload->>'package_weight','')::numeric,NULLIF(payload->>'created_date','')::timestamptz,NULLIF(payload->>'expected_delivery_date','')::timestamptz,NULLIF(payload->>'delivered_date','')::timestamptz,NULLIF(payload->>'cod_amount','')::numeric,payload->>'ghn_status',payload->>'ghn_status_text',payload->>'tracking_url',NULLIF(payload->>'last_updated_at','')::timestamptz,payload->>'tracking_notes',payload->'raw_data',payload->>'manager_id',payload->>'tenant_id',COALESCE(NULLIF(payload->>'created_at','')::timestamptz,now()),COALESCE(NULLIF(payload->>'updated_at','')::timestamptz,now())
FROM local_source_snapshots WHERE source='SUPABASE' AND source_table='ghn_tracking' AND NOT is_deleted
ON CONFLICT(id) DO UPDATE SET internal_order_code=excluded.internal_order_code,order_id=excluded.order_id,customer_name=excluded.customer_name,customer_phone=excluded.customer_phone,customer_address=excluded.customer_address,package_weight=excluded.package_weight,created_date=excluded.created_date,expected_delivery_date=excluded.expected_delivery_date,delivered_date=excluded.delivered_date,cod_amount=excluded.cod_amount,ghn_status=excluded.ghn_status,ghn_status_text=excluded.ghn_status_text,tracking_url=excluded.tracking_url,last_updated_at=excluded.last_updated_at,tracking_notes=excluded.tracking_notes,raw_data=excluded.raw_data,updated_at=excluded.updated_at WHERE local_ghn_tracking.local_modified_at IS NULL;
