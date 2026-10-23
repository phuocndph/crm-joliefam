import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { approveLegacyPayrollFixture } from './payroll-approved-fixtures.mjs';

const base = String(process.env.LOCAL_API_URL || "").replace(/\/$/, "");
const databaseUrl = String(process.env.LOCAL_DATABASE_URL || "");
if (process.env.LOCAL_DISPATCH_TEST_ISOLATED !== "1") {
  throw new Error("Dispatch writes require LOCAL_DISPATCH_TEST_ISOLATED=1 and a dedicated local test database/API.");
}
if (!base || !databaseUrl) throw new Error("Isolated API/database URLs are required; there is no shared-runtime fallback.");
const apiUrl = new URL(base);
const dbUrl = new URL(databaseUrl);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const databaseName = decodeURIComponent(dbUrl.pathname.slice(1));
assert(loopbackHosts.has(apiUrl.hostname) && apiUrl.port && !["8787", "8788", "8090", "8091"].includes(apiUrl.port), "Use a dedicated ephemeral loopback API.");
assert(loopbackHosts.has(dbUrl.hostname) && /^crm_local_test_dispatch_\d+$/.test(databaseName), "Use only the dispatch harness's dedicated test database.");
assert.equal(process.env.LOCAL_SYNC_AUTO, "false", "Disable automatic external sync in the isolated test API.");

const origin = "http://127.0.0.1:8090";
const token = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const key = (name) => `dispatch-${token}-${name}`;
const database = new pg.Pool({ connectionString: databaseUrl, max: 4 });
let checks = 0;
const restartOrderIds = [];
let fixtureAdminSession;

async function assertIsolated() {
  const response = await fetch(`${base}/health`);
  const health = await response.json();
  assert(response.ok && health.ok && health.database === databaseName, "API targets a different database; refusing test writes.");
}

async function sql(text, values = []) {
  await assertIsolated();
  const actual = await database.query("select current_database() database");
  assert.equal(actual.rows[0].database, databaseName, "SQL targets a different database; refusing fixture writes.");
  return database.query(text, values);
}

