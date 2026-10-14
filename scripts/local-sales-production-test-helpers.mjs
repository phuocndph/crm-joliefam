import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const base = String(process.env.LOCAL_API_URL || "").replace(/\/$/, "");
const databaseUrl = String(process.env.LOCAL_DATABASE_URL || "");
assert(process.env.LOCAL_DISPATCH_TEST_ISOLATED === "1" && process.env.LOCAL_TEST_ISOLATED === "1", "Require the dedicated isolated test harness.");
assert(base && databaseUrl, "No shared API/database fallback is permitted.");
const apiUrl = new URL(base), dbUrl = new URL(databaseUrl);
const hosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const databaseName = decodeURIComponent(dbUrl.pathname.slice(1));
assert(hosts.has(apiUrl.hostname) && apiUrl.port && !["8787", "8788", "8090", "8091"].includes(apiUrl.port), "Require a dedicated ephemeral loopback API.");
assert(hosts.has(dbUrl.hostname) && /^crm_local_test_dispatch_\d+$/.test(databaseName), "Refusing writes outside the harness-owned test database.");
assert.equal(process.env.LOCAL_SYNC_AUTO, "false");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
export const token = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
export const key = (label) => `sales-flow-${token}-${label}`;
let checks = 0;
export const checkCount = () => checks;
export const close = () => pool.end();
export const unwrap = (payload, name) => payload[name] ?? payload;
const now = new Date();
const fixtureMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const date = (day) => `${fixtureMonth.getFullYear()}-${String(fixtureMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
export const dates = { start: date(1), first: date(10), second: date(11), end: date(new Date(fixtureMonth.getFullYear(), fixtureMonth.getMonth() + 1, 0).getDate()) };

export async function isolated() {
  const response = await fetch(`${base}/health`);
  const health = await response.json();
  assert(response.ok && health.ok && health.database === databaseName, "API database identity differs; refusing fixture writes.");
}
export async function sql(statement, parameters = []) {
  await isolated();
  const actual = await pool.query("select current_database() database");
  assert.equal(actual.rows[0].database, databaseName);
  return pool.query(statement, parameters);
}
export async function refreshOwnedProjections() {
  await isolated();
  assert.equal((await pool.query("select current_database() database")).rows[0].database, databaseName);
  const { refreshCanonicalProjections } = await import("./sync-supabase-to-local.mjs");
  assert.equal(typeof refreshCanonicalProjections, "function", "Local-only sync projection boundary must be exported without starting remote sync.");
  await refreshCanonicalProjections(pool);
}
export async function ownedRollback(handler) {
  await isolated();
  const client = await pool.connect();
  try {
    assert.equal((await client.query("select current_database() database")).rows[0].database, databaseName);
    await client.query("begin");
    return await handler(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}
export async function api(method, path, body, session) {
  await isolated();
  const response = await fetch(`${base}${path}`, {
    method, headers: { origin: "http://127.0.0.1:8090", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(session ? { authorization: `Bearer ${session}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  checks++;
  return { ok: response.ok, status: response.status, payload };
}
export async function must(method, path, body, session) {
  const result = await api(method, path, body, session);
  assert(result.ok, `${method} ${path}: HTTP ${result.status}: ${String(result.payload.message || "Unexpected failure")}`);
  return result.payload;
}
export async function denied(method, path, body, session, statuses = [400, 403, 404, 409, 422]) {
  const result = await api(method, path, body, session);
  const safeJson = (value) => JSON.stringify(value, (name, item) => /password|token|authorization|secret/i.test(name) ? "[REDACTED]" : item);
  assert(statuses.includes(result.status), `${method} ${path}: expected refusal, got ${result.status}; body=${safeJson(body)}; response=${safeJson(result.payload)}`);
  return result;
}
export async function actor(admin, suffix, role, workerType, permissions = []) {
  // A retained QA run uses reproducible logins for freshly created disposable
  // local.test accounts. Never include passwords or session tokens in metadata.
  const password = process.env.LOCAL_DISPATCH_QA_MANIFEST ? `Isolated-flow-qa-${token}!` : `Isolated-flow-${randomUUID()}!`;
  const user = await must("POST", "/api/users", { email: `flow.${token}.${suffix}@local.test`, password, first_name: "Workflow", last_name: suffix, role }, admin);
  const worker = await must("POST", "/api/workers", { employee_code: `FLOW-${token}-${suffix}`, display_name: `Workflow ${suffix}`, worker_type: workerType }, admin);
  await must("PATCH", `/api/users/${user.user_id}/worker-link`, { worker_id: worker.id, reason: "Isolated full workflow actor" }, admin);
  if (permissions.length) await sql("insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason) select $1,p,true,'local-admin','Isolated workflow fixture' from unnest($2::text[]) p", [user.user_id, permissions]);
  const session = await must("POST", "/api/local-auth/login", { email: user.email, password });
  assert(session.token);
  return { user, worker, session: session.token };
}
export async function profiles(workers) {
  await sql("update local_workers set payroll_status='SUSPENDED' where not(id=any($1::uuid[]))", [workers.map((w) => w.id)]);
  const group = (await sql("insert into local_payroll_policy_groups(code,name) values($1,'Isolated sales production workflow') returning id", [`FLOW-${token}`])).rows[0];
  for (const worker of workers) {
    await sql("insert into local_worker_compensation_assignments(worker_id,compensation_type,payroll_policy_group_id,effective_from,status,reason,approved_by) values($1,'PIECE_RATE',$2,$3,'APPROVED','Isolated workflow fixture','local-admin')", [worker.id, group.id, dates.start]);
    await sql("insert into local_worker_payroll_profiles(worker_id,piece_output_enabled,effective_from,status,reason,idempotency_key,request_hash,approved_by) values($1,true,$2,'APPROVED','Isolated workflow fixture',$3,$3,'local-admin')", [worker.id, dates.start, key(`profile-${worker.id}`)]);
  }
}
export async function manufacturing(productId, session, options = {}) {
  const profile = await must("PUT", `/api/manufacturing/products/${productId}/profile`, { manufacturing_type: "GENERIC_SEWN_PRODUCT", finished_width: 40, finished_length: 60, dimension_unit: "CM", ...options.profile }, session);
  let cutting;
  if (options.cutting) {
    cutting = await must("POST", "/api/manufacturing/cutting-profiles/drafts", { product_id: productId, code: `CUT-${productId.slice(0, 8)}`, name: "API-created cutting standard", configuration: options.cutting }, session);
    await must("PUT", `/api/manufacturing/cutting-versions/${cutting.version.id}`, { configuration: { ...options.cutting, effective_from: dates.start } }, session);
    await must("POST", `/api/manufacturing/cutting-versions/${cutting.version.id}/approve`, { reason: "Isolated API standard approval" }, session);
  }
  const bom = await must("POST", "/api/manufacturing/bom/drafts", { product_id: productId, code: `BOM-${productId.slice(0, 8)}`, name: "API-created material standard" }, session);
  const lines = (options.lines || []).map((line) => ({ ...line, ...(line.quantity_method === "CUTTING_ENGINE" ? { cutting_profile_id: cutting.profile.id } : {}) }));
  await must("PUT", `/api/manufacturing/bom/versions/${bom.version.id}`, { effective_from: dates.start, lines }, session);
  await must("POST", `/api/manufacturing/bom/versions/${bom.version.id}/approve`, { reason: "Isolated API BOM approval" }, session);
  const routing = await must("POST", "/api/manufacturing/routing/drafts", { product_id: productId, code: `ROUTE-${productId.slice(0, 8)}`, name: "API-created routing" }, session);
  await must("PUT", `/api/manufacturing/routing/versions/${routing.version.id}`, { effective_from: dates.start, operations: [{ sequence: 1, operation_code: "SEWING", operation_name: "May workflow", standard_minutes_per_unit: 1, is_optional: true }] }, session);
  await must("POST", `/api/manufacturing/routing/versions/${routing.version.id}/approve`, { reason: "Isolated API routing approval" }, session);
  return { profile, cutting, bom, routing };
}

