import pg from "pg";

const base = String(process.env.LOCAL_API_URL || "").replace(/\/$/, "");
const databaseUrl = String(process.env.LOCAL_DATABASE_URL || "");

if (process.env.LOCAL_ATTENDANCE_BULK_TEST_ISOLATED !== "1") {
  throw new Error("Set LOCAL_ATTENDANCE_BULK_TEST_ISOLATED=1 and point both URLs to dedicated test services before running this write test.");
}
if (!base || !databaseUrl) throw new Error("LOCAL_API_URL and LOCAL_DATABASE_URL are required for the isolated bulk-workflow test.");

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const apiUrl = new URL(base);
const dbUrl = new URL(databaseUrl);
if (!loopbackHosts.has(apiUrl.hostname) || apiUrl.port === "8787") {
  throw new Error("LOCAL_API_URL must target a dedicated loopback test API, not the shared local runtime.");
}
if (!loopbackHosts.has(dbUrl.hostname)) throw new Error("LOCAL_DATABASE_URL must target a loopback database.");
const databaseName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
if (!databaseName || databaseName === "crm_local" || !/(test|isolated)/i.test(databaseName)) {
  throw new Error("LOCAL_DATABASE_URL must name a dedicated test/isolated database, never crm_local.");
}

const authResponse = await fetch(`${base}/api/local-auth/session`, { headers: { origin: "http://127.0.0.1:8090" } });
const authSession = await authResponse.json();
if (!authResponse.ok || !authSession.token) throw new Error(`Local auth bootstrap failed (${authResponse.status}): ${JSON.stringify(authSession)}`);
const authHeaders = { "content-type": "application/json", origin: "http://127.0.0.1:8090", authorization: `Bearer ${authSession.token}` };

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const getHealth = async () => {
  const response = await fetch(`${base}/health`);
  let payload = {};
  try { payload = await response.json(); } catch { /* response errors are asserted below */ }
  if (!response.ok) throw new Error(`/health failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
};

const assertApiTargetsIsolatedDatabase = async () => {
  const health = await getHealth();
  assert(health.ok === true && health.database === databaseName,
    `LOCAL_API_URL and LOCAL_DATABASE_URL must target the same isolated database (API: ${JSON.stringify(health.database)}, SQL: ${JSON.stringify(databaseName)}).`);
};

const request = async (path, body) => {
  await assertApiTargetsIsolatedDatabase();
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* response errors are asserted below */ }
  return { ok: response.ok, status: response.status, payload };
};

const mustPost = async (path, body) => {
  const result = await request(path, body);
  if (!result.ok) throw new Error(`${path} failed (${result.status}): ${JSON.stringify(result.payload)}`);
  return result.payload;
};

const token = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const month = today.slice(0, 7);

const createDayWorker = async (suffix, effectiveFrom = today) => {
  const worker = await mustPost("/api/workers", {
    employee_code: `BULK-${token}-${suffix}`,
    display_name: `Bulk workflow ${suffix}`,
    worker_type: "GENERIC",
  });
  await mustPost("/api/worker-methods", {
    worker_id: worker.id,
    attendance_method: "DAY",
    rate_amount: 260000,
    effective_from: effectiveFrom,
    reason: "Isolated bulk-workflow test",
  });
  return worker;
};

const createAttendance = (workerId, suffix, workDate = today) => mustPost("/api/attendance", {
  worker_id: workerId,
  attendance_method: "DAY",
  work_date: workDate,
  day_units: 1,
  idempotency_key: `bulk-attendance-${token}-${suffix}`,
});

const database = new pg.Pool({ connectionString: databaseUrl, max: 2 });
let lockedFixtureRunId = null;
let lockedFixturePeriodId = null;
try {
  // Fails early when the isolated API/database has not been bootstrapped with
  // migration 030 yet, without ever falling back to a shared local database.
  await database.query("select id from local_attendance_bulk_workflow_requests limit 0");

  const worker = await createDayWorker("APPROVE");
  const product = await mustPost("/api/catalog/products", {
    sku: `BULK-${token}-PRODUCT`,
    name: `Sản phẩm test batch ${token}`,
    piece_rate_code: `BULK-EXCEL-${token}`,
    rate: 12500,
    rate_unit: "PIECE",
    effective_from: today,
    rate_reason: "Isolated bulk-workflow test",
  });
  const attendance = await createAttendance(worker.id, "APPROVE");
  const production = await mustPost("/api/production/entries", {
    worker_id: worker.id,
    product_id: product.id,
    work_date: today,
    quantity: 3,
    idempotency_key: `bulk-production-${token}`,
    notes: "Isolated bulk-workflow test",
  });
  const overtime = await mustPost("/api/attendance/overtime", {
    worker_id: worker.id,
    work_date: today,
    overtime_type: "NORMAL_OVERTIME",
    overtime_minutes: 60,
    reason: "Isolated bulk-workflow test",
    idempotency_key: `bulk-overtime-${token}`,
  });

  const batchKey = `bulk-workflow-${token}`;
  const batchPayload = {
    target_status: "APPROVED",
    reason: "Duyệt batch test",
    month,
    worker_ids: [worker.id],
    source_types: ["ATTENDANCE", "PRODUCTION_ENTRY", "OVERTIME"],
    idempotency_key: batchKey,
  };
  const approved = await mustPost("/api/attendance/bulk-workflow", batchPayload);
  assert(approved.reused === false, `Initial batch unexpectedly reused: ${JSON.stringify(approved)}`);
  assert(approved.processed?.count === 3
    && approved.processed?.by_source?.ATTENDANCE === 1
    && approved.processed?.by_source?.PRODUCTION_ENTRY === 1
    && approved.processed?.by_source?.OVERTIME === 1,
  `Batch did not approve all three source types: ${JSON.stringify(approved)}`);

  const approvedStatuses = await database.query(`
    select
      (select workflow_status from local_attendance where id=$1) attendance_status,
      (select workflow_status from local_production_entries where id=$2) production_status,
      (select status from local_overtime where id=$3) overtime_status`,
  [attendance.id, production.id, overtime.id]);
  assert(approvedStatuses.rows[0]?.attendance_status === "APPROVED"
    && approvedStatuses.rows[0]?.production_status === "APPROVED"
    && approvedStatuses.rows[0]?.overtime_status === "APPROVED",
  `Approved statuses are inconsistent: ${JSON.stringify(approvedStatuses.rows[0])}`);

  const replay = await mustPost("/api/attendance/bulk-workflow", batchPayload);
  assert(replay.reused === true && replay.processed?.count === 3, `Idempotency replay was not preserved: ${JSON.stringify(replay)}`);
  const conflictingReplay = await request("/api/attendance/bulk-workflow", {
    ...batchPayload,
    target_status: "REJECTED",
    reason: "Different payload",
  });
  assert(conflictingReplay.status === 409, `Conflicting idempotency replay was not rejected: ${JSON.stringify(conflictingReplay)}`);

  const rejectWithoutReason = await request("/api/attendance/bulk-workflow", {
    target_status: "REJECTED",
    month,
    worker_ids: [worker.id],
    source_types: ["ATTENDANCE"],
    idempotency_key: `bulk-reject-no-reason-${token}`,
  });
  assert(rejectWithoutReason.status >= 400 && rejectWithoutReason.status < 500,
    `Missing reject reason did not return a 4xx response: ${JSON.stringify(rejectWithoutReason)}`);

  const openWorker = await createDayWorker("ATOMIC-OPEN");
  const lockedDayWorker = await createDayWorker("ATOMIC-CLOSED");
  const openRecord = await createAttendance(openWorker.id, "ATOMIC-OPEN");
  const lockedDayRecord = await createAttendance(lockedDayWorker.id, "ATOMIC-CLOSED");
  await mustPost("/api/attendance/closures", {
    worker_id: lockedDayWorker.id,
    work_date: today,
    target_status: "EMPLOYEE_CONFIRMED",
    idempotency_key: `bulk-closure-employee-${token}`,
  });
  await mustPost("/api/attendance/closures", {
    worker_id: lockedDayWorker.id,
    work_date: today,
    target_status: "LEADER_CONFIRMED",
    idempotency_key: `bulk-closure-leader-${token}`,
  });
  const blockedBatch = await request("/api/attendance/bulk-workflow", {
    target_status: "APPROVED",
    reason: "This must roll back",
    month,
    worker_ids: [openWorker.id, lockedDayWorker.id],
    source_types: ["ATTENDANCE"],
    idempotency_key: `bulk-atomic-${token}`,
  });
  assert(blockedBatch.status >= 400 && blockedBatch.status < 500,
    `Leader-confirmed source did not block the batch: ${JSON.stringify(blockedBatch)}`);
  const atomicStatuses = await database.query(`
    select id::text, workflow_status
    from local_attendance
    where id = any($1::uuid[])
    order by id`, [[openRecord.id, lockedDayRecord.id]]);
  assert(atomicStatuses.rows.length === 2 && atomicStatuses.rows.every((row) => row.workflow_status === "SUBMITTED"),
    `Blocked batch left a partial approval: ${JSON.stringify(atomicStatuses.rows)}`);

  const fixtureDateResult = await database.query(`
    select candidate.work_date::date::text work_date
    from generate_series(date_trunc('month', $1::date), $1::date, interval '1 day') as candidate(work_date)
    where not exists (
      select 1
      from local_payroll_runs r
      join local_payroll_periods p on p.id = r.period_id
      where r.status = 'LOCKED'
        and candidate.work_date::date between p.period_start and p.period_end
    )
      and not exists (
        select 1 from local_payroll_periods p
        where p.period_start = candidate.work_date::date
          and p.period_end = candidate.work_date::date
      )
    order by candidate.work_date desc
    limit 1`, [today]);
  const fixtureDate = fixtureDateResult.rows[0]?.work_date;
  assert(typeof fixtureDate === "string", "No unlocked date is available for the isolated locked-payroll fixture.");

  const noRecordWorker = await createDayWorker("LOCKED-NO-RECORD", fixtureDate);
  const noRecordProduct = await mustPost("/api/catalog/products", {
    sku: `BULK-${token}-LOCKED-PRODUCT`,
    name: `Sản phẩm khóa kỳ test ${token}`,
    piece_rate_code: `BULK-LOCKED-EXCEL-${token}`,
    rate: 12500,
    rate_unit: "PIECE",
    effective_from: fixtureDate,
    rate_reason: "Isolated locked-payroll test",
  });
  const noRecordAttendance = await createAttendance(noRecordWorker.id, "LOCKED-NO-RECORD", fixtureDate);
  const noRecordProduction = await mustPost("/api/production/entries", {
    worker_id: noRecordWorker.id,
    product_id: noRecordProduct.id,
    work_date: fixtureDate,
    quantity: 2,
    idempotency_key: `bulk-locked-production-${token}`,
    notes: "Isolated locked-payroll test",
  });
  const noRecordOvertime = await mustPost("/api/attendance/overtime", {
    worker_id: noRecordWorker.id,
    work_date: fixtureDate,
    overtime_type: "NORMAL_OVERTIME",
    overtime_minutes: 60,
    reason: "Isolated locked-payroll test",
    idempotency_key: `bulk-locked-overtime-${token}`,
  });
  const fixturePeriod = await database.query(`
    insert into local_payroll_periods(period_start, period_end, standard_days)
    values($1::date, $1::date, 26)
    returning id::text`, [fixtureDate]);
  lockedFixturePeriodId = fixturePeriod.rows[0]?.id;
  assert(typeof lockedFixturePeriodId === "string", "Could not create the isolated locked-payroll period.");
  const fixtureRun = await database.query(`
    insert into local_payroll_runs(
      period_id, run_number, status, calculation_version, standard_days_snapshot,
      config_snapshot, input_hash, idempotency_key, locked_at
    ) values(
      $1::uuid,
      (select coalesce(max(run_number), 0) + 1 from local_payroll_runs where period_id=$1::uuid),
      'LOCKED', 'isolated-bulk-lock-test', 26, '{}'::jsonb, $2, $3, now()
    ) returning id::text`, [lockedFixturePeriodId, `isolated-lock-input-${token}`, `isolated-lock-run-${token}`]);
  lockedFixtureRunId = fixtureRun.rows[0]?.id;
  assert(typeof lockedFixtureRunId === "string", "Could not create the isolated locked payroll run.");
  const payrollRecordCount = await database.query(
    "select count(*)::int count from local_payroll_records where run_id=$1::uuid and worker_id=$2::uuid",
    [lockedFixtureRunId, noRecordWorker.id],
  );
  assert(payrollRecordCount.rows[0]?.count === 0,
    "Locked-payroll fixture unexpectedly has a payroll record for its worker.");

  const lockedBatchKey = `bulk-payroll-lock-no-record-${token}`;
  const lockedBatch = await request("/api/attendance/bulk-workflow", {
    target_status: "APPROVED",
    reason: "Must be blocked by the locked payroll period",
    month: fixtureDate.slice(0, 7),
    worker_ids: [noRecordWorker.id],
    source_types: ["ATTENDANCE", "PRODUCTION_ENTRY", "OVERTIME"],
    idempotency_key: lockedBatchKey,
  });
  assert(lockedBatch.status >= 400 && lockedBatch.status < 500,
    `Locked payroll period without a payroll record did not block the batch: ${JSON.stringify(lockedBatch)}`);
  const lockedStatuses = await database.query(`
    select 'ATTENDANCE' source_type, workflow_status status from local_attendance where id=$1::uuid
    union all
    select 'PRODUCTION_ENTRY' source_type, workflow_status status from local_production_entries where id=$2::uuid
    union all
    select 'OVERTIME' source_type, status from local_overtime where id=$3::uuid`,
  [noRecordAttendance.id, noRecordProduction.id, noRecordOvertime.id]);
  assert(lockedStatuses.rows.length === 3 && lockedStatuses.rows.every((row) => row.status === "SUBMITTED"),
    `Locked payroll batch changed one or more source facts: ${JSON.stringify(lockedStatuses.rows)}`);
  const bulkEvents = await database.query(
    "select count(*)::int count from local_attendance_workflow_events where action='BULK_STATUS' and idempotency_key like $1",
    [`bulk-workflow:${lockedBatchKey}:%`],
  );
  assert(bulkEvents.rows[0]?.count === 0,
    `Locked payroll batch wrote BULK_STATUS events: ${JSON.stringify(bulkEvents.rows)}`);
  const batchAudit = await database.query(
    "select count(*)::int count from local_attendance_bulk_workflow_requests where idempotency_key=$1",
    [lockedBatchKey],
  );
  assert(batchAudit.rows[0]?.count === 0,
    `Locked payroll batch wrote an audit request row: ${JSON.stringify(batchAudit.rows)}`);
} finally {
  if (lockedFixtureRunId) await database.query("delete from local_payroll_runs where id=$1::uuid", [lockedFixtureRunId]);
  if (lockedFixturePeriodId) await database.query("delete from local_payroll_periods where id=$1::uuid", [lockedFixturePeriodId]);
  await database.end();
}

console.log("Local attendance bulk-workflow test passed: three-source approval, atomic rollback, idempotency replay/conflict, reject validation, and locked payroll scope without a worker payroll record.");