async function api(method, path, body, session) {
  await assertIsolated();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(session ? { authorization: `Bearer ${session}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  checks += 1;
  return { ok: response.ok, status: response.status, payload };
}

async function must(method, path, body, session) {
  const result = await api(method, path, body, session);
  assert(result.ok, `${method} ${path}: HTTP ${result.status}: ${String(result.payload.message || "Unexpected failure")}`);
  return result.payload;
}

async function denied(method, path, body, session, statuses = [400, 403, 404, 409, 422]) {
  const result = await api(method, path, body, session);
  assert(statuses.includes(result.status), `${method} ${path}: expected refusal, got ${result.status}`);
  return result;
}

const unwrap = (payload, field) => payload[field] ?? payload;
const dateFor = (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const now = new Date();
const fixtureMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const firstDate = dateFor(fixtureMonth.getFullYear(), fixtureMonth.getMonth() + 1, 10);
const secondDate = dateFor(fixtureMonth.getFullYear(), fixtureMonth.getMonth() + 1, 11);
const periodStart = dateFor(fixtureMonth.getFullYear(), fixtureMonth.getMonth() + 1, 1);
const periodEnd = dateFor(fixtureMonth.getFullYear(), fixtureMonth.getMonth() + 1, new Date(fixtureMonth.getFullYear(), fixtureMonth.getMonth() + 1, 0).getDate());

async function createActor(admin, suffix, role, grantPermissions = true) {
  const password = `Dispatch-fixture-${randomUUID()}!`;
  const user = await must("POST", "/api/users", { email: `dispatch.${token}.${suffix}@local.test`, password, first_name: "Dispatch", last_name: suffix, role }, admin);
  const worker = await must("POST", "/api/workers", { employee_code: `DISPATCH-${token}-${suffix}`, display_name: `Dispatch ${suffix}`, worker_type: "SEWING" }, admin);
  await sql("update local_workers set user_id=$2 where id=$1", [worker.id, user.user_id]);
  if (grantPermissions) await sql(`insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason)
    select $1,permission,true,'local-admin','Isolated dispatch fixture' from unnest($2::text[]) permission`,
  [user.user_id, role === "manager" ? ["production_view", "production_operations", "production_manage", "production_release", "production_complete", "production_attendance_approve"] : ["production_view", "production_operations"]]);
  const session = await must("POST", "/api/local-auth/login", { email: user.email, password });
  assert(session.token, "Fixture login did not return a session.");
  return { user, worker, session: session.token, password };
}

async function seedPayrollProfiles(workerIds, suffix = "") {
  const group = await sql("insert into local_payroll_policy_groups(code,name) values($1,'Dispatch integration fixture') returning id", [`DISPATCH-${token}${suffix}`]);
  for (const workerId of workerIds) {
    await sql(`insert into local_worker_compensation_assignments(worker_id,compensation_type,payroll_policy_group_id,effective_from,status,reason,approved_by)
      values($1,'PIECE_RATE',$2,$3,'APPROVED','Isolated dispatch fixture','local-admin')`, [workerId, group.rows[0].id, periodStart]);
    await sql(`insert into local_worker_payroll_profiles(worker_id,piece_output_enabled,effective_from,status,reason,idempotency_key,request_hash,approved_by)
      values($1,true,$2,'APPROVED','Isolated dispatch fixture',$3,$3,'local-admin')`, [workerId, periodStart, key(`profile-${workerId}`)]);
  }
}

async function createReleasedOrder(admin, productId, quantity, suffix, historicalCompletion = true) {
  const group = await must("POST", "/api/production-orders/groups", { source_type: "MANUAL", order_id: null, notes: suffix, idempotency_key: key(`create-${suffix}`), lines: [{ product_id: productId, quantity }] }, admin);
  const order = group.orders[0];
  // This two-stage dispatch suite is historical V2 regression coverage. Verify
  // the API still creates V3, then explicitly seed historical metadata through
  // isolated SQL; the workspace suite exercises canonical V3 end to end.
  assert.equal((await sql("select workflow_generation from local_production_orders where id=$1", [order.id])).rows[0].workflow_generation, "WORKFLOW_V3");
  if (historicalCompletion) await sql("update local_production_orders set workflow_generation='WORKFLOW_V2' where id=$1", [order.id]);
  await must("POST", `/api/production-orders/${order.id}/release`, { idempotency_key: key(`release-${suffix}`) }, admin);
  const batches = await must("GET", `/api/production-orders/${order.id}/batches`, undefined, admin);
  assert.equal(batches.length, 1, "Released order should have one default batch.");
  await permitFixtureCutting(admin, order, batches[0]);
  return { order, batch: batches[0] };
}

async function permitFixtureCutting(session, order, batch) {
  const alreadyApproved = (await sql("select 1 from local_cutting_estimates where production_order_id=$1 and production_batch_id=$2 and status='APPROVED'", [order.id, batch.id])).rows[0];
  if (alreadyApproved) return;
  const estimate = await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, { production_batch_id: batch.id, no_material_required: true, reason: "Approved fixture BOM contains no materials; dispatch-only regression", lines: [], idempotency_key: key(`no-material-${batch.id}`) }, session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/submit`, { idempotency_key: key(`no-material-submit-${batch.id}`) }, session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/review`, { target_status: "APPROVED", reason: "Checked approved empty fixture BOM", idempotency_key: key(`no-material-approve-${batch.id}`) }, fixtureAdminSession);
}

const dispatch = "/api/production-dispatch";
const assignmentPath = (id, action) => `${dispatch}/assignments/${id}/${action}`;
const reportPath = (id, action) => `${dispatch}/reports/${id}/${action}`;

async function assign(session, order, batch, workerId, stage, quantity, suffix, extra = {}) {
  // Historical quota scenarios exercise both stages with the same synthetic
  // actor. Fixed worker-type eligibility is covered by the sales-flow suite.
  await sql("update local_workers set worker_type=$2 where id=$1", [workerId, stage === "CUTTING" ? "CUTTER" : "SEWING"]);
  if (stage === "CUTTING") await permitFixtureCutting(session, order, batch);
  const body = { production_order_id: order.id, production_batch_id: batch.id, worker_id: workerId, stage, quantity, assigned_from: periodStart, notes: "Isolated dispatch integration", idempotency_key: key(suffix), ...extra };
  const payload = await must("POST", `${dispatch}/assignments`, body, session);
  const row = unwrap(payload, "assignment");
  assert(row.id, "Assignment response needs an ID.");
  return { row, body };
}

async function accept(session, id, quantity, suffix, reason = "Isolated receipt") {
  const body = { quantity, reason, idempotency_key: key(suffix) };
  await must("POST", assignmentPath(id, "accept"), body, session);
  return body;
}

async function report(session, id, quantity, suffix, workDate = firstDate, extra = {}) {
  const body = { work_date: workDate, quantity_good: quantity, notes: "Isolated incremental report", idempotency_key: key(suffix), ...extra };
  const payload = await must("POST", assignmentPath(id, "reports"), body, session);
  const row = unwrap(payload, "report");
  assert(row.id, "Report response needs an ID.");
  return { row, body };
}

async function review(session, id, target, suffix) {
  const body = { target_status: target, reason: "Isolated report review", idempotency_key: key(suffix) };
  await must("POST", reportPath(id, "review"), body, session);
  return body;
}

async function seedManufacturing(productId) {
  const session = fixtureAdminSession;
  const bom = await must("POST", "/api/manufacturing/bom/drafts", { product_id: productId, code: `DISPATCH-BOM-${token}`, name: "Dispatch fixture without materials" }, session);
  await must("PUT", `/api/manufacturing/bom/versions/${bom.version.id}`, { effective_from: periodStart, lines: [] }, session);
  await must("POST", `/api/manufacturing/bom/versions/${bom.version.id}/approve`, { reason: "Approved no-material dispatch fixture" }, session);
  const routing = await must("POST", "/api/manufacturing/routing/drafts", { product_id: productId, code: `DISPATCH-ROUTE-${token}`, name: "Dispatch sewing fixture" }, session);
  await must("PUT", `/api/manufacturing/routing/versions/${routing.version.id}`, { effective_from: periodStart, operations: [{ sequence: 1, operation_code: "SEWING", operation_name: "May test", standard_minutes_per_unit: 1 }] }, session);
  await must("POST", `/api/manufacturing/routing/versions/${routing.version.id}/approve`, { reason: "Approved dispatch routing fixture" }, session);
}

async function assertCloseBlocked(session, fixture, suffix) {
  const { order, batch } = fixture;
  for (const [path, body] of [
    [`/api/production-orders/${order.id}/complete`, { quantity_good: 0, idempotency_key: key(`${suffix}-complete`) }],
    [`/api/production-orders/${order.id}/transition`, { target_status: "COMPLETED" }],
    [`/api/production-orders/${order.id}/transition`, { target_status: "CANCELLED", reason: "Must settle work first" }],
    [`/api/legacy-production-orders/${order.id}/status`, { target_status: "COMPLETED" }],
    [`/api/legacy-production-orders/${order.id}/status`, { target_status: "CANCELLED", reason: "Must settle work first" }],
    [`/api/legacy-production-orders/${order.id}/complete`, { quantity_good: 0 }],
    [`/api/production-batches/${batch.id}/status`, { target_status: "COMPLETED" }],
    [`/api/production-batches/${batch.id}/status`, { target_status: "CANCELLED", reason: "Must settle batch work first" }],
  ]) await denied("POST", path, body, session);
  const row = (await sql("select status from local_production_orders where id=$1", [order.id])).rows[0];
  assert(["RELEASED", "IN_PROGRESS"].includes(row.status), "Failed close partly changed the order.");
}

async function assertNoClosedObligations(orderId) {
  const result = await sql(`select o.status,
    exists(select 1 from local_assignments a where a.production_order_id=o.id and a.dispatch_stage is not null and
      (a.dispatch_status='PENDING' or (a.dispatch_status='ACCEPTED' and coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity>
        coalesce((select sum(e.quantity_received) from local_production_stage_events e where e.assignment_id=a.id and e.status in ('SUBMITTED','APPROVED','LOCKED')),0))
        or exists(select 1 from local_production_stage_events e where e.assignment_id=a.id and e.status='SUBMITTED'))) obligations
    from local_production_orders o where o.id=$1`, [orderId]);
  assert(!(result.rows[0].obligations && ["COMPLETED", "CANCELLED"].includes(result.rows[0].status)), "Concurrent close left a closed order with active dispatch obligations.");
}

async function assertCompletionQuantityValidation(session, productId) {
  const zero = await createReleasedOrder(session, productId, 1, "ZERO-COMPLETION", true);
  const zeroBody = { quantity_good: 0, quantity_scrap: 0, idempotency_key: key("zero-completion") };
  await denied("POST", `/api/production-orders/${zero.order.id}/complete`, zeroBody, session, [400]);
  // The legacy URL is an alias rewritten through the modern completion
  // handler, so it must enforce the same non-zero total invariant.
  await denied("POST", `/api/legacy-production-orders/${zero.order.id}/complete`, zeroBody, session, [400]);
  assert.notEqual((await sql("select status from local_production_orders where id=$1", [zero.order.id])).rows[0].status, "COMPLETED", "A zero/zero completion changed the order state.");

  const allScrap = await createReleasedOrder(session, productId, 1, "ALL-SCRAP-COMPLETION", true);
  // A missing/zero routing standard only removes the efficiency metric; it
  // is not a prerequisite for an otherwise valid completion.
  await sql("update local_production_orders set standard_minutes_total=0 where id=$1", [allScrap.order.id]);
  await sql("update local_production_order_operations set standard_total_minutes=0 where production_order_id=$1", [allScrap.order.id]);
  const allScrapBody = { quantity_good: 0, quantity_scrap: 1, idempotency_key: key("all-scrap-completion") };
  const completed = await must("POST", `/api/production-orders/${allScrap.order.id}/complete`, allScrapBody, session);
  assert.equal(completed.status, "COMPLETED", "A valid all-scrap completion was rejected.");
  const replay = await must("POST", `/api/production-orders/${allScrap.order.id}/complete`, allScrapBody, session);
  assert.equal(replay.output.id, completed.output.id, "All-scrap completion retry created a second output.");
}

async function extendedWorkflow(admin, manager, employee, other, product, pieceCode) {
  // Role defaults must work without fixture-only manual grants.
  const defaultManager = await createActor(admin, "DEFAULT-MANAGER", "manager", false);
  const leader = await createActor(admin, "LEADER", "team_leader");
  await seedPayrollProfiles([defaultManager.worker.id, leader.worker.id], "-EXT");
  await sql("insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason) values($1,'production_attendance_approve',true,'local-admin','Isolated leader maker test')", [leader.user.user_id]);
  await sql("insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,reason,created_by) values($1,$2,$3,'Isolated leader maker test','local-admin')", [leader.worker.id, employee.worker.id, periodStart]);
  assert.equal((await sql("select count(*)::int count from local_employee_permissions where user_id=$1", [defaultManager.user.user_id])).rows[0].count, 0);
  for (const actor of [leader, defaultManager]) {
    const rates = await must("GET", `${dispatch}/rates?date=${firstDate}`, undefined, actor.session);
    assert(rates.some((row) => row.piece_rate_code === pieceCode), "Permitted dispatch reader lost the work-code picker.");
    assert(rates.every((row) => !["rate", "rate_amount", "amount", "amount_precise", "calculated_amount"].some((field) => Object.hasOwn(row, field))), "Work-code picker exposed pay amounts without payroll_rate_view.");
  }
  await denied("GET", `${dispatch}/rates?date=${firstDate}`, undefined, employee.session, [403]);
  const defaultManagerDraft = await must("POST", "/api/production-orders", { product_id: product.id, quantity: 1, source_type: "MANUAL", idempotency_key: key("default-manager-single-draft") }, defaultManager.session);
  assert.equal(defaultManagerDraft.status, "DRAFT", "Default manager cannot create a single manual production draft.");
  const fixture = await createReleasedOrder(defaultManager.session, product.id, 10, "CLOSE-STATES", true);
  await must("GET", `${dispatch}?orderId=${fixture.order.id}`, undefined, defaultManager.session);

  const groupBody = { order_id: null, source_type: "MANUAL", notes: "Group-level instructions", lines: [{ product_id: product.id, quantity: 3 }] };
  for (const [path, body] of [
    ["/api/production-orders", { product_id: product.id, quantity: 1 }],
    ["/api/production-orders/groups", { ...groupBody, idempotency_key: key("employee-group") }],
    ["/api/legacy-production-orders", { product_id: product.id, quantity: 1 }],
    ["/api/legacy-production-orders/group", { ...groupBody, idempotency_key: key("employee-legacy-group") }],
    [`/api/legacy-production-orders/${fixture.order.id}/release`, {}],
    [`/api/legacy-production-orders/${fixture.order.id}/status`, { target_status: "COMPLETED" }],
    [`/api/legacy-production-orders/${fixture.order.id}/complete`, { quantity_good: 0 }],
    [`/api/production-orders/${fixture.order.id}/release`, {}],
    [`/api/production-orders/${fixture.order.id}/transition`, { target_status: "COMPLETED" }],
    [`/api/production-orders/${fixture.order.id}/complete`, { quantity_good: 0 }],
  ]) await denied("POST", path, body, employee.session, [403]);

  // A manual multi-line group retains metadata, actor and batch/item identity.
  const fabricId = randomUUID();
  await sql("insert into local_fabric_variants(id,variant_name,color,unit,is_snapshot_record) values($1,'Dispatch fixture fabric','Blue','m',false)", [fabricId]);
  const manualBody = { ...groupBody, idempotency_key: key("manual-group"), lines: [
    { product_id: product.id, quantity: 3, fabric_variant_id: fabricId, color: "Blue", size: "M", dimensions: "40 × 60", notes: "Line-specific cutting instructions", source_order_item_key: null },
    { product_id: product.id, quantity: 2, fabric_variant_id: fabricId, color: "Red", size: "L", dimensions: "50 × 70", notes: "Second line instructions" },
  ] };
  const manual = await must("POST", "/api/production-orders/groups", manualBody, defaultManager.session);
  assert.equal(manual.order_count, 2, "Manual group failed to create both lines.");
  const replay = await must("POST", "/api/production-orders/groups", manualBody, defaultManager.session);
  assert.equal(replay.group_id, manual.group_id, "Manual group replay created new orders.");
  const stored = (await sql(`select o.id,o.order_id,o.source_type,o.created_by,i.id item_id,i.fabric_variant_id,i.color,i.size,i.dimensions,i.notes,
    (select count(*)::int from local_production_batches b where b.production_order_id=o.id) batch_count
    from local_production_orders o join local_production_order_items i on i.production_order_id=o.id
    where o.production_order_group_id=$1 order by o.created_at,o.id`, [manual.group_id])).rows;
  assert.equal(stored.length, 2);
  restartOrderIds.push(...stored.map((row) => row.id));
  assert(stored.every((row) => row.order_id === null && row.source_type === "MANUAL" && row.created_by === defaultManager.user.user_id && row.batch_count === 1), "Manual group lost null source/default batch/actor.");
  for (const line of manualBody.lines) {
    const item = stored.find((row) => row.color === line.color);
    assert(item && item.fabric_variant_id === line.fabric_variant_id && item.size === line.size && item.dimensions === line.dimensions && item.notes === line.notes, "Manual group lost fabric/color/size/dimensions/line notes.");
    assert(manual.orders.some((row) => row.id === item.id && row.order_item_id === item.item_id), "Manual group returned order ID in place of item ID.");
  }
  const beforeBad = (await sql("select count(*)::int count from local_production_orders")).rows[0].count;
  await denied("POST", "/api/production-orders/groups", { ...manualBody, idempotency_key: key("invalid-group-atomic"), lines: [manualBody.lines[0], { product_id: randomUUID(), quantity: 1 }] }, defaultManager.session);
  assert.equal((await sql("select count(*)::int count from local_production_orders")).rows[0].count, beforeBad, "Invalid group partially created its first line.");

  const allocated = await assign(defaultManager.session, fixture.order, fixture.batch, employee.worker.id, "CUTTING", 10, "close-pending");
  await assertCloseBlocked(defaultManager.session, fixture, "pending-assignment");
  await must("POST", `/api/production-orders/${fixture.order.id}/transition`, { target_status: "ON_HOLD", reason: "Temporarily paused" }, defaultManager.session);
  await denied("POST", assignmentPath(allocated.row.id, "accept"), { quantity: 10, idempotency_key: key("hold-accept") }, employee.session);
  await must("POST", `/api/production-orders/${fixture.order.id}/transition`, { target_status: "IN_PROGRESS", reason: "Resume" }, defaultManager.session);
  await accept(employee.session, allocated.row.id, 10, "close-accepted");
  await assertCloseBlocked(defaultManager.session, fixture, "accepted-outstanding");
  const pending = await report(employee.session, allocated.row.id, 10, "close-pending-report");
  await assertCloseBlocked(defaultManager.session, fixture, "pending-report");
  await must("POST", `/api/legacy-production-orders/${fixture.order.id}/status`, { target_status: "ON_HOLD", reason: "Pause pending review" }, defaultManager.session);
  await denied("POST", reportPath(pending.row.id, "review"), { target_status: "APPROVED", idempotency_key: key("hold-review") }, defaultManager.session);
  await must("POST", `/api/legacy-production-orders/${fixture.order.id}/status`, { target_status: "IN_PROGRESS", reason: "Review can continue after pause" }, defaultManager.session);
  await review(defaultManager.session, pending.row.id, "APPROVED", "close-settled");
  // This explicitly historical fixture retains the V2 sewing requirement;
  // V3 four-stage receipt closure is exercised by the workspace suite.
  const closeSewing = await assign(defaultManager.session, fixture.order, fixture.batch, other.worker.id, "SEWING", 10, "close-sewing", { piece_rate_code: pieceCode });
  await accept(other.session, closeSewing.row.id, 10, "close-sewing-accept");
  const closeSewingReport = await report(other.session, closeSewing.row.id, 10, "close-sewing-report");
  await review(defaultManager.session, closeSewingReport.row.id, "APPROVED", "close-sewing-approved");
  await must("POST", `/api/production-orders/${fixture.order.id}/complete`, { quantity_good: 10, idempotency_key: key("settled-close") }, defaultManager.session);
  await assertNoClosedObligations(fixture.order.id);

  // Closing and dispatch allocation must share the same locked parent.
  for (let i = 0; i < 4; i += 1) {
    const concurrent = await createReleasedOrder(defaultManager.session, product.id, 1, `CLOSE-RACE-${i}`, true);
    const results = await Promise.all([
      api("POST", `/api/production-orders/${concurrent.order.id}/complete`, { quantity_good: 0, idempotency_key: key(`race-close-${i}`) }, defaultManager.session),
      api("POST", `${dispatch}/assignments`, { production_order_id: concurrent.order.id, production_batch_id: concurrent.batch.id, worker_id: employee.worker.id, stage: "CUTTING", quantity: 1, assigned_from: periodStart, idempotency_key: key(`race-allocate-${i}`) }, defaultManager.session),
    ]);
    assert(results.some((r) => r.ok) && results.every((r) => r.ok || [400, 403, 409, 422].includes(r.status)), `Close/allocation race returned uncontrolled failure: ${JSON.stringify(results.map(r=>({status:r.status,message:r.payload.message})))}`);
    await assertNoClosedObligations(concurrent.order.id);
    checks += 2;
  }
  const reportClose = await createReleasedOrder(defaultManager.session, product.id, 1, "REPORT-CLOSE-RACE");
  const reportCloseWork = await assign(defaultManager.session, reportClose.order, reportClose.batch, employee.worker.id, "CUTTING", 1, "report-close-work");
  await accept(employee.session, reportCloseWork.row.id, 1, "report-close-accept");
  const reportCloseRace = await Promise.all([
    api("POST", `/api/production-orders/${reportClose.order.id}/complete`, { quantity_good: 0, idempotency_key: key("race-close-vs-report") }, defaultManager.session),
    api("POST", assignmentPath(reportCloseWork.row.id, "reports"), { work_date: firstDate, quantity_good: 1, idempotency_key: key("race-report-vs-close") }, employee.session),
  ]);
  assert(!reportCloseRace[0].ok && reportCloseRace[1].ok, "Close raced past accepted/pending reported work.");
  await assertNoClosedObligations(reportClose.order.id);
  checks += 2;

  // Batch splitting preserves the overall plan; allocated batches are frozen.
  const atomicSplit = await createReleasedOrder(defaultManager.session, product.id, 6, "ATOMIC-SPLIT");
  restartOrderIds.push(atomicSplit.order.id);
  const atomicSplitBody = { planned_quantity: 2, batch_number: `ATOMIC-SPLIT-${token}`, reason: "Split into 4 + 2 atomically", idempotency_key: key("atomic-split") };
  const atomicSplitRow = unwrap(await must("POST", `${dispatch}/batches/${atomicSplit.batch.id}/split`, atomicSplitBody, defaultManager.session), "batch");
  const atomicSplitReplay = unwrap(await must("POST", `${dispatch}/batches/${atomicSplit.batch.id}/split`, atomicSplitBody, defaultManager.session), "batch");
  assert.equal(atomicSplitReplay.id, atomicSplitRow.id, "Split retry created another batch.");
  const splitState = async () => (await sql("select id,planned_quantity::text qty from local_production_batches where production_order_id=$1 order by id", [atomicSplit.order.id])).rows;
  const expectedSplitState = await splitState();
  assert.equal(expectedSplitState.length, 2);
  assert.equal(Number(expectedSplitState.find((row) => row.id === atomicSplit.batch.id).qty), 4);
  assert.equal(Number(expectedSplitState.find((row) => row.id === atomicSplitRow.id).qty), 2);
  await denied("POST", `${dispatch}/batches/${atomicSplit.batch.id}/split`, { ...atomicSplitBody, planned_quantity: 1, idempotency_key: key("atomic-split-duplicate-number") }, defaultManager.session);
  assert.deepEqual(await splitState(), expectedSplitState, "Failed duplicate batch insertion did not roll back the source quantity.");
  await denied("POST", `${dispatch}/batches/${atomicSplit.batch.id}/split`, { ...atomicSplitBody, batch_number: `OVER-SPLIT-${token}`, planned_quantity: 4, idempotency_key: key("atomic-split-over-limit") }, defaultManager.session);
  assert.deepEqual(await splitState(), expectedSplitState, "Rejected whole-batch split changed quantities.");
  await denied("POST", `${dispatch}/batches/${atomicSplit.batch.id}/split`, { ...atomicSplitBody, batch_number: `EMPLOYEE-SPLIT-${token}`, idempotency_key: key("atomic-split-employee") }, employee.session, [403]);
  for (const terminalStatus of ["COMPLETED", "CANCELLED"]) {
    const terminalBatch = await createReleasedOrder(defaultManager.session, product.id, 3, `BATCH-${terminalStatus}`, terminalStatus === "COMPLETED");
    if (terminalStatus === "COMPLETED") await must("POST", `/api/production-batches/${terminalBatch.batch.id}/status`, { target_status: "IN_PROGRESS" }, defaultManager.session);
    await must("POST", `/api/production-batches/${terminalBatch.batch.id}/status`, { target_status: terminalStatus, reason: "Terminal batch guard fixture" }, defaultManager.session);
    await denied("PATCH", `${dispatch}/batches/${terminalBatch.batch.id}`, { planned_quantity: 2, reason: "Cannot edit terminal batch", idempotency_key: key(`terminal-batch-${terminalStatus}`) }, defaultManager.session);
    const unchangedBatch = (await sql("select status,planned_quantity::text qty from local_production_batches where id=$1", [terminalBatch.batch.id])).rows[0];
    assert.equal(unchangedBatch.status, terminalStatus);
    assert.equal(Number(unchangedBatch.qty), 3);
  }
  const split = await createReleasedOrder(defaultManager.session, product.id, 6, "SPLIT");
  await must("PATCH", `${dispatch}/batches/${split.batch.id}`, { planned_quantity: 4, reason: "Split into 4 + 2", idempotency_key: key("split-default") }, defaultManager.session);
  const splitBody = { production_order_id: split.order.id, batch_number: `SPLIT-${token}`, planned_quantity: 2, idempotency_key: key("split-new") };
  const newBatch = unwrap(await must("POST", `${dispatch}/batches`, splitBody, defaultManager.session), "batch");
  const splitRetry = unwrap(await must("POST", `${dispatch}/batches`, splitBody, defaultManager.session), "batch");
  assert.equal(splitRetry.id, newBatch.id);
  await denied("POST", `${dispatch}/batches`, { ...splitBody, batch_number: `EXCESS-${token}`, planned_quantity: 1, idempotency_key: key("split-over-plan") }, defaultManager.session);
  const splitWork = await assign(defaultManager.session, split.order, newBatch, employee.worker.id, "CUTTING", 2, "split-work");
  await denied("POST", `${dispatch}/batches/${newBatch.id}/split`, { ...atomicSplitBody, batch_number: `ALLOCATED-SPLIT-${token}`, planned_quantity: 1, idempotency_key: key("atomic-split-allocated") }, defaultManager.session);
  await denied("PATCH", `${dispatch}/batches/${newBatch.id}`, { planned_quantity: 1, reason: "Cannot change allocated batch", idempotency_key: key("split-after-allocate") }, defaultManager.session);
  await accept(employee.session, splitWork.row.id, 2, "split-work-accept");
  const proxyReport = await report(leader.session, splitWork.row.id, 1, "proxy-maker");
  await denied("POST", reportPath(proxyReport.row.id, "review"), { target_status: "APPROVED", idempotency_key: key("proxy-self-review") }, leader.session, [403]);
  await review(defaultManager.session, proxyReport.row.id, "APPROVED", "proxy-manager-review");
  await denied("POST", reportPath(proxyReport.row.id, "reverse"), { reason: "Leader cannot reverse", idempotency_key: key("proxy-leader-reverse") }, leader.session, [403]);
  const reverseBody = { reason: "Correct cutting submission", idempotency_key: key("cut-successful-reverse") };
  await must("POST", `/api/production-orders/${split.order.id}/transition`, { target_status: "ON_HOLD", reason: "Correct report while held" }, defaultManager.session);
  await must("POST", reportPath(proxyReport.row.id, "reverse"), reverseBody, defaultManager.session);
  await must("POST", reportPath(proxyReport.row.id, "reverse"), reverseBody, defaultManager.session);
  assert.equal((await sql("select status from local_production_orders where id=$1", [split.order.id])).rows[0].status, "ON_HOLD", "Reversing a held report reopened the order.");
  await must("POST", `/api/production-orders/${split.order.id}/transition`, { target_status: "IN_PROGRESS", reason: "Resume after correction" }, defaultManager.session);
  const replacement = await report(employee.session, splitWork.row.id, 2, "split-replacement");
  await review(defaultManager.session, replacement.row.id, "APPROVED", "split-replacement-approved");

  const mixedWork = await assign(defaultManager.session, split.order, newBatch, employee.worker.id, "SEWING", 2, "mixed-work", { piece_rate_code: pieceCode });
  await accept(employee.session, mixedWork.row.id, 2, "mixed-accept");
  const mixed = await report(employee.session, mixedWork.row.id, 0.5, "mixed-report", firstDate, { quantity_rework: 0.25, quantity_remake: 0.25, quantity_defect: 0.5, notes: "Quality breakdown totals 1.5" });
  assert.equal(Number(mixed.row.quantity_received), 1.5, "Quality breakdown did not reserve total processed quantity.");
  await denied("POST", assignmentPath(mixedWork.row.id, "reports"), { work_date: firstDate, quantity_good: 0.75, idempotency_key: key("mixed-over-quota") }, employee.session);
  await review(defaultManager.session, mixed.row.id, "APPROVED", "mixed-approved");
  const mixedEntry = (await sql("select e.id,e.quantity from local_production_entries e join local_production_stage_events s on s.production_entry_id=e.id where s.id=$1", [mixed.row.id])).rows[0];
  assert.equal(Number(mixedEntry.quantity), 0.5, "Defect/rework/remake quantities earned piece pay.");
  const mixedReverse = { reason: "Reverse mixed quality report", idempotency_key: key("mixed-reverse") };
  await must("POST", reportPath(mixed.row.id, "reverse"), mixedReverse, defaultManager.session);
  await must("POST", reportPath(mixed.row.id, "reverse"), mixedReverse, defaultManager.session);
  const reversedEntry = (await sql("select workflow_status,is_reversed from local_production_entries where id=$1", [mixedEntry.id])).rows[0];
  assert(reversedEntry.workflow_status === "REVERSED" && reversedEntry.is_reversed, "Report reversal detached its payroll entry.");
  await must("POST", assignmentPath(mixedWork.row.id, "return"), { quantity: 1, reason: "Free capacity for unit validation", idempotency_key: key("mixed-return") }, employee.session);

  // Exact-code ambiguity and a work-date unit change must never silently choose.
  const ambiguousCode = `AMBIGUOUS-${token}`;
  await sql("insert into local_product_rates(piece_rate_code,rate,rate_unit,effective_from,status,reason) values($1,10,'PIECE',$2,'APPROVED','Fixture'),($1,20,'PIECE',$2,'APPROVED','Fixture')", [ambiguousCode, periodStart]);
  await denied("POST", `${dispatch}/assignments`, { production_order_id: split.order.id, production_batch_id: newBatch.id, worker_id: employee.worker.id, stage: "SEWING", quantity: 0.5, piece_rate_code: ambiguousCode, assigned_from: periodStart, idempotency_key: key("ambiguous-code") }, defaultManager.session);
  const changedUnitCode = `UNIT-${token}`;
  await sql("insert into local_product_rates(piece_rate_code,rate,rate_unit,effective_from,effective_to,status,reason) values($1,10,'SET',$2,$3,'APPROVED','Fixture'),($1,10,'PIECE',$4,null,'APPROVED','Fixture')", [changedUnitCode, periodStart, firstDate, secondDate]);
  const unitWork = await assign(defaultManager.session, split.order, newBatch, other.worker.id, "SEWING", 0.5, "unit-change", { piece_rate_code: changedUnitCode });
  await accept(other.session, unitWork.row.id, 0.5, "unit-accept");
  const unitOutput = await report(other.session, unitWork.row.id, 0.5, "unit-report", secondDate);
  await denied("POST", reportPath(unitOutput.row.id, "review"), { target_status: "APPROVED", idempotency_key: key("unit-review") }, defaultManager.session);
  assert.equal((await sql("select production_entry_id,status from local_production_stage_events where id=$1", [unitOutput.row.id])).rows[0].production_entry_id, null, "Failed unit approval left a payroll entry.");
  await review(defaultManager.session, unitOutput.row.id, "REJECTED", "unit-rejected");
  return { defaultManager, leader };
}

async function prepareQaFixture(admin, manager, product, pieceCode) {
  const manifestPath = process.env.LOCAL_DISPATCH_QA_MANIFEST;
  if (!manifestPath) return;
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const harnessId = databaseName.replace("crm_local_test_dispatch_", "");
  assert.equal(dirname(resolve(manifestPath)), resolve(projectRoot), "QA manifest must remain in the owned test workspace.");
  assert.equal(basename(manifestPath), `.isolated-dispatch-${harnessId}.qa.json`, "QA manifest must match this owned database.");
  const rootPid = Number(process.env.LOCAL_DISPATCH_QA_API_PID);
  assert(Number.isInteger(rootPid) && rootPid > 0, "QA retention requires the harness-owned API PID.");
  const today = dateFor(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const employee = await createActor(admin, "MOBILE-QA", "employee");
  await seedPayrollProfiles([employee.worker.id], "-QA");
  const fixture = await createReleasedOrder(manager.session, product.id, 100, "Mobile QA: nhận việc và báo cáo trong ngày");
  const cut = await assign(manager.session, fixture.order, fixture.batch, manager.worker.id, "CUTTING", 100, "qa-cut", { assigned_from: today });
  await accept(manager.session, cut.row.id, 100, "qa-cut-accept");
  const cutOutput = await report(manager.session, cut.row.id, 100, "qa-cut-report", today);
  await review(admin, cutOutput.row.id, "APPROVED", "qa-cut-approved");
  const pending = await assign(manager.session, fixture.order, fixture.batch, employee.worker.id, "SEWING", 40, "qa-sewing-pending", { assigned_from: today, piece_rate_code: pieceCode, notes: "QA: có thể nhận thiếu hoặc từ chối" });
  const accepted = await assign(manager.session, fixture.order, fixture.batch, employee.worker.id, "SEWING", 50, "qa-sewing-accepted", { assigned_from: today, piece_rate_code: pieceCode, notes: "QA: báo cáo hai lần cùng ngày, cùng số lượng" });
  await accept(employee.session, accepted.row.id, 50, "qa-sewing-accept");
  await writeFile(manifestPath, JSON.stringify({
    database: databaseName, apiUrl: base, apiPort: Number(apiUrl.port), apiRootPid: rootPid,
    stdoutPath: resolve(projectRoot, `.isolated-dispatch-${harnessId}.stdout.log`),
    stderrPath: resolve(projectRoot, `.isolated-dispatch-${harnessId}.stderr.log`),
    manifestPath: resolve(manifestPath), today,
    employee: { email: employee.user.email, password: employee.password, workerId: employee.worker.id },
    manager: { email: manager.user.email, password: manager.password, workerId: manager.worker.id },
    orderId: fixture.order.id, batchId: fixture.batch.id, pieceRateCode: pieceCode,
    pendingAssignmentId: pending.row.id, pendingQuantity: 40,
    acceptedAssignmentId: accepted.row.id, remainingQuantity: 50,
  }, null, 2), { flag: "wx" });
}

function ownedCheckpointPath() {
  const value = String(process.env.LOCAL_DISPATCH_RESTART_CHECKPOINT || "");
  const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
  assert(value && dirname(resolve(value)) === projectRoot && basename(value) === `.isolated-dispatch-${databaseName.replace("crm_local_test_dispatch_", "")}.restart.json`, "Restart checkpoint must belong to this isolated harness.");
  return resolve(value);
}

async function productionSnapshots(orderIds) {
  const values = [orderIds];
  return {
    orders: (await sql("select to_jsonb(o) row from local_production_orders o where id=any($1::uuid[]) order by id", values)).rows.map((row) => row.row),
    items: (await sql("select to_jsonb(i) row from local_production_order_items i where production_order_id=any($1::uuid[]) order by id", values)).rows.map((row) => row.row),
    batches: (await sql("select to_jsonb(b) row from local_production_batches b where production_order_id=any($1::uuid[]) order by id", values)).rows.map((row) => row.row),
  };
}

if (process.argv.includes("--verify-restart")) {
  try {
    const checkpoint = JSON.parse(await readFile(ownedCheckpointPath(), "utf8"));
    assert.equal(checkpoint.database, databaseName);
    assert.deepEqual(await productionSnapshots(checkpoint.orderIds), checkpoint.snapshots, "API restart/bootstrap changed split batch quantities or production order/item source snapshots.");
    for (const order of checkpoint.snapshots.orders) {
      const planned = checkpoint.snapshots.batches.filter((batch) => batch.production_order_id === order.id).reduce((sum, batch) => sum + Number(batch.planned_quantity), 0);
      assert.equal(planned, Number(order.quantity_planned), "Split plans no longer sum to the original order plan after restart.");
    }
    if (process.env.LOCAL_DISPATCH_QA_MANIFEST) {
      const manifest = JSON.parse(await readFile(process.env.LOCAL_DISPATCH_QA_MANIFEST, "utf8"));
      assert.equal(manifest.database, databaseName);
      manifest.apiRootPid = Number(process.env.LOCAL_DISPATCH_QA_API_PID);
      await writeFile(process.env.LOCAL_DISPATCH_QA_MANIFEST, JSON.stringify(manifest, null, 2));
    }
    console.log(`PASS local production dispatch restart: ${checkpoint.orderIds.length} production orders preserve exact split quantities, metadata, source IDs and snapshots.`);
  } finally { await database.end(); }
} else try {
  await assertIsolated();
  const adminBootstrap = await must("GET", "/api/local-auth/session");
  const admin = adminBootstrap.token;
  fixtureAdminSession = admin;
  assert(admin, "Local isolated bootstrap failed.");
  const migrationDirectory = new URL("../server/db/migrations/", import.meta.url);
  const dispatchMigrations = (await readdir(migrationDirectory)).filter((name) => /^038.*\.sql$/.test(name));
  assert.equal(dispatchMigrations.length, 1, "Dispatch migration 038 missing or ambiguous.");
  const migration = await readFile(new URL(dispatchMigrations[0], migrationDirectory), "utf8");
  await sql(migration);
  await sql(migration);
  checks += 2;
  // Seed workers are outside this fixture's payroll scope; the whole database
  // is harness-owned and discarded after the suite.
  await sql("update local_workers set payroll_status='SUSPENDED'");
  const manager = await createActor(admin, "MANAGER", "manager");
  const employee = await createActor(admin, "EMPLOYEE", "employee");
  const other = await createActor(admin, "OTHER", "employee");
  await seedPayrollProfiles([manager.worker.id, employee.worker.id, other.worker.id]);
  const product = await must("POST", "/api/catalog/products", { sku: `CRM-${token}`, name: `Dispatch product ${token}`, rate: 99999, rate_unit: "PIECE", effective_from: periodStart, rate_reason: "Isolated unrelated SKU rate" }, admin);
  await seedManufacturing(product.id);
  await assertCompletionQuantityValidation(manager.session, product.id);
  const pieceCode = `EXCEL-${token}`;
  const oldRate = await sql(`insert into local_product_rates(product_id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,effective_to,status,reason)
    values(null,$1,'Independent Excel work code',12500.25,'PIECE',$2,$3,'APPROVED','Isolated old rate') returning id`, [pieceCode, periodStart, firstDate]);
  const newRate = await sql(`insert into local_product_rates(product_id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,status,reason)
    values(null,$1,'Independent Excel work code',15000.75,'PIECE',$2,'APPROVED','Isolated new rate') returning id`, [pieceCode, secondDate]);

  await extendedWorkflow(admin, manager, employee, other, product, pieceCode);

  await denied("GET", `${dispatch}/mine`, undefined, undefined, [401]);
  const draft = await must("POST", "/api/production-orders", { product_id: product.id, quantity: 20 }, manager.session);
  const draftBatch = await sql("insert into local_production_batches(production_order_id,batch_number,planned_quantity) values($1,$2,20) returning id", [draft.id, `DRAFT-${token}`]);
  await denied("POST", `${dispatch}/assignments`, { production_order_id: draft.id, production_batch_id: draftBatch.rows[0].id, worker_id: employee.worker.id, stage: "CUTTING", quantity: 1, assigned_from: periodStart, idempotency_key: key("draft-block") }, manager.session);
  const main = await createReleasedOrder(manager.session, product.id, 20, "MAIN");
  const foreign = await createReleasedOrder(manager.session, product.id, 5, "FOREIGN");
  const workBody = { production_order_id: main.order.id, production_batch_id: main.batch.id, worker_id: employee.worker.id, stage: "CUTTING", quantity: 1, assigned_from: periodStart };
  await denied("POST", `${dispatch}/assignments`, { ...workBody, idempotency_key: key("employee-allocate") }, employee.session, [403]);
  await denied("POST", `${dispatch}/assignments`, { ...workBody, production_batch_id: foreign.batch.id, idempotency_key: key("foreign-batch") }, manager.session);
  await denied("POST", `${dispatch}/assignments`, { ...workBody, order_item_id: randomUUID(), idempotency_key: key("bad-item") }, manager.session);
  await denied("POST", `${dispatch}/assignments`, { ...workBody, worker_id: randomUUID(), idempotency_key: key("bad-worker") }, manager.session);
  await denied("POST", `${dispatch}/assignments`, { ...workBody, stage: "SEWING", piece_rate_code: pieceCode, idempotency_key: key("no-cutting") }, manager.session);
  const cutting = await assign(manager.session, main.order, main.batch, employee.worker.id, "CUTTING", 20, "cutting");
  const cutReplay = unwrap(await must("POST", `${dispatch}/assignments`, cutting.body, manager.session), "assignment");
  assert.equal(cutReplay.id, cutting.row.id, "Assignment retry created a duplicate.");
  await denied("POST", `${dispatch}/assignments`, { ...cutting.body, quantity: 19 }, manager.session, [409]);
  await denied("POST", assignmentPath(cutting.row.id, "accept"), { quantity: 20, idempotency_key: key("other-accept") }, other.session, [403, 404]);
  const cutAcceptBody = await accept(employee.session, cutting.row.id, 20, "cut-accept");
  await must("POST", assignmentPath(cutting.row.id, "accept"), cutAcceptBody, employee.session);
  await denied("POST", assignmentPath(cutting.row.id, "accept"), { ...cutAcceptBody, quantity: 19 }, employee.session, [409]);
  const cutOutput = await report(employee.session, cutting.row.id, 20, "cut-report");
  await denied("POST", `${dispatch}/assignments`, { ...workBody, stage: "SEWING", piece_rate_code: pieceCode, idempotency_key: key("pending-cutting") }, manager.session);
  await denied("POST", reportPath(cutOutput.row.id, "review"), { target_status: "APPROVED", reason: "self approval", idempotency_key: key("employee-review") }, employee.session, [403]);
  await review(manager.session, cutOutput.row.id, "APPROVED", "cut-approved");
  await denied("POST", `${dispatch}/assignments`, { ...workBody, stage: "SEWING", piece_rate_code: product.sku, idempotency_key: key("sku-is-not-code") }, manager.session);
  await denied("POST", `${dispatch}/assignments`, { ...workBody, stage: "SEWING", idempotency_key: key("missing-code") }, manager.session);
  const sewing = await assign(manager.session, main.order, main.batch, employee.worker.id, "SEWING", 15, "sewing", { piece_rate_code: pieceCode });
  const sewingReplay = unwrap(await must("POST", `${dispatch}/assignments`, sewing.body, manager.session), "assignment");
  assert.equal(sewingReplay.id, sewing.row.id);
  const acceptance = await accept(employee.session, sewing.row.id, 12, "sew-accept", "Received 12; return 3 shortfall to pool");
  await denied("POST", assignmentPath(sewing.row.id, "accept"), { ...acceptance, quantity: 13 }, employee.session, [409]);
  const first = await report(employee.session, sewing.row.id, 3.25, "partial-first");
  const firstReplay = unwrap(await must("POST", assignmentPath(sewing.row.id, "reports"), first.body, employee.session), "report");
  assert.equal(firstReplay.id, first.row.id, "Partial report retry duplicated output.");
  await denied("POST", assignmentPath(sewing.row.id, "reports"), { ...first.body, quantity_good: 4 }, employee.session, [409]);
  const race = await Promise.all([0, 1].map((i) => api("POST", assignmentPath(sewing.row.id, "reports"), { work_date: secondDate, quantity_good: 5, idempotency_key: key(`race-${i}`) }, employee.session)));
  assert.equal(race.filter((result) => result.ok).length, 1, "Concurrent pending submissions exceeded accepted quota.");
  assert(race.find((result) => !result.ok).status < 500, "Quota race must return a controlled refusal.");
  checks += 2;
  const racedReport = unwrap(race.find((result) => result.ok).payload, "report");
  await review(manager.session, racedReport.id, "REJECTED", "race-reject");
  const second = await report(employee.session, sewing.row.id, 2.5, "partial-second", secondDate);
  await denied("POST", reportPath(cutOutput.row.id, "reverse"), { reason: "Must preserve downstream capacity", idempotency_key: key("cut-reverse-with-sewing") }, manager.session);
  await denied("POST", assignmentPath(sewing.row.id, "return"), { quantity: 7, reason: "Cannot return pending quantities", idempotency_key: key("bad-return") }, employee.session);
  const returnBody = { quantity: 1, reason: "Return unused quantity for reassignment", idempotency_key: key("return-one") };
  await must("POST", assignmentPath(sewing.row.id, "return"), returnBody, employee.session);
  await must("POST", assignmentPath(sewing.row.id, "return"), returnBody, employee.session);
  await denied("POST", assignmentPath(sewing.row.id, "return"), { ...returnBody, quantity: 2 }, employee.session, [409]);
  const reassigned = await assign(manager.session, main.order, main.batch, other.worker.id, "SEWING", 1, "reassign", { piece_rate_code: pieceCode });
  await accept(other.session, reassigned.row.id, 1, "reassign-accept");
  const unaccepted = await assign(manager.session, main.order, main.batch, other.worker.id, "SEWING", 1, "unaccepted", { piece_rate_code: pieceCode });
  await must("POST", assignmentPath(unaccepted.row.id, "reject"), { reason: "Cannot receive this work", idempotency_key: key("reject-unaccepted") }, other.session);

  // Two intentional equal partial deliveries on the same day are different
  // business events; transport retries retain each event's original key.
  const equalWork = await assign(manager.session, main.order, main.batch, other.worker.id, "SEWING", 2, "equal-partials", { piece_rate_code: pieceCode });
  await accept(other.session, equalWork.row.id, 2, "equal-partials-accept");
  const equalFirst = await report(other.session, equalWork.row.id, 1, "equal-first");
  const equalSecond = await report(other.session, equalWork.row.id, 1, "equal-second");
  assert.notEqual(equalFirst.row.id, equalSecond.row.id, "Intentional equal report replayed an earlier business event.");
  const equalReplay = unwrap(await must("POST", assignmentPath(equalWork.row.id, "reports"), equalSecond.body, other.session), "report");
  assert.equal(equalReplay.id, equalSecond.row.id);
  await denied("POST", assignmentPath(equalWork.row.id, "reports"), { ...equalSecond.body, idempotency_key: key("equal-third-over-quota") }, other.session);
  await review(manager.session, equalFirst.row.id, "REJECTED", "equal-first-rejected");
  const equalReplacement = await report(other.session, equalWork.row.id, 1, "equal-replacement");
  assert.notEqual(equalReplacement.row.id, equalFirst.row.id, "Fresh key could not replace an equal rejected report.");
  await review(manager.session, equalSecond.row.id, "APPROVED", "equal-second-approved");
  await review(manager.session, equalReplacement.row.id, "APPROVED", "equal-replacement-approved");
  const equalEntries = (await sql("select count(*)::int count,sum(p.quantity)::text qty from local_production_entries p join local_production_stage_events e on e.production_entry_id=p.id where e.assignment_id=$1 and e.status='APPROVED'", [equalWork.row.id])).rows[0];
  assert.equal(equalEntries.count, 2);
  assert.equal(Number(equalEntries.qty), 2, "Equal partial reports were not both counted once.");

  const firstReviewBody = await review(manager.session, first.row.id, "APPROVED", "partial-first-approve");
  await must("POST", reportPath(first.row.id, "review"), firstReviewBody, manager.session);
  await denied("POST", reportPath(first.row.id, "review"), { ...firstReviewBody, target_status: "REJECTED" }, manager.session, [409]);
  await review(manager.session, second.row.id, "APPROVED", "partial-second-approve");
  const workspace = await must("GET", `${dispatch}?orderId=${main.order.id}`, undefined, manager.session);
  const own = await must("GET", `${dispatch}/mine`, undefined, employee.session);
  assert(JSON.stringify(own).includes(sewing.row.id), "Assigned work missing from employee view.");
  assert(!JSON.stringify(own).includes(reassigned.row.id), "Employee view leaked another worker assignment.");
  assert(Array.isArray(workspace.assignments) && Array.isArray(workspace.reports), "Dispatch workspace lacks operational rows.");
  const reports = await sql("select id,production_entry_id,status from local_production_stage_events where id=any($1::uuid[]) order by id", [[first.row.id, second.row.id]]);
  assert.equal(reports.rows.length, 2);
  assert(reports.rows.every((row) => row.status === "APPROVED" && row.production_entry_id), "Approval did not create linked payroll entries atomically.");
  const entryIds = reports.rows.map((row) => row.production_entry_id);
  const entries = await sql("select id,rate_id,piece_rate_code,rate_amount::text,quantity::text,calculated_amount::text,workflow_status from local_production_entries where id=any($1::uuid[])", [entryIds]);
  assert.equal(entries.rows.length, 2, "Report approval created duplicate payroll entries.");
  const firstEntry = entries.rows.find((row) => row.rate_id === oldRate.rows[0].id);
  const secondEntry = entries.rows.find((row) => row.rate_id === newRate.rows[0].id);
  assert(firstEntry && secondEntry, "Work-date rate version was not honored.");
  assert(entries.rows.every((row) => row.piece_rate_code === pieceCode && row.workflow_status === "APPROVED"), "Excel code identity or approval snapshot changed.");
  assert.equal(Number(firstEntry.calculated_amount), 40625.81, "Decimal quantity/rate was calculated incorrectly.");
  assert.equal(Number(secondEntry.calculated_amount), 37501.88, "Second partial output used wrong rate.");
  await denied("POST", "/api/production/entries/status", { production_entry_id: firstEntry.id, target_status: "REJECTED", reason: "Bypass linked source", idempotency_key: key("linked-direct-review") }, manager.session);
  await denied("POST", `/api/production/entries/${firstEntry.id}/reverse`, { reason: "Bypass linked source", idempotency_key: key("linked-direct-reverse") }, manager.session);
  await denied("POST", `/api/production-stage-events/${first.row.id}/status`, { target_status: "REJECTED", reason: "Bypass dispatch review", idempotency_key: key("legacy-stage-review") }, manager.session);

  for (const status of ["ON_HOLD", "CANCELLED", "COMPLETED"]) {
    await sql("update local_production_orders set status=$2 where id=$1", [main.order.id, status]);
    await denied("POST", assignmentPath(sewing.row.id, "reports"), { work_date: secondDate, quantity_good: 0.25, idempotency_key: key(`report-${status}`) }, employee.session);
    await denied("POST", `${dispatch}/assignments`, { ...workBody, stage: "SEWING", piece_rate_code: pieceCode, idempotency_key: key(`assign-${status}`) }, manager.session);
  }
  await sql("update local_production_orders set status='IN_PROGRESS' where id=$1", [main.order.id]);

  // Calendar approval is an explicit synthetic prerequisite, never an implied
  // server fallback. Use the shared historical financial fixture with guarded SQL.
  await approveLegacyPayrollFixture({query:sql},periodStart,periodEnd,26);
  const run = await must("POST", "/api/payroll/runs", { period_start: periodStart, period_end: periodEnd, standard_days: 26, idempotency_key: key("payroll") }, admin);
  const details = await must("GET", `/api/payroll/runs/${run.id}`, undefined, admin);
  const linkedItems = details.items.filter((item) => entryIds.includes(item.source_id));
  assert.equal(linkedItems.length, 2, "Payroll counted dispatch output more than once or omitted a partial report.");
  assert(linkedItems.every((item) => item.source_type === "PRODUCTION_ENTRY" && item.item_type === "PIECE_RATE"), "Dispatch introduced a competing payroll source.");
  assert.equal(linkedItems.reduce((total, item) => total + Number(item.amount_precise), 0), 78127.6875, "Payroll lost precise quantity × effective rate arithmetic.");
  await must("POST", `/api/payroll/runs/${run.id}/lock`, {}, admin);
  await denied("POST", reportPath(first.row.id, "reverse"), { reason: "Locked payroll must remain immutable", idempotency_key: key("locked-reverse") }, manager.session);
  await denied("POST", assignmentPath(sewing.row.id, "reports"), { work_date: secondDate, quantity_good: 0.25, idempotency_key: key("locked-report") }, employee.session);
  const unchanged = await sql("select workflow_status,is_reversed from local_production_entries where id=any($1::uuid[])", [entryIds]);
  assert(unchanged.rows.every((row) => row.workflow_status === "APPROVED" && row.is_reversed === false), "Failed locked mutation partially modified linked payroll source.");
  await prepareQaFixture(admin, manager, product, pieceCode);
  await writeFile(ownedCheckpointPath(), JSON.stringify({ database: databaseName, orderIds: restartOrderIds, snapshots: await productionSnapshots(restartOrderIds) }), { flag: "wx" });
  console.log(`PASS local production dispatch: ${checks} HTTP/concurrency checks; isolated release → cut → assign → accept → partial reports → review → payroll lock.`);
} finally {
  await database.end();
}