function checkpointPath() {
  const value = String(process.env.LOCAL_DISPATCH_RESTART_CHECKPOINT || "");
  const project = resolve(fileURLToPath(new URL("../", import.meta.url)));
  assert(value && dirname(resolve(value)) === project && basename(value) === `.isolated-dispatch-${databaseName.replace("crm_local_test_dispatch_", "")}.restart.json`, "Checkpoint path must match the owned harness/database.");
  return resolve(value);
}
export async function snapshots(orderIds) {
  const values = [orderIds];
  return {
    orders: (await sql("select to_jsonb(o) row from local_production_orders o where id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    items: (await sql("select to_jsonb(i) row from local_production_order_items i where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    materialRequirements: (await sql("select to_jsonb(m) row from local_production_order_material_requirements m where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    operations: (await sql("select to_jsonb(o) row from local_production_order_operations o where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    batches: (await sql("select to_jsonb(b) row from local_production_batches b where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    reports: (await sql("select to_jsonb(e) row from local_production_stage_events e where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    allocations: (await sql("select to_jsonb(a) row from local_production_sales_allocations a where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    requests: (await sql("select to_jsonb(r) row from local_production_sales_requests r where id in (select sales_request_id from local_production_orders where id=any($1::uuid[])) order by id", values)).rows.map((r) => r.row),
    requestLines: (await sql("select to_jsonb(l) row from local_production_sales_request_lines l where request_id in (select sales_request_id from local_production_orders where id=any($1::uuid[])) order by id", values)).rows.map((r) => r.row),
    estimates: (await sql("select to_jsonb(e) row from local_cutting_estimates e where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    estimateLines: (await sql("select to_jsonb(l) row from local_cutting_estimate_lines l where estimate_id in (select id from local_cutting_estimates where production_order_id=any($1::uuid[])) order by id", values)).rows.map((r) => r.row),
    inventoryDocuments: (await sql("select to_jsonb(d) row from local_inventory_documents d where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    inventoryMovements: (await sql("select to_jsonb(m) row from local_inventory_movements m where cutting_estimate_line_id in (select l.id from local_cutting_estimate_lines l join local_cutting_estimates e on e.id=l.estimate_id where e.production_order_id=any($1::uuid[])) order by id", values)).rows.map((r) => r.row),
    publications: (await sql("select to_jsonb(p) row from local_production_job_publications p where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    assignments: (await sql("select to_jsonb(a) row from local_assignments a where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
    earnings: (await sql("select to_jsonb(p) row from local_production_entries p where id in (select production_entry_id from local_production_stage_events where production_order_id=any($1::uuid[])) order by id", values)).rows.map((r) => r.row),
    payrollItems: (await sql("select to_jsonb(i) row from local_payroll_items i where source_type='PRODUCTION_ENTRY' and source_id in (select production_entry_id from local_production_stage_events where production_order_id=any($1::uuid[])) order by id", values)).rows.map((r) => r.row),
    outputs: (await sql("select to_jsonb(o) row from local_production_outputs o where production_order_id=any($1::uuid[]) order by id", values)).rows.map((r) => r.row),
  };
}
export async function checkpoint(orderIds) {
  await writeFile(checkpointPath(), JSON.stringify({ database: databaseName, orderIds, snapshots: await snapshots(orderIds) }), { flag: "wx" });
}
export async function qaMetadata(fixture, details) {
  const value = String(process.env.LOCAL_DISPATCH_QA_MANIFEST || "");
  if (!value) return;
  const project = resolve(fileURLToPath(new URL("../", import.meta.url)));
  assert(dirname(resolve(value)) === project && basename(value) === `.isolated-dispatch-${databaseName.replace("crm_local_test_dispatch_", "")}.qa.json`, "QA metadata must belong to the owned harness/database.");
  const rootPid = Number(process.env.LOCAL_DISPATCH_QA_API_PID);
  assert(Number.isInteger(rootPid) && rootPid > 0);
  await writeFile(resolve(value), JSON.stringify({
    database: databaseName, apiUrl: base, apiPort: Number(apiUrl.port), apiRootPid: rootPid,
    fixtureKey: token, suite: "sales-production", ...details,
    accounts: Object.fromEntries(["sale", "manager", "cutter", "sewer", "sewerB"].map((name) => [name, { email: fixture[name].user.email, workerId: fixture[name].worker.id }])),
  }, null, 2), { flag: "wx" });
}
export async function verifyRestart() {
  const saved = JSON.parse(await readFile(checkpointPath(), "utf8"));
  assert.equal(saved.database, databaseName);
  assert.deepEqual(await snapshots(saved.orderIds), saved.snapshots, "API restart changed sales source, batch plan, report or production snapshots.");
  if (process.env.LOCAL_DISPATCH_QA_MANIFEST) {
    const qaPath = checkpointPath().replace(/\.restart\.json$/, ".qa.json");
    assert.equal(resolve(process.env.LOCAL_DISPATCH_QA_MANIFEST), qaPath);
    const metadata = JSON.parse(await readFile(qaPath, "utf8"));
    assert.equal(metadata.suite, "sales-production");
    assert.equal(metadata.database, databaseName);
    const restartedPid = Number(process.env.LOCAL_DISPATCH_QA_API_PID);
    assert(Number.isInteger(restartedPid) && restartedPid > 0);
    await writeFile(qaPath, JSON.stringify({ ...metadata, apiRootPid: restartedPid }, null, 2));
  }
  console.log(`PASS sales production restart: ${saved.orderIds.length} orders; ${Object.keys(saved.snapshots).length} collections preserve Sale reservations, frozen standards/operations, allocations, estimates, authoritative inventory, open jobs, reports, wage entries, payroll items and finished-output snapshots.`);
}
