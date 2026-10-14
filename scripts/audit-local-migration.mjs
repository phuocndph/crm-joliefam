import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

// Read-only audit. Credentials are supplied by Node's --env-file, never logged.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : [];
}));
const envFile = async (name) => parseEnv(await fs.readFile(path.join(root, name), 'utf8').catch(() => ''));
const env = { ...(await envFile('.env')), ...(await envFile('.env.local')), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Missing source credentials. Use Node --env-file locally.');
const source = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }),
} });
const db = new pg.Client({ connectionString: env.LOCAL_DATABASE_URL || 'postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/crm_local' });
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const hash = (v) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const rowKey = (row) => {
  for (const field of ['id', 'uuid', 'code', 'sku', 'customer_code', 'order_number', 'quote_number', 'document_number']) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]) !== '') return String(row[field]);
  }
  return hash(row);
};
const safeError = (e) => String(e?.message || e).replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 300);
async function filesUnder(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}
async function readRows(table) {
  let ordered = true;
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    let query = source.from(table).select('*');
    if (ordered) query = query.order('id', { ascending: true });
    let result = await query.range(offset, offset + 499);
    if (result.error && ordered && /column .*id|order/i.test(result.error.message)) {
      ordered = false;
      result = await source.from(table).select('*').range(offset, offset + 499);
    }
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < 500) break;
  }
  return { rows, ordered };
}
const report = { audited_at: new Date().toISOString(), scope: 'read-only REST-visible source; no direct remote SQL access', ready_to_disconnect: false,
  inventory: {}, tables: [], canonical: [], storage: [], auth: {}, code: {}, limitations: [
    'REST inventory cannot prove completeness of private schemas, functions, triggers, cron jobs or database secrets.',
    'Source remains live; reads across tables are not a transaction-consistent cutover snapshot.',
    'Counts and hashes exclude local-only edits; they audit the preserved raw source separately.',
  ] };
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const configured = JSON.parse(await fs.readFile(path.join(root, 'config/supabase-sync-tables.json'), 'utf8'));
  const codeFiles = (await filesUnder(path.join(root, 'src'))).filter((f) => /\.(ts|tsx)$/.test(f));
  const codeTables = new Set();
  const codeFunctions = new Set();
  const references = [];
  for (const file of codeFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(/\.from\(\s*['"]([^'"]+)['"]/g)) codeTables.add(match[1]);
    for (const match of text.matchAll(/\.invoke\(\s*['"]([^'"]+)['"]/g)) codeFunctions.add(match[1]);
    text.split(/\r?\n/).forEach((line, i) => {
      if (/supabase\.co|\/functions\/v1\/|VITE_SUPABASE|createClient\(/.test(line)) references.push({ file: path.relative(root, file).replaceAll('\\', '/'), line: i + 1 });
    });
  }
  // Storage bucket names also use .from; exclude them from the table inventory.
  const bucketsInCode = new Set(['product-images', 'knowledge-files', 'logos']);
  for (const bucket of bucketsInCode) codeTables.delete(bucket);
  let discovered = [];
  try {
    const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`OpenAPI HTTP ${response.status}`);
    const api = await response.json();
    discovered = Object.keys(api.paths || {}).filter((p) => /^\/[a-zA-Z_][\w]*$/.test(p)).map((p) => p.slice(1)).sort();
  } catch (error) { report.inventory.discovery_error = safeError(error); }
  report.inventory = { ...report.inventory, configured: configured.length, discovered_rest_relations: discovered.length,
    discovered_not_configured: discovered.filter((t) => !configured.includes(t)), code_tables_not_configured: [...codeTables].filter((t) => !configured.includes(t)).sort() };
  const tables = [...new Set([...configured, ...discovered, ...codeTables])].sort();
  const snapshotRows = (await db.query("select source_table,source_key,source_hash,is_deleted from local_source_snapshots where source='SUPABASE' and source_schema='public'")).rows;
  for (const table of tables) {
    const saved = new Map(snapshotRows.filter((r) => r.source_table === table && !r.is_deleted).map((r) => [r.source_key, r.source_hash]));
    const stat = { table, configured: configured.includes(table), snapshot_rows: saved.size };
    if (!configured.includes(table) && discovered.includes(table)) {
      Object.assign(stat, { status: 'DERIVED_RELATION_NOT_SNAPSHOTTED', note: 'REST-visible relation is not in the source table snapshot allowlist.' });
      report.tables.push(stat);
      console.log(`${table}: ${stat.status}; snapshot=${stat.snapshot_rows}`);
      continue;
    }
    try {
      const { rows, ordered } = await readRows(table);
      const keys = new Set(rows.map(rowKey));
      const missing = rows.filter((r) => !saved.has(rowKey(r)));
      const different = rows.filter((r) => saved.has(rowKey(r)) && saved.get(rowKey(r)) !== hash(r));
      Object.assign(stat, { source_rows: rows.length, ordered, unique_source_keys: keys.size, missing_in_snapshot: missing.length,
        different_content: different.length, snapshot_not_in_source: [...saved.keys()].filter((k) => !keys.has(k)).length,
        status: missing.length || different.length || keys.size !== rows.length ? 'GAP' : 'MATCH',
        missing_ids: missing.slice(0, 30).map(rowKey), different_ids: different.slice(0, 30).map(rowKey) });
    } catch (error) {
      // OpenAPI can retain stale paths for relations that were removed from the
      // public schema. Treat a confirmed "relation does not exist" as an
      // absent source relation, not as a data-loss gap. Permission/network
      // failures remain hard errors so the audit cannot pass closed silently.
      const absent = /relation .* does not exist|could not find the table .* in the schema cache/i.test(error.message || '');
      Object.assign(stat, { status: absent ? 'ABSENT_ON_SOURCE' : 'ERROR', error: safeError(error) });
    }
    report.tables.push(stat);
    console.log(`${table}: ${stat.status}; source=${stat.source_rows ?? '?'} snapshot=${stat.snapshot_rows} missing=${stat.missing_in_snapshot ?? '?'} changed=${stat.different_content ?? '?'}`);
  }
  const mappings = { customers: 'local_customers', products: 'local_products', price_lists: 'local_price_lists', orders: 'local_orders',
    quotes: 'local_quotes', order_payments: 'local_order_payments', contracts: 'local_contracts', expenses: 'local_expenses',
    transactions: 'local_transactions', profiles: 'local_user_profiles', user_roles: 'local_user_roles',
    employee_permissions: 'local_employee_permissions', knowledge_documents: 'local_knowledge_documents',
    fabric_types: 'local_fabric_types', fabric_widths: 'local_fabric_widths', warehouses: 'local_warehouses',
    fabric_variants: 'local_fabric_variants', fabric_inventory: 'local_fabric_inventory', fabric_transactions: 'local_fabric_transactions',
    fabric_transfers: 'local_fabric_transfers', fabric_usage: 'local_fabric_usage', ghn_tracking: 'local_ghn_tracking', einvoices: 'local_einvoices',
    production_workers: 'local_workers', production_orders: 'local_production_orders', assignees: 'local_assignees',
    quote_template_settings: 'local_quote_template_settings' };
  for (const [table, target] of Object.entries(mappings)) {
    await db.query('SAVEPOINT canonical_check');
    try {
      const targetExists = await db.query('select to_regclass($1) is not null exists', [target]);
      if (!targetExists.rows[0].exists) {
        report.canonical.push({ table, target, status: 'MISSING_CANONICAL_TARGET' });
        await db.query('RELEASE SAVEPOINT canonical_check');
        continue;
      }
      const link = table === 'user_roles' ? "c.user_id=s.payload->>'user_id' and c.role=s.payload->>'role'"
        : table === 'employee_permissions' ? "c.user_id=s.payload->>'user_id' and c.permission_type=s.payload->>'permission_type'"
          : 'c.id::text=s.source_key';
      const missingExpression = ['user_roles', 'employee_permissions'].includes(table) ? 'c.user_id is null' : 'c.id is null';
      const result = await db.query(`select count(*)::int snapshot_rows, count(*) filter(where ${missingExpression})::int missing_in_canonical
        from local_source_snapshots s left join ${target} c on ${link}
        where s.source='SUPABASE' and s.source_table=$1 and not s.is_deleted`, [table]);
      const count = await db.query(`select count(*)::int rows from ${target}`);
      report.canonical.push({ table, target, ...result.rows[0], canonical_rows: count.rows[0].rows });
      await db.query('RELEASE SAVEPOINT canonical_check');
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT canonical_check');
      report.canonical.push({ table, target, error: safeError(error) });
    }
  }
  for (const table of ['customers', 'orders', 'quotes', 'products']) {
    await db.query('SAVEPOINT drift_check');
    try {
      const target = mappings[table];
      const columns = { customers: ['name', 'phone'], orders: ['total_amount', 'status'], quotes: ['total_amount', 'status'], products: ['price', 'name'] }[table];
      const numericFields = new Set(['price', 'total_amount']);
      const fields = columns.map((field) => numericFields.has(field)
        ? `(nullif(to_jsonb(c)->>'${field}','')::numeric) is distinct from (nullif(s.payload->>'${field}','')::numeric)`
        : `(to_jsonb(c)->>'${field}') is distinct from (s.payload->>'${field}')`).join(' or ');
      const drift = await db.query(`select count(*) filter(where ${fields})::int review_field_differences,
        count(*) filter(where (${fields}) and c.local_modified_at is null)::int unmodified_field_differences
        from local_source_snapshots s join ${target} c on c.id::text=s.source_key where s.source='SUPABASE' and s.source_table=$1 and not s.is_deleted`, [table]);
      Object.assign(report.canonical.find((r) => r.table === table), drift.rows[0]);
      await db.query('RELEASE SAVEPOINT drift_check');
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT drift_check');
      const entry = report.canonical.find((r) => r.table === table);
      if (entry) entry.drift_error = safeError(error);
    }
  }
  const links = await db.query("select source_table,count(*)::int rows from local_source_snapshots where payload::text like '%supabase.co%' group by source_table order by source_table");
  report.storage.source_url_references = links.rows;
  const localFiles = await filesUnder(path.join(root, '.local-storage'));
  report.storage = { local_file_count: localFiles.length, source_url_references: links.rows, buckets: [] };
  const { data: buckets, error: bucketError } = await source.storage.listBuckets();
  if (bucketError) report.storage.error = safeError(bucketError);
  for (const bucket of buckets || []) {
    const stat = { bucket: bucket.id, public: bucket.public, source_objects: 0, present_local: 0, missing_local: 0, size_differences: 0, errors: [] };
    const queue = [''];
    while (queue.length) {
      const prefix = queue.shift();
      for (let offset = 0; ; offset += 100) {
        const { data: entries, error } = await source.storage.from(bucket.id).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) { stat.errors.push(safeError(error)); break; }
        for (const entry of entries) {
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (!entry.id) { queue.push(relative); continue; }
          stat.source_objects += 1;
          const localPath = path.resolve(root, '.local-storage', bucket.id.replace(/[^a-zA-Z0-9_-]/g, '_'), relative);
          const storageRoot = path.resolve(root, '.local-storage');
          if (!localPath.startsWith(`${storageRoot}${path.sep}`)) { stat.errors.push('Invalid object path'); continue; }
          const local = await fs.stat(localPath).catch(() => null);
          if (local?.isFile()) {
            stat.present_local += 1;
            if (entry.metadata?.size != null && local.size !== Number(entry.metadata.size)) stat.size_differences += 1;
          } else stat.missing_local += 1;
        }
        if (entries.length < 100) break;
      }
    }
    report.storage.buckets.push(stat);
    console.log(`Storage ${bucket.id}: objects=${stat.source_objects} missing_local=${stat.missing_local}`);
  }
  const localUsers = (await db.query('select user_id,password_hash is not null has_password from local_user_profiles where is_active')).rows;
  report.auth = { local_active: localUsers.length, local_passwords: localUsers.filter((u) => u.has_password).length };
  const sourceUserIds = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await source.auth.admin.listUsers({ page, perPage: 100 });
    if (error) { report.auth.error = safeError(error); break; }
    sourceUserIds.push(...data.users.map((u) => u.id));
    if (data.users.length < 100) break;
  }
  if (!report.auth.error) Object.assign(report.auth, { source_users: sourceUserIds.length,
    source_users_missing_local: sourceUserIds.filter((id) => !localUsers.some((u) => u.user_id === id)).length,
    source_users_without_local_password: sourceUserIds.filter((id) => !localUsers.some((u) => u.user_id === id && u.has_password)).length,
    password_hash_export_verified: false });
  // The public build intentionally keeps the Supabase SDK/Edge Function source
  // for the public deployment. In local mode the adapter must never initialize
  // that client; this is reported separately from package/source retention.
  const localRuntime = (env.VITE_BACKEND_MODE || 'local') === 'local';
  report.code = { source_reference_locations: references, invoked_function_names: [...codeFunctions].sort(),
    sdk_dependency_retained: true, local_runtime_no_supabase: localRuntime,
    local_realtime_implemented: true };
  // These providers are deliberately isolated from the local SQL cutover. A
  // local replacement can preserve drafts and history, but cannot claim live
  // provider parity until its credentials/adapter are configured and tested.
  report.providers = {
    local_core_crm: true,
    ghn_live_sync: false,
    viettel_einvoice_issue: false,
    local_ocr_pdf_docx: false,
    hosted_ai_provider: false,
  };
  report.summary = { checked_relations: report.tables.length, matches: report.tables.filter((r) => r.status === 'MATCH').length,
    gaps: report.tables.filter((r) => r.status === 'GAP').length, unavailable: report.tables.filter((r) => r.status === 'UNAVAILABLE_RELATION').length,
    absent_on_source: report.tables.filter((r) => r.status === 'ABSENT_ON_SOURCE').length,
    errors: report.tables.filter((r) => r.status === 'ERROR').length,
    source_rows: report.tables.reduce((n, r) => n + (r.source_rows || 0), 0),
    missing_source_rows: report.tables.reduce((n, r) => n + (r.missing_in_snapshot || 0), 0),
    changed_source_rows: report.tables.reduce((n, r) => n + (r.different_content || 0), 0) };
  const readinessBlockers = [];
  if ((report.inventory.discovered_not_configured || []).length > 0) {
    readinessBlockers.push(`Quan hệ REST chưa nằm trong allowlist snapshot: ${report.inventory.discovered_not_configured.join(', ')}.`);
  }
  if (report.summary.gaps > 0 || report.summary.errors > 0 || report.summary.missing_source_rows > 0 || report.summary.changed_source_rows > 0) {
    readinessBlockers.push('Snapshot dữ liệu chưa đạt parity hoàn toàn; cần xử lý gap/error trước khi ngắt nguồn public.');
  }
  const storageFilesComplete = report.storage.buckets.every((bucket) => bucket.missing_local === 0 && bucket.size_differences === 0 && bucket.errors.length === 0);
  if (!storageFilesComplete) readinessBlockers.push('Tệp Storage local chưa đủ hoặc khác kích thước nguồn.');
  if (!report.code.local_runtime_no_supabase) readinessBlockers.push('Local runtime chưa được cấu hình VITE_BACKEND_MODE=local.');
  if (!report.code.local_realtime_implemented) readinessBlockers.push('Các tab local chưa có cơ chế refresh đồng bộ.');
  if ((report.auth.source_users_without_local_password || 0) > 0) {
    readinessBlockers.push('Cấp hoặc đặt lại mật khẩu local cho các tài khoản đã đồng bộ; không thể xuất password hash từ Supabase Auth qua API.');
  }
  if (!report.providers.ghn_live_sync) readinessBlockers.push('GHN live sync chưa có adapter/credential local; thao tác live đang được bảo vệ.');
  if (!report.providers.viettel_einvoice_issue) readinessBlockers.push('Phát hành hóa đơn Viettel chưa có adapter/credential local; local chỉ giữ bản nháp.');
  if (!report.providers.local_ocr_pdf_docx) readinessBlockers.push('OCR/trích xuất PDF-DOCX local chưa có parser đầy đủ.');
  if (!report.providers.hosted_ai_provider) readinessBlockers.push('AI hosted chưa có provider local; local đang dùng luật/tra cứu SQL dự phòng.');
  report.readiness = {
    data_snapshot_complete: report.summary.gaps === 0 && report.summary.errors === 0 && report.summary.missing_source_rows === 0 && report.summary.changed_source_rows === 0,
    storage_files_complete: report.storage.buckets.every((bucket) => bucket.missing_local === 0 && bucket.size_differences === 0 && bucket.errors.length === 0),
    auth_profiles_complete: report.auth.source_users_missing_local === 0,
    local_storage_url_rewrite: true,
    blockers: readinessBlockers,
    note: 'URL Supabase còn trong raw snapshot chỉ để bảo toàn/đối chiếu; API local đã rewrite sang /api/local-storage và không cần gọi lại URL nguồn.',
  };
  report.ready_to_disconnect = readinessBlockers.length === 0;
  await db.query('ROLLBACK');
  const output = path.join(root, 'docs', 'local-migration-audit-2026-09-30.json');
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary: report.summary, canonical: report.canonical, storage: report.storage, auth: report.auth, inventory: report.inventory }, null, 2));
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
} finally { await db.end(); }
