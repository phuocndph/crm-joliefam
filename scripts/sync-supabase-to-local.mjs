import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

async function loadEnv() {
  const values = {};
  for (const file of [".env", ".env.local"]) {
    try { Object.assign(values, parseEnv(await fs.readFile(path.join(root, file), "utf8"))); } catch { /* optional */ }
  }
  return { ...values, ...process.env };
}

function argValue(name) {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function rowKey(row) {
  for (const key of ["id", "uuid", "code", "sku", "customer_code", "order_number", "quote_number", "document_number"]) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]) !== "") return String(row[key]);
  }
  return hash(row);
}

function updatedAt(row) {
  for (const key of ["updated_at", "modified_at", "created_at", "effective_from", "work_date"]) {
    if (row[key]) return row[key];
  }
  return null;
}

function isMissingSourceTable(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /relation .* does not exist|could not find the table .* in the schema cache/i.test(message);
}

function sourceClient(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const accessToken = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_USER_ACCESS_TOKEN;
  if (!url || !apiKey) throw new Error("Thiếu URL hoặc khóa đọc Supabase. Đặt SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY hoặc VITE_SUPABASE_PUBLISHABLE_KEY.");
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  return createClient(url, apiKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } });
}

/** A paginated RLS-filtered read is not proof that unseen rows were deleted.
 * The API validates the credential on each read; inspect only the selected
 * credential's non-secret class here. Never log or return credential values. */
export function hasAuthoritativeSecuritySource(env) {
  if (env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_USER_ACCESS_TOKEN) return false;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof key !== 'string') return false;
  if (key.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch { return false; }
}

async function readTable(client, table, pageSize, since = null, allowSinceFallback = true) {
  const rows = [];
  let stableOrdering = true;
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from(table).select("*");
    if (since) query = query.gt("updated_at", since);
    if (stableOrdering) query = query.order("id", { ascending: true });
    let result = await query.range(offset, offset + pageSize - 1);
    if (result.error && stableOrdering && /column .*id|could not find the function|order/i.test(result.error.message || "")) {
      // A few legacy tables do not expose id; keep syncing them without
      // ordering, but mark the read so snapshot deletion stays conservative.
      stableOrdering = false;
      result = await (since ? client.from(table).select("*").gt("updated_at", since) : client.from(table).select("*")).range(offset, offset + pageSize - 1);
    }
    const { data, error } = result;
    if (error) {
      if (since && allowSinceFallback && /updated_at|column/i.test(error.message || "")) return readTable(client, table, pageSize, null, false);
      throw new Error(error.message || `Không đọc được bảng ${table}`);
    }
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { rows, complete: true, stableOrdering };
}

