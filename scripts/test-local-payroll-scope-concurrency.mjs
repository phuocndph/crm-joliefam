import assert from "node:assert/strict";
import pg from "pg";
import { approveLegacyPayrollFixture } from './payroll-approved-fixtures.mjs';

const base = String(process.env.LOCAL_API_URL || "").replace(/\/$/, "");
const databaseUrl = String(process.env.LOCAL_DATABASE_URL || "");
const expectedDatabase = String(process.env.LOCAL_TEST_DATABASE || "");
if (process.env.LOCAL_TEST_ISOLATED !== "1" || process.env.LOCAL_SYNC_AUTO !== "false") {
  throw new Error("This test requires LOCAL_TEST_ISOLATED=1 and LOCAL_SYNC_AUTO=false.");
}
if (!base || !databaseUrl || !expectedDatabase) throw new Error("Isolated API/database settings are required.");
const parsed = new URL(base);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || parsed.port === '8787') throw new Error("Refusing to use a shared local API.");

const healthResponse = await fetch(`${base}/health`);
const health = await healthResponse.json();
assert.equal(healthResponse.ok, true, "health endpoint failed");
assert.equal(health.database, expectedDatabase, "API does not target the owned database");

// Disposable production-mode harnesses provide their own normal fixture login.
const sessionResponse = process.env.LOCAL_TEST_AUTH_TOKEN
  ? { ok: true, json: async () => ({ token: process.env.LOCAL_TEST_AUTH_TOKEN }) }
  : await fetch(`${base}/api/local-auth/session`, { headers: { origin: "http://127.0.0.1:8090" } });
const session = await sessionResponse.json();
assert.equal(sessionResponse.ok, true, "local auth bootstrap failed");
assert.ok(session.token, "local auth token missing");
const headers = { "content-type": "application/json", origin: process.env.LOCAL_TEST_ORIGIN || "http://127.0.0.1:8090", authorization: `Bearer ${session.token}` };

const request = async (method, path, body) => {
  if (path.startsWith('/api/payroll/preflight') || (method === 'POST' && path === '/api/payroll/runs')) await approveLegacyPayrollFixture(pool, period.period_start, period.period_end, 26);
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let payload = {};
  try { payload = await response.json(); } catch { /* asserted by caller */ }
  return { response, payload };
};
const must = async (method, path, body) => {
  const result = await request(method, path, body);
  if (!result.response.ok) throw new Error(`${method} ${path} -> ${result.response.status}: ${JSON.stringify(result.payload)}`);
  return result.payload;
};
const assertStatus = async (method, path, body, status, label) => {
  const result = await request(method, path, body);
  assert.equal(result.response.status, status, `${label}: ${JSON.stringify(result.payload)}`);
  return result.payload;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const within = async (promise, label) => {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000); })]);
  } finally { clearTimeout(timeout); }
};

const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
const tag = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
const period = { period_start: "2026-09-01", period_end: "2026-09-30", standard_days: 26 };

async function createEligibleWorker(suffix) {
  const worker = await must("POST", "/api/workers", { employee_code: `SCOPE-${tag}-${suffix}`, display_name: `Scope ${suffix}`, worker_type: "HELPER" });
  const group = await must("POST", "/api/payroll/policy-groups", { code: `SCOPE-${tag}-${suffix}`, name: `Scope ${suffix}`, reason: "isolated scope concurrency" });
  const bundle = await must("POST", "/api/payroll/worker-profile-bundle", {
    worker_id: worker.id, compensation_type: "MONTHLY_HELPER", payroll_policy_group_id: group.id,
    effective_from: "2026-09-01", primary_amount: 2600000, reason: "isolated scope concurrency", idempotency_key: `bundle-${tag}-${suffix}`,
  });
  await must("POST", `/api/payroll/compensation-assignments/${bundle.assignment.id}/approve`, { reason: "isolated scope concurrency" });
  if (bundle.rate) await must("POST", `/api/payroll/rates/${bundle.rate.id}/approve`, { reason: "isolated scope concurrency" });
  await must("POST", `/api/payroll/worker-profiles/${bundle.profile.id}/approve`, { reason: "isolated scope concurrency" });
  return worker;
}

try {
  await pool.query("update local_workers set payroll_status='SUSPENDED' where employee_code in ('DAY-001','HOUR-001','PIECE-001','DEMO-LOCAL')");
  const workerA = await createEligibleWorker("A");
  const workerB = await createEligibleWorker("B");
  const inactive = await createEligibleWorker("INACTIVE");
  await pool.query("update local_workers set payroll_status='SUSPENDED' where id=$1", [inactive.id]);

  await assertStatus("GET", "/api/payroll/preflight?worker_ids=not-a-uuid", undefined, 400, "malformed worker id");
  const unknown = crypto.randomUUID();
  const unknownResult = await assertStatus("GET", `/api/payroll/preflight?worker_ids=${unknown}`, undefined, 400, "unknown worker id");
  assert.match(String(unknownResult.message || ""), /nhân sự|worker/i, "unknown UUID must fail existence validation, not only UUID parsing");

  const scoped = await must("GET", `/api/payroll/preflight?period_start=${period.period_start}&period_end=${period.period_end}&standard_days=26&worker_ids=${workerA.id},${inactive.id}`);
  assert.deepEqual(scoped.resolved_worker_ids, [workerA.id], "inactive known worker must resolve out of scope");

  const canonicalKey = `canonical-${tag}`;
  const first = await must("POST", "/api/payroll/runs", { ...period, worker_ids: [workerB.id.toUpperCase(), workerA.id, workerB.id, workerA.id.toUpperCase()], idempotency_key: canonicalKey });
  const retry = await must("POST", "/api/payroll/runs", { ...period, worker_ids: [workerA.id, workerB.id], idempotency_key: canonicalKey });
  assert.equal(retry.id, first.id, "canonical scope retry must return the original run");

  // A requested worker can become eligible after its preview was made. Locking
  // cannot close that worker into a period whose snapshot excluded it.
  const reactivationRun = await must("POST", "/api/payroll/runs", { ...period, worker_ids: [workerA.id, inactive.id], idempotency_key: `reactivate-${tag}` });
  assert.equal(reactivationRun.record_count, 1, "inactive requested worker must not be in the preview snapshot");
  await pool.query("update local_workers set payroll_status='ACTIVE' where id=$1", [inactive.id]);
  await assertStatus("POST", `/api/payroll/runs/${reactivationRun.id}/lock`, {}, 409, "reactivated omitted worker lock");
  await pool.query("update local_workers set payroll_status='SUSPENDED' where id=$1", [inactive.id]);

  const concurrentKey = `concurrent-${tag}`;
  const concurrent = await Promise.all([1, 2].map(() => request("POST", "/api/payroll/runs", { ...period, worker_ids: [workerA.id], idempotency_key: concurrentKey })));
  assert.ok(concurrent.every((item) => item.response.ok), `same-key concurrency failed: ${JSON.stringify(concurrent.map((item) => item.payload))}`);
  assert.equal(new Set(concurrent.map((item) => item.payload.id)).size, 1, "same-key concurrent create produced multiple runs");

  // ALL preview is intentionally separate: a newly eligible hire cannot be silently
  // omitted when an operator attempts to close the whole payroll period.
  const allRun = await must("POST", "/api/payroll/runs", { ...period, idempotency_key: `all-${tag}` });
  const lateWorker = await createEligibleWorker("LATE");
  await assertStatus("POST", `/api/payroll/runs/${allRun.id}/lock`, {}, 409, "ALL run stale worker roster lock");
  await pool.query("update local_workers set payroll_status='SUSPENDED' where id=$1", [lateWorker.id]);

  // Trigger 049: INSERT and activation cannot cross a held payroll exclusive boundary.
  const activationWorker = await must("POST", "/api/workers", { employee_code: `SCOPE-${tag}-ACTIVATE`, display_name: "Activation worker", worker_type: "HELPER" });
  await pool.query("update local_workers set payroll_status='SUSPENDED' where id=$1", [activationWorker.id]);
  const exclusive = await pool.connect();
  const activationClient = await pool.connect();
  try {
    await exclusive.query("begin");
    await exclusive.query("set local statement_timeout='8s'");
    await exclusive.query("select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard', 0))");
    const blockedInsert = request("POST", "/api/workers", { employee_code: `SCOPE-${tag}-BLOCK`, display_name: "Blocked worker", worker_type: "HELPER" });
    let settled = false;
    blockedInsert.then(() => { settled = true; }, () => { settled = true; });
    await delay(180);
    assert.equal(settled, false, "worker INSERT bypassed the payroll exclusive boundary");
    await exclusive.query("commit");
    const inserted = await within(blockedInsert, "trigger049 worker INSERT");
    assert.equal(inserted.response.ok, true, `worker INSERT did not finish after boundary release: ${JSON.stringify(inserted.payload)}`);
    await exclusive.query("begin");
    await exclusive.query("set local statement_timeout='8s'");
    await exclusive.query("select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard', 0))");
    await activationClient.query("begin");
    await activationClient.query("set local statement_timeout='8s'");
    const blockedActivation = activationClient.query("update local_workers set payroll_status='ACTIVE' where id=$1", [activationWorker.id]);
    let activationSettled = false;
    blockedActivation.then(() => { activationSettled = true; }, () => { activationSettled = true; });
    await delay(180);
    assert.equal(activationSettled, false, "worker activation bypassed the payroll exclusive boundary");
    await exclusive.query("commit");
    await within(blockedActivation, "trigger049 worker activation");
    await activationClient.query("commit");
  } finally {
    await exclusive.query("rollback").catch(() => undefined);
    await activationClient.query("rollback").catch(() => undefined);
    exclusive.release();
    activationClient.release();
  }

  // Hold shared first, then worker FOR UPDATE. A run must wait behind shared;
  // once released it completes, proving the prescribed order avoids a cycle.
  const source = await pool.connect();
  try {
    await source.query("begin");
    await source.query("set local statement_timeout='8s'");
    await source.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard', 0))");
    await source.query("select id from local_workers where id=$1 for update", [workerA.id]);
    const waitingRun = request("POST", "/api/payroll/runs", { ...period, worker_ids: [workerA.id], idempotency_key: `ordered-${tag}` });
    let settled = false;
    waitingRun.then(() => { settled = true; }, () => { settled = true; });
    await delay(180);
    assert.equal(settled, false, "payroll run bypassed held shared source boundary");
    await source.query("update local_workers set position_title='scope concurrency' where id=$1", [workerA.id]);
    await source.query("commit");
    const completed = await within(waitingRun, "source-before-worker ordered payroll run");
    assert.equal(completed.response.ok, true, `ordered payroll run failed: ${JSON.stringify(completed.payload)}`);
  } finally { await source.query("rollback").catch(() => undefined); source.release(); }

  console.log("PASS payroll scope/concurrency: validation, canonical retries, roster lock, trigger049 and source-lock ordering.");
} finally {
  await pool.end();
}