async function syncAuthProfiles(client, localPool) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Không đồng bộ được tài khoản Auth: ${error.message}`);
    users.push(...(data?.users || []));
    if ((data?.users || []).length < 100) break;
  }
  for (const user of users) {
    const metadata = user.user_metadata || {};
    const firstName = metadata.first_name || metadata.firstName || null;
    const lastName = metadata.last_name || metadata.lastName || null;
    const phone = user.phone || metadata.phone || null;
    await localPool.query(`
      insert into local_user_profiles
        (id,user_id,email,first_name,last_name,phone,is_snapshot_record,source_snapshot_key,created_at,updated_at)
      values($1,$1,$2,$3,$4,$5,true,$1,$6,$6)
      on conflict (user_id) do update set
        email=excluded.email,
        first_name=excluded.first_name,
        last_name=excluded.last_name,
        phone=excluded.phone,
        source_snapshot_key=excluded.source_snapshot_key,
        updated_at=excluded.updated_at
      where local_user_profiles.local_modified_at is null`,
    [user.id, user.email || `unknown+${user.id}@local.invalid`, firstName, lastName, phone, user.created_at || new Date().toISOString()]);
  }
  // Role and grant reconciliation is atomic with the canonical projections.
  return { users: users.length };
}

// Keep canonical local projections in step with the raw snapshot. The first
// bootstrap migration populated these tables once, so later incremental syncs
// must also project newly-created public records into the tables used by the
// local UI/API.
export async function refreshCanonicalProjections(localPool) {
  await localPool.query("alter table local_workers add column if not exists local_modified_at timestamptz");
  await localPool.query("alter table local_price_lists add column if not exists local_modified_at timestamptz");
  const client = await localPool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended('production-source-sync',0))");
    await refreshPermissionProjections(client);
    await client.query(`
      insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
      select s.source_table,s.source_key,'SOURCE'
      from local_source_snapshots s
      where s.source='SUPABASE' and s.source_table in ('order_payments','transactions','ghn_tracking') and s.is_deleted
      on conflict (source_table,source_key) do update set
        tombstone_kind=case when local_projection_tombstones.tombstone_kind='LOCAL' then 'LOCAL' else 'SOURCE' end,
        updated_at=now()`);
    await client.query(`
      delete from local_projection_tombstones t
      using local_source_snapshots s
      where t.tombstone_kind='SOURCE' and s.source='SUPABASE' and not s.is_deleted
        and s.source_table=t.source_table and s.source_key=t.source_key
        and s.source_table in ('order_payments','transactions','ghn_tracking')`);
    await client.query(`
      delete from local_order_payments p using local_projection_tombstones t
      where t.source_table='order_payments' and t.tombstone_kind='SOURCE' and t.source_key=p.id and p.local_modified_at is null`);
    await client.query(`
      delete from local_transactions transaction_row using local_projection_tombstones t
      where t.source_table='transactions' and t.tombstone_kind='SOURCE' and t.source_key=transaction_row.id and transaction_row.local_modified_at is null`);
    await client.query(`
      delete from local_ghn_tracking tracking using local_projection_tombstones t
      where t.source_table='ghn_tracking' and t.tombstone_kind='SOURCE' and t.source_key=tracking.id and tracking.local_modified_at is null`);
    await client.query(`
    insert into local_fabric_types (id,name,description,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,s.payload->>'name',s.payload->>'description',s.payload->>'manager_id',s.payload->>'tenant_id',nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,true
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='fabric_types' and not s.is_deleted
    on conflict (id) do update set name=excluded.name,description=excluded.description,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,created_at=excluded.created_at,updated_at=excluded.updated_at,is_snapshot_record=true
    where local_fabric_types.local_modified_at is null`);
    await client.query(`
    insert into local_fabric_widths (id,width_code,description,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,s.payload->>'width_code',s.payload->>'description',s.payload->>'manager_id',s.payload->>'tenant_id',nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,true
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='fabric_widths' and not s.is_deleted
    on conflict (id) do update set width_code=excluded.width_code,description=excluded.description,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,created_at=excluded.created_at,updated_at=excluded.updated_at,is_snapshot_record=true
    where local_fabric_widths.local_modified_at is null`);
    await client.query(`
    insert into local_fabric_variants
      (id,fabric_type_id,variant_name,width_code,weight,color,origin,unit,cost_price,selling_price,fabric_width_id,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,s.payload->>'fabric_type_id',s.payload->>'variant_name',s.payload->>'width_code',s.payload->>'weight',s.payload->>'color',s.payload->>'origin',coalesce(nullif(s.payload->>'unit',''),'m'),
      nullif(s.payload->>'cost_price','')::numeric,nullif(s.payload->>'selling_price','')::numeric,s.payload->>'fabric_width_id',s.payload->>'manager_id',s.payload->>'tenant_id',
      nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,true
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='fabric_variants' and not s.is_deleted
    on conflict (id) do update set fabric_type_id=excluded.fabric_type_id,variant_name=excluded.variant_name,width_code=excluded.width_code,weight=excluded.weight,color=excluded.color,origin=excluded.origin,unit=excluded.unit,
      cost_price=excluded.cost_price,selling_price=excluded.selling_price,fabric_width_id=excluded.fabric_width_id,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,created_at=excluded.created_at,updated_at=excluded.updated_at,is_snapshot_record=true
    where local_fabric_variants.local_modified_at is null`);
    await client.query(`
    insert into local_warehouses
      (id,name,address,warehouse_type,is_active,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,s.payload->>'name',s.payload->>'address',coalesce(nullif(s.payload->>'warehouse_type',''),'MAIN'),coalesce(nullif(s.payload->>'is_active','')::boolean,true),s.payload->>'manager_id',s.payload->>'tenant_id',
      nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,true
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='warehouses' and not s.is_deleted
    on conflict (id) do update set name=excluded.name,address=excluded.address,warehouse_type=excluded.warehouse_type,is_active=excluded.is_active,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,created_at=excluded.created_at,updated_at=excluded.updated_at,is_snapshot_record=true
    where local_warehouses.local_modified_at is null`);
    await client.query(`
    insert into local_fabric_inventory
      (id,fabric_variant_id,warehouse_id,current_stock,packages_count,reserved_stock,minimum_stock,maximum_stock,last_updated,created_at,updated_at,manager_id,tenant_id,is_snapshot_record)
    select s.source_key,s.payload->>'fabric_variant_id',s.payload->>'warehouse_id',coalesce(nullif(s.payload->>'current_stock','')::numeric,0),coalesce(nullif(s.payload->>'packages_count','')::numeric,0),coalesce(nullif(s.payload->>'reserved_stock','')::numeric,0),
      nullif(s.payload->>'minimum_stock','')::numeric,nullif(s.payload->>'maximum_stock','')::numeric,nullif(s.payload->>'last_updated','')::timestamptz,nullif(s.payload->>'created_at','')::timestamptz,
      nullif(s.payload->>'updated_at','')::timestamptz,s.payload->>'manager_id',s.payload->>'tenant_id',true
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='fabric_inventory' and not s.is_deleted
    on conflict (id) do update set fabric_variant_id=excluded.fabric_variant_id,warehouse_id=excluded.warehouse_id,current_stock=excluded.current_stock,packages_count=excluded.packages_count,reserved_stock=excluded.reserved_stock,
      minimum_stock=excluded.minimum_stock,maximum_stock=excluded.maximum_stock,last_updated=excluded.last_updated,created_at=excluded.created_at,updated_at=excluded.updated_at,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,is_snapshot_record=true
    where local_fabric_inventory.local_modified_at is null`);
    await client.query(`
    insert into local_products
      (id,sku,name,category,rate_unit,is_active,created_at,description,price,cost_price,specifications,in_stock,updated_at,price_list_id,tenant_id,manager_id,images,image_url,source_updated_at,is_snapshot_record)
    select s.source_key::uuid,s.payload->>'sku',s.payload->>'name',s.payload->>'category',coalesce(nullif(s.payload->>'rate_unit',''),'PIECE'),
      coalesce(nullif(s.payload->>'is_active','')::boolean,true),nullif(s.payload->>'created_at','')::timestamptz,s.payload->>'description',
      nullif(s.payload->>'price','')::numeric,nullif(s.payload->>'cost_price','')::numeric,s.payload->>'specifications',
      coalesce(nullif(s.payload->>'in_stock','')::boolean,true),nullif(s.payload->>'updated_at','')::timestamptz,
      nullif(s.payload->>'price_list_id','')::uuid,s.payload->>'tenant_id',nullif(s.payload->>'manager_id','')::uuid,coalesce(s.payload->'images','[]'::jsonb),s.payload->>'image_url',
      nullif(s.payload->>'updated_at','')::timestamptz,true
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='products' and not s.is_deleted
    on conflict (id) do update set
      sku=excluded.sku,name=excluded.name,category=excluded.category,rate_unit=excluded.rate_unit,is_active=excluded.is_active,
      created_at=excluded.created_at,description=excluded.description,price=excluded.price,cost_price=excluded.cost_price,
      specifications=excluded.specifications,in_stock=excluded.in_stock,updated_at=excluded.updated_at,price_list_id=excluded.price_list_id,
      tenant_id=excluded.tenant_id,manager_id=excluded.manager_id,images=excluded.images,image_url=excluded.image_url,source_updated_at=excluded.source_updated_at,
      is_snapshot_record=true
    where local_products.local_modified_at is null`);
    await client.query(`
    insert into local_customers
      (id,customer_code,name,email,phone,address,company,notes,phones,addresses,tags,auto_tags,current_status,last_care_date,assignee_id,manager_id,tenant_id,purchase_count,last_purchase_date,total_spent,is_active,is_snapshot_record,created_at,updated_at)
    select s.source_key,s.payload->>'customer_code',s.payload->>'name',s.payload->>'email',s.payload->>'phone',s.payload->>'address',s.payload->>'company',s.payload->>'notes',
      coalesce(s.payload->'phones','[]'::jsonb),coalesce(s.payload->'addresses','[]'::jsonb),coalesce(s.payload->'tags','[]'::jsonb),coalesce(s.payload->'auto_tags','[]'::jsonb),
      coalesce(nullif(s.payload->>'current_status',''),'new'),nullif(s.payload->>'last_care_date','')::timestamptz,s.payload->>'assignee_id',s.payload->>'manager_id',s.payload->>'tenant_id',
      coalesce(nullif(s.payload->>'purchase_count','')::int,0),nullif(s.payload->>'last_purchase_date','')::timestamptz,nullif(s.payload->>'total_spent','')::numeric,
      coalesce(nullif(s.payload->>'is_active','')::boolean,true),true,nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='customers' and not s.is_deleted
    on conflict (id) do update set
      customer_code=excluded.customer_code,name=excluded.name,email=excluded.email,phone=excluded.phone,address=excluded.address,company=excluded.company,notes=excluded.notes,
      phones=excluded.phones,addresses=excluded.addresses,tags=excluded.tags,auto_tags=excluded.auto_tags,current_status=excluded.current_status,last_care_date=excluded.last_care_date,
      assignee_id=excluded.assignee_id,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,purchase_count=excluded.purchase_count,last_purchase_date=excluded.last_purchase_date,
      total_spent=excluded.total_spent,is_active=excluded.is_active,is_snapshot_record=true,created_at=excluded.created_at,updated_at=excluded.updated_at
    where local_customers.local_modified_at is null`);
    await client.query(`
    insert into local_price_lists
      (id,name,year,status,tenant_id,manager_id,is_snapshot_record,source_updated_at,created_at,updated_at,is_active)
    select s.source_key::uuid,s.payload->>'name',nullif(s.payload->>'year','')::int,s.payload->>'status',s.payload->>'tenant_id',nullif(s.payload->>'manager_id','')::uuid,true,
      nullif(s.payload->>'updated_at','')::timestamptz,nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,
      coalesce(nullif(s.payload->>'is_active','')::boolean,true)
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='price_lists' and not s.is_deleted
    on conflict (id) do update set name=excluded.name,year=excluded.year,status=excluded.status,tenant_id=excluded.tenant_id,manager_id=excluded.manager_id,
      is_snapshot_record=true,source_updated_at=excluded.source_updated_at,created_at=excluded.created_at,updated_at=excluded.updated_at,is_active=excluded.is_active
    where local_price_lists.local_modified_at is null`);
    await client.query(`
    insert into local_quotes
      (id,customer_id,quote_number,status,subtotal,vat_rate,vat_amount,total_amount,include_vat,items,quote_data,notes,created_at,updated_at,manager_id,assignee_id,price_list_id)
    select s.source_key,s.payload->>'customer_id',s.payload->>'quote_number',coalesce(nullif(s.payload->>'status',''),'draft'),
      coalesce(nullif(s.payload->>'subtotal','')::numeric,0),coalesce(nullif(s.payload->>'vat_rate','')::numeric,0),coalesce(nullif(s.payload->>'vat_amount','')::numeric,0),
      coalesce(nullif(s.payload->>'total_amount','')::numeric,0),coalesce(nullif(s.payload->>'include_vat','')::boolean,false),coalesce(s.payload->'items','[]'::jsonb),coalesce(s.payload->'quote_data','{}'::jsonb),
      s.payload->>'notes',nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,s.payload->>'manager_id',s.payload->>'assignee_id',s.payload->>'price_list_id'
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='quotes' and not s.is_deleted
    on conflict (id) do update set customer_id=excluded.customer_id,quote_number=excluded.quote_number,status=excluded.status,subtotal=excluded.subtotal,vat_rate=excluded.vat_rate,
      vat_amount=excluded.vat_amount,total_amount=excluded.total_amount,include_vat=excluded.include_vat,items=excluded.items,quote_data=excluded.quote_data,notes=excluded.notes,
      created_at=excluded.created_at,updated_at=excluded.updated_at,manager_id=excluded.manager_id,assignee_id=excluded.assignee_id,price_list_id=excluded.price_list_id
    where local_quotes.local_modified_at is null`);
    await client.query(`
    insert into local_orders
      (id,customer_id,order_number,display_order_number,status,payment_status,total_amount,payment_date,delivery_date,delivered_date,items,notes,created_at,updated_at,manager_id,assignee_id,quote_id,tenant_id,subtotal,vat_rate,vat_amount,include_vat,cost_price_source,cost_price_is_estimated,is_snapshot_record)
    select s.source_key,s.payload->>'customer_id',s.payload->>'order_number',coalesce(nullif(s.payload->>'display_order_number',''),s.payload->>'order_number'),coalesce(nullif(s.payload->>'status',''),'pending'),
      coalesce(nullif(s.payload->>'payment_status',''),'pending'),coalesce(nullif(s.payload->>'total_amount','')::numeric,0),nullif(s.payload->>'payment_date','')::timestamptz,
      nullif(s.payload->>'delivery_date','')::timestamptz,nullif(s.payload->>'delivered_date','')::timestamptz,coalesce(s.payload->'items','[]'::jsonb),s.payload->>'notes',
      nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,s.payload->>'manager_id',s.payload->>'assignee_id',s.payload->>'quote_id',s.payload->>'tenant_id',
      coalesce(nullif(s.payload->>'subtotal','')::numeric,0),coalesce(nullif(s.payload->>'vat_rate','')::numeric,0),coalesce(nullif(s.payload->>'vat_amount','')::numeric,0),coalesce(nullif(s.payload->>'include_vat','')::boolean,false),
      s.payload->>'cost_price_source',coalesce(nullif(s.payload->>'cost_price_is_estimated','')::boolean,false),true
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='orders' and not s.is_deleted
    on conflict (id) do update set customer_id=excluded.customer_id,order_number=excluded.order_number,display_order_number=excluded.display_order_number,
      status=case when exists(select 1 from local_production_sales_requests r where r.order_id=local_orders.id and r.status not in ('RETURNED','CANCELLED')) then local_orders.status else excluded.status end,
      payment_status=excluded.payment_status,total_amount=excluded.total_amount,payment_date=excluded.payment_date,delivery_date=excluded.delivery_date,delivered_date=excluded.delivered_date,
      items=case when exists(select 1 from local_production_sales_requests r where r.order_id=local_orders.id and r.status not in ('RETURNED','CANCELLED')) then local_orders.items else excluded.items end,
      notes=excluded.notes,created_at=excluded.created_at,updated_at=excluded.updated_at,
      manager_id=case when exists(select 1 from local_production_sales_requests r where r.order_id=local_orders.id and r.status not in ('RETURNED','CANCELLED')) then local_orders.manager_id else excluded.manager_id end,
      assignee_id=case when exists(select 1 from local_production_sales_requests r where r.order_id=local_orders.id and r.status not in ('RETURNED','CANCELLED')) then local_orders.assignee_id else excluded.assignee_id end,
      quote_id=excluded.quote_id,
      tenant_id=excluded.tenant_id,subtotal=excluded.subtotal,vat_rate=excluded.vat_rate,vat_amount=excluded.vat_amount,include_vat=excluded.include_vat,cost_price_source=excluded.cost_price_source,
      cost_price_is_estimated=excluded.cost_price_is_estimated,is_snapshot_record=true
    where local_orders.local_modified_at is null`);
    await client.query(`
    insert into local_order_payments
      (id,order_id,payment_amount,payment_date,payment_type,payment_method,installment_number,notes,created_at,updated_at,is_snapshot_record)
    select s.source_key,s.payload->>'order_id',coalesce(nullif(s.payload->>'payment_amount','')::numeric,0),nullif(s.payload->>'payment_date','')::timestamptz,
      s.payload->>'payment_type',s.payload->>'payment_method',nullif(s.payload->>'installment_number','')::integer,s.payload->>'notes',
      nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,true
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='order_payments' and not s.is_deleted
      and not exists (select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=s.source_key)
    on conflict (id) do update set order_id=excluded.order_id,payment_amount=excluded.payment_amount,payment_date=excluded.payment_date,
      payment_type=excluded.payment_type,payment_method=excluded.payment_method,installment_number=excluded.installment_number,notes=excluded.notes,
      created_at=excluded.created_at,updated_at=excluded.updated_at,is_snapshot_record=true
    where local_order_payments.local_modified_at is null`);
    await client.query(`
    insert into local_transactions
      (id,amount,date,type,description,category,payment_type,order_id,installment_number,total_installments,remaining_amount,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,coalesce(nullif(s.payload->>'amount','')::numeric,0),coalesce(nullif(s.payload->>'date','')::timestamptz,now()),coalesce(s.payload->>'type',''),
      s.payload->>'description',s.payload->>'category',s.payload->>'payment_type',s.payload->>'order_id',nullif(s.payload->>'installment_number','')::integer,
      nullif(s.payload->>'total_installments','')::integer,nullif(s.payload->>'remaining_amount','')::numeric,s.payload->>'manager_id',s.payload->>'tenant_id',
      coalesce(nullif(s.payload->>'created_at','')::timestamptz,now()),coalesce(nullif(s.payload->>'updated_at','')::timestamptz,now()),true
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='transactions' and not s.is_deleted
      and not exists (select 1 from local_projection_tombstones t where t.source_table='transactions' and t.source_key=s.source_key)
    on conflict (id) do update set amount=excluded.amount,date=excluded.date,type=excluded.type,description=excluded.description,category=excluded.category,
      payment_type=excluded.payment_type,order_id=excluded.order_id,installment_number=excluded.installment_number,total_installments=excluded.total_installments,
      remaining_amount=excluded.remaining_amount,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,created_at=excluded.created_at,
      updated_at=excluded.updated_at,is_snapshot_record=true
    where local_transactions.local_modified_at is null`);
    await client.query(`
    insert into local_ghn_tracking
      (id,ghn_order_code,internal_order_code,order_id,customer_name,customer_phone,customer_address,package_weight,created_date,expected_delivery_date,delivered_date,
       cod_amount,ghn_status,ghn_status_text,tracking_url,last_updated_at,tracking_notes,raw_data,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,coalesce(s.payload->>'ghn_order_code',s.source_key),s.payload->>'internal_order_code',s.payload->>'order_id',coalesce(s.payload->>'customer_name',''),
      s.payload->>'customer_phone',s.payload->>'customer_address',nullif(s.payload->>'package_weight','')::numeric,nullif(s.payload->>'created_date','')::timestamptz,
      nullif(s.payload->>'expected_delivery_date','')::timestamptz,nullif(s.payload->>'delivered_date','')::timestamptz,nullif(s.payload->>'cod_amount','')::numeric,
      s.payload->>'ghn_status',s.payload->>'ghn_status_text',s.payload->>'tracking_url',nullif(s.payload->>'last_updated_at','')::timestamptz,s.payload->>'tracking_notes',
      s.payload->'raw_data',s.payload->>'manager_id',s.payload->>'tenant_id',coalesce(nullif(s.payload->>'created_at','')::timestamptz,now()),
      coalesce(nullif(s.payload->>'updated_at','')::timestamptz,now()),true
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='ghn_tracking' and not s.is_deleted
      and not exists (select 1 from local_projection_tombstones t where t.source_table='ghn_tracking' and t.source_key=s.source_key)
    on conflict (id) do update set ghn_order_code=excluded.ghn_order_code,internal_order_code=excluded.internal_order_code,order_id=excluded.order_id,
      customer_name=excluded.customer_name,customer_phone=excluded.customer_phone,customer_address=excluded.customer_address,package_weight=excluded.package_weight,
      created_date=excluded.created_date,expected_delivery_date=excluded.expected_delivery_date,delivered_date=excluded.delivered_date,cod_amount=excluded.cod_amount,
      ghn_status=excluded.ghn_status,ghn_status_text=excluded.ghn_status_text,tracking_url=excluded.tracking_url,last_updated_at=excluded.last_updated_at,
      tracking_notes=excluded.tracking_notes,raw_data=excluded.raw_data,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,created_at=excluded.created_at,
      updated_at=excluded.updated_at,is_snapshot_record=true
    where local_ghn_tracking.local_modified_at is null`);

    // Public changes to manufacturing source fields require an explicit local
    // acknowledgement. The raw snapshot remains current while released work
    // keeps the source version that it was planned from.
    await client.query(`
      create temporary table local_sync_source_change_candidates on commit drop as
      select r.id request_id,r.order_id,r.status from_status,
        md5(jsonb_build_object(
          'items',coalesce(s.payload->'items','[]'::jsonb),
          'status',coalesce(nullif(s.payload->>'status',''),'pending'),
          'manager_id',nullif(s.payload->>'manager_id',''),
          'assignee_id',nullif(s.payload->>'assignee_id','')
        )::text) source_hash
      from local_production_sales_requests r
      join local_orders o on o.id=r.order_id
      join local_source_snapshots s on s.source='SUPABASE' and s.source_schema='public' and s.source_table='orders' and s.source_key=o.id and not s.is_deleted
      where r.status in ('SUBMITTED','ACCEPTED','ADJUSTMENT_REQUIRED')
        and (
          o.items is distinct from coalesce(s.payload->'items','[]'::jsonb)
          or o.status is distinct from coalesce(nullif(s.payload->>'status',''),'pending')
          or o.manager_id is distinct from nullif(s.payload->>'manager_id','')
          or o.assignee_id is distinct from nullif(s.payload->>'assignee_id','')
        )
        and not exists (
          select 1 from local_production_sales_events acknowledged
          where acknowledged.request_id=r.id and acknowledged.action='SOURCE_CHANGE_ACKNOWLEDGED'
            and acknowledged.data->>'source_hash'=md5(jsonb_build_object(
              'items',coalesce(s.payload->'items','[]'::jsonb),
              'status',coalesce(nullif(s.payload->>'status',''),'pending'),
              'manager_id',nullif(s.payload->>'manager_id',''),
              'assignee_id',nullif(s.payload->>'assignee_id','')
            )::text)
        )`);
    await client.query(`
      insert into local_production_sales_events(request_id,action,from_status,to_status,reason,actor_id,data)
      select c.request_id,'SOURCE_CHANGE_DETECTED',c.from_status,'ADJUSTMENT_REQUIRED',
        'Supabase public đã thay đổi dữ liệu nguồn; local giữ nguyên phiên bản đã bàn giao để quản lý xem xét.',
        'SUPABASE_SYNC',jsonb_build_object('source_hash',c.source_hash)
      from local_sync_source_change_candidates c
      where not exists (
        select 1 from local_production_sales_events detected
        where detected.request_id=c.request_id and detected.action='SOURCE_CHANGE_DETECTED'
          and detected.data->>'source_hash'=c.source_hash
      )`);
    await client.query(`
      update local_production_sales_requests r
      set status='ADJUSTMENT_REQUIRED',review_reason='Dữ liệu đơn public đã thay đổi; cần quản lý xem xét trước khi tiếp tục sản xuất.',updated_at=now()
      from local_sync_source_change_candidates c
      where r.id=c.request_id and r.status<>'ADJUSTMENT_REQUIRED'`);
    await client.query(`
      update local_production_orders o
      set status='ON_HOLD',updated_at=now(),local_modified_at=coalesce(local_modified_at,now())
      where o.status in ('RELEASED','IN_PROGRESS')
        and exists(select 1 from local_sync_source_change_candidates c where c.request_id=o.sales_request_id)`);

    await client.query(`
    insert into local_fabric_transactions
      (id,fabric_variant_id,warehouse_id,transaction_type,quantity,packages_count,unit_price,total_amount,reference_number,supplier_name,recipient_name,notes,transaction_date,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,s.payload->>'fabric_variant_id',s.payload->>'warehouse_id',s.payload->>'transaction_type',
      coalesce(nullif(s.payload->>'quantity','')::numeric,0),coalesce(nullif(s.payload->>'packages_count','')::numeric,0),
      nullif(s.payload->>'unit_price','')::numeric,nullif(s.payload->>'total_amount','')::numeric,
      s.payload->>'reference_number',s.payload->>'supplier_name',s.payload->>'recipient_name',s.payload->>'notes',
      nullif(s.payload->>'transaction_date','')::timestamptz,s.payload->>'manager_id',s.payload->>'tenant_id',
      nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,true
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='fabric_transactions' and not s.is_deleted
    on conflict (id) do update set
      fabric_variant_id=excluded.fabric_variant_id,warehouse_id=excluded.warehouse_id,transaction_type=excluded.transaction_type,
      quantity=excluded.quantity,packages_count=excluded.packages_count,unit_price=excluded.unit_price,total_amount=excluded.total_amount,
      reference_number=excluded.reference_number,supplier_name=excluded.supplier_name,recipient_name=excluded.recipient_name,
      notes=excluded.notes,transaction_date=excluded.transaction_date,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,
      created_at=excluded.created_at,updated_at=excluded.updated_at
    where local_fabric_transactions.local_modified_at is null`);
    await client.query(`
    insert into local_fabric_transfers
      (id,fabric_variant_id,from_warehouse_id,to_warehouse_id,quantity,transfer_date,status,notes,approved_by,received_by,manager_id,tenant_id,created_at,updated_at,is_snapshot_record)
    select s.source_key,s.payload->>'fabric_variant_id',s.payload->>'from_warehouse_id',s.payload->>'to_warehouse_id',coalesce(nullif(s.payload->>'quantity','')::numeric,0),
      nullif(s.payload->>'transfer_date','')::timestamptz,s.payload->>'status',s.payload->>'notes',s.payload->>'approved_by',s.payload->>'received_by',
      s.payload->>'manager_id',s.payload->>'tenant_id',coalesce(nullif(s.payload->>'created_at','')::timestamptz,s.source_updated_at,now()),
      coalesce(nullif(s.payload->>'updated_at','')::timestamptz,s.source_updated_at,now()),true
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='fabric_transfers' and not s.is_deleted
    on conflict (id) do update set fabric_variant_id=excluded.fabric_variant_id,from_warehouse_id=excluded.from_warehouse_id,to_warehouse_id=excluded.to_warehouse_id,
      quantity=excluded.quantity,transfer_date=excluded.transfer_date,status=excluded.status,notes=excluded.notes,approved_by=excluded.approved_by,
      received_by=excluded.received_by,manager_id=excluded.manager_id,tenant_id=excluded.tenant_id,created_at=excluded.created_at,updated_at=excluded.updated_at,
      is_snapshot_record=true
    where local_fabric_transfers.local_modified_at is null`);
    await client.query(`
    insert into local_fabric_usage
      (id,order_id,order_number,order_type,fabric_variant_id,warehouse_id,quantity_used,unit,usage_date,notes,customer_name,customer_code,fabric_width,manager_id,tenant_id,created_at,updated_at,is_snapshot_record,order_group)
    select s.source_key,s.payload->>'order_id',s.payload->>'order_number',s.payload->>'order_type',s.payload->>'fabric_variant_id',s.payload->>'warehouse_id',
      coalesce(nullif(s.payload->>'quantity_used','')::numeric,0),s.payload->>'unit',nullif(s.payload->>'usage_date','')::timestamptz,
      s.payload->>'notes',s.payload->>'customer_name',s.payload->>'customer_code',s.payload->>'fabric_width',s.payload->>'manager_id',s.payload->>'tenant_id',
      nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,true,coalesce(nullif(s.payload->>'order_group',''),'unclassified')
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='fabric_usage' and not s.is_deleted
    on conflict (id) do update set
      order_id=excluded.order_id,order_number=excluded.order_number,order_type=excluded.order_type,fabric_variant_id=excluded.fabric_variant_id,
      warehouse_id=excluded.warehouse_id,quantity_used=excluded.quantity_used,unit=excluded.unit,usage_date=excluded.usage_date,notes=excluded.notes,
      customer_name=excluded.customer_name,customer_code=excluded.customer_code,fabric_width=excluded.fabric_width,manager_id=excluded.manager_id,
      tenant_id=excluded.tenant_id,created_at=excluded.created_at,updated_at=excluded.updated_at,order_group=excluded.order_group
    where local_fabric_usage.local_modified_at is null`);
    await client.query(`
    insert into local_workers
      (id,employee_code,display_name,worker_type,is_active,location_code,position_title,employment_type,payroll_status,created_at,updated_at,employment_start_date,employment_end_date,user_id)
    select s.source_key::uuid,s.payload->>'employee_code',s.payload->>'display_name',coalesce(nullif(s.payload->>'worker_type',''),'GENERIC'),
      coalesce(nullif(s.payload->>'is_active','')::boolean,true),s.payload->>'location_code',s.payload->>'position_title',s.payload->>'employment_type',
      coalesce(nullif(s.payload->>'payroll_status',''),'ACTIVE'),nullif(s.payload->>'created_at','')::timestamptz,nullif(s.payload->>'updated_at','')::timestamptz,
      nullif(s.payload->>'employment_start_date','')::date,nullif(s.payload->>'employment_end_date','')::date,nullif(s.payload->>'user_id','')
    from local_source_snapshots s
    where s.source='SUPABASE' and s.source_table='production_workers' and not s.is_deleted
    on conflict (id) do update set
      employee_code=excluded.employee_code,display_name=excluded.display_name,worker_type=excluded.worker_type,is_active=excluded.is_active,
      location_code=excluded.location_code,position_title=excluded.position_title,employment_type=excluded.employment_type,payroll_status=excluded.payroll_status,
      updated_at=excluded.updated_at,employment_start_date=excluded.employment_start_date,employment_end_date=excluded.employment_end_date,user_id=excluded.user_id
    where local_workers.local_modified_at is null`);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Local account overrides win for the complete user's role/grant set. Only
 * confirmed source tombstones revoke imported rows; failed/incremental reads
 * never imply deletion. Called inside the projection transaction. */
export async function refreshPermissionProjections(client) {
  // A source row may change its semantic key while retaining its source ID.
  // Disable the old tuple as well; it must not survive as an extra role/grant.
  await client.query(`update local_user_roles r set is_active=false,updated_at=now()
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='user_roles'
      and r.source_snapshot_key=s.source_key and r.is_snapshot_record and r.local_modified_at is null
      and (s.is_deleted or s.payload->>'user_id' is distinct from r.user_id or s.payload->>'role' is distinct from r.role)
      and not exists(select 1 from local_user_roles own where own.user_id=r.user_id and own.local_modified_at is not null)
      and not exists(select 1 from local_source_snapshots live where live.source='SUPABASE' and live.source_table='user_roles' and not live.is_deleted and live.payload->>'user_id'=r.user_id and live.payload->>'role'=r.role)`);
  await client.query(`update local_employee_permissions ep set enabled=false,updated_at=now()
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='employee_permissions'
      and ep.source_snapshot_key=s.source_key and ep.is_snapshot_record and ep.local_modified_at is null
      and (s.is_deleted or s.payload->>'user_id' is distinct from ep.user_id or s.payload->>'permission_type' is distinct from ep.permission_type)
      and not exists(select 1 from local_employee_permissions own where own.user_id=ep.user_id and own.local_modified_at is not null)
      and not exists(select 1 from local_source_snapshots live where live.source='SUPABASE' and live.source_table='employee_permissions' and not live.is_deleted and live.payload->>'user_id'=ep.user_id and live.payload->>'permission_type'=ep.permission_type)`);
  await client.query(`insert into local_user_roles(user_id,role,assigned_by,is_active,is_snapshot_record,source_snapshot_key,created_at,updated_at)
    select s.payload->>'user_id',s.payload->>'role',s.payload->>'assigned_by',coalesce((s.payload->>'is_active')::boolean,true),true,s.source_key,
      coalesce(nullif(s.payload->>'created_at','')::timestamptz,s.first_seen_at),coalesce(nullif(s.payload->>'updated_at','')::timestamptz,s.last_seen_at)
    from local_source_snapshots s join local_user_profiles p on p.user_id=s.payload->>'user_id'
    where s.source='SUPABASE' and s.source_table='user_roles' and not s.is_deleted
      and s.payload->>'role' in ('admin','manager','accountant','employee')
      and not exists(select 1 from local_user_roles own where own.user_id=p.user_id and own.local_modified_at is not null)
    on conflict(user_id,role) do update set assigned_by=excluded.assigned_by,is_active=excluded.is_active,source_snapshot_key=excluded.source_snapshot_key,updated_at=excluded.updated_at
    where local_user_roles.local_modified_at is null and local_user_roles.is_snapshot_record`);
  await client.query(`update local_user_roles r set is_active=false,updated_at=now()
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='user_roles' and s.is_deleted
      and r.source_snapshot_key=s.source_key and r.is_snapshot_record and r.local_modified_at is null
      and not exists(select 1 from local_user_roles own where own.user_id=r.user_id and own.local_modified_at is not null)
      and not exists(select 1 from local_source_snapshots live where live.source='SUPABASE' and live.source_table='user_roles' and not live.is_deleted and live.payload->>'user_id'=r.user_id and live.payload->>'role'=r.role)`);
  await client.query(`insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,is_snapshot_record,source_snapshot_key,created_at,updated_at)
    select s.payload->>'user_id',s.payload->>'permission_type',coalesce((s.payload->>'enabled')::boolean,false),coalesce(s.payload->>'assigned_by',s.payload->>'created_by'),true,s.source_key,
      coalesce(nullif(s.payload->>'created_at','')::timestamptz,s.first_seen_at),coalesce(nullif(s.payload->>'updated_at','')::timestamptz,s.last_seen_at)
    from local_source_snapshots s join local_user_profiles p on p.user_id=s.payload->>'user_id'
    where s.source='SUPABASE' and s.source_table='employee_permissions' and not s.is_deleted and nullif(s.payload->>'permission_type','') is not null
      and not exists(select 1 from local_employee_permissions own where own.user_id=p.user_id and own.local_modified_at is not null)
    on conflict(user_id,permission_type) do update set enabled=excluded.enabled,assigned_by=excluded.assigned_by,source_snapshot_key=excluded.source_snapshot_key,updated_at=excluded.updated_at
    where local_employee_permissions.local_modified_at is null and local_employee_permissions.is_snapshot_record`);
  await client.query(`update local_employee_permissions ep set enabled=false,updated_at=now()
    from local_source_snapshots s where s.source='SUPABASE' and s.source_table='employee_permissions' and s.is_deleted
      and ep.source_snapshot_key=s.source_key and ep.is_snapshot_record and ep.local_modified_at is null
      and not exists(select 1 from local_employee_permissions own where own.user_id=ep.user_id and own.local_modified_at is not null)
      and not exists(select 1 from local_source_snapshots live where live.source='SUPABASE' and live.source_table='employee_permissions' and not live.is_deleted and live.payload->>'user_id'=ep.user_id and live.payload->>'permission_type'=ep.permission_type)`);
}

async function main() {
  const env = await loadEnv();
  const requested = argValue("--tables");
  const configuredTables = JSON.parse(await fs.readFile(path.join(root, "config", "supabase-sync-tables.json"), "utf8"));
  const tables = requested ? requested.split(",").map((table) => table.trim()).filter(Boolean) : configuredTables;
  const pageSize = Number(argValue("--page-size") || 500);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("--page-size phải nằm trong khoảng 1-1000.");
  const apply = process.argv.includes("--apply");
  const incremental = process.argv.includes("--incremental");
  const mode = apply ? (incremental ? "INCREMENTAL" : "SNAPSHOT") : "DRY_RUN";
  const client = sourceClient(env);
  const authoritativeSecuritySource = hasAuthoritativeSecuritySource(env);
  const localPool = apply ? new Pool({ connectionString: env.LOCAL_DATABASE_URL || "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/crm_local" }) : null;
  const stats = {};
  const startedAt = new Date().toISOString();
  let syncRunId = null;
  let incrementalSince = null;

  try {
    if (localPool) {
      if (incremental) {
        // Never advance the cursor past a partially failed run. A table that
        // was skipped or errored must be retried from a complete snapshot;
        // otherwise unchanged rows can be missed forever by updated_at > cursor.
        const previous = await localPool.query("select status,completed_at from local_sync_runs where source='SUPABASE' order by started_at desc limit 1");
        incrementalSince = previous.rows[0]?.status === 'COMPLETED' && previous.rows[0]?.completed_at
          ? new Date(previous.rows[0].completed_at).toISOString()
          : null;
      }
      const run = await localPool.query(`insert into local_sync_runs(source,mode,status,requested_tables,started_at)
        values('SUPABASE',$1,'RUNNING',$2::jsonb,$3) returning id`, [mode, JSON.stringify(tables), startedAt]);
      syncRunId = run.rows[0].id;
    }

    for (const table of tables) {
      const tableStat = { rows: 0, changed: 0, unchanged: 0, error: null };
      try {
        // Security tables are small and deletion-sensitive: a delta cannot
        // represent a removed role. Read them fully even during incremental sync.
        const securityTable = ['user_roles','employee_permissions'].includes(table);
        const read = await readTable(client, table, pageSize, securityTable ? null : incrementalSince);
        const rows = read.rows;
        tableStat.rows = rows.length;
        tableStat.since = incrementalSince;
        tableStat.readComplete = read.complete;
        tableStat.stableOrdering = read.stableOrdering;
        if (localPool) {
          for (const row of rows) {
            const sourceKey = rowKey(row);
            const sourceHash = hash(row);
            const previous = await localPool.query(`
              select source_hash
              from local_source_snapshots
              where source='SUPABASE' and source_schema='public' and source_table=$1 and source_key=$2`,
              [table, sourceKey]);
            await localPool.query(`
              insert into local_source_snapshots(source,source_schema,source_table,source_key,source_updated_at,source_hash,payload,sync_run_id,is_deleted)
              values('SUPABASE','public',$1,$2,$3,$4,$5::jsonb,$6,false)
              on conflict(source,source_schema,source_table,source_key) do update set
                source_updated_at=excluded.source_updated_at,
                source_hash=excluded.source_hash,
                payload=excluded.payload,
                sync_run_id=excluded.sync_run_id,
                last_seen_at=now(),
                is_deleted=false
              `, [table, sourceKey, updatedAt(row), sourceHash, JSON.stringify(row), syncRunId]);
            if (!previous.rows[0] || previous.rows[0].source_hash !== sourceHash) tableStat.changed += 1;
            else tableStat.unchanged += 1;
          }
          tableStat.securityDeletionSkipped = securityTable && !authoritativeSecuritySource;
          if ((!incremental || securityTable) && read.complete && (!securityTable || authoritativeSecuritySource)) {
            const deleted = await localPool.query(`
              update local_source_snapshots
              set is_deleted=true, sync_run_id=$2
              where source='SUPABASE' and source_schema='public' and source_table=$1
                and sync_run_id is distinct from $2 and not is_deleted
              returning source_key`, [table, syncRunId]);
            tableStat.deleted = deleted.rowCount || 0;
          }
        }
      } catch (error) {
        if (isMissingSourceTable(error)) {
          tableStat.skipped = true;
          tableStat.skipReason = "Bảng không tồn tại trên Supabase public; giữ nguyên snapshot local hiện có.";
        } else {
          tableStat.error = error instanceof Error ? error.message : String(error);
        }
      }
      stats[table] = tableStat;
      const status = tableStat.error
        ? `ERROR: ${tableStat.error}`
        : tableStat.skipped
          ? `SKIPPED: ${tableStat.skipReason}`
          : `${tableStat.rows} rows${localPool ? `, ${tableStat.changed} changed` : ""}`;
      console.log(`${table}: ${status}`);
    }

    if (localPool) {
      try {
        const authStat = await syncAuthProfiles(client, localPool);
        stats.__auth_profiles = { rows: authStat.users, changed: authStat.users, unchanged: 0, error: null };
        console.log(`auth_profiles: ${authStat.users} users reconciled locally`);
      } catch (error) {
        stats.__auth_profiles = { rows: 0, changed: 0, unchanged: 0, error: error instanceof Error ? error.message : String(error) };
        console.log(`auth_profiles: ERROR: ${stats.__auth_profiles.error}`);
      }
      await refreshCanonicalProjections(localPool);
    }

    const errors = Object.values(stats).filter((stat) => stat.error).length;
    if (localPool) {
      await localPool.query(`update local_sync_runs set status=$2,table_stats=$3::jsonb,error_count=$4,completed_at=now() where id=$1`, [syncRunId, errors ? "COMPLETED_WITH_ERRORS" : "COMPLETED", JSON.stringify(stats), errors]);
    }
    const totalRows = Object.values(stats).reduce((sum, stat) => sum + stat.rows, 0);
    console.log(`Supabase -> local ${mode}: ${tables.length} tables, ${totalRows} readable rows, ${errors} table errors.`);
    if (errors && apply) process.exitCode = 2;
  } catch (error) {
    if (localPool && syncRunId) await localPool.query("update local_sync_runs set status='FAILED',completed_at=now() where id=$1", [syncRunId]).catch(() => undefined);
    throw error;
  } finally {
    await localPool?.end();
  }
}

const invokedAsScript = Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
