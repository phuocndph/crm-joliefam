import pg from "pg";

const base = String(process.env.LOCAL_API_URL || "").replace(/\/$/, "");
const databaseUrl = String(process.env.LOCAL_DATABASE_URL || "");
if (!base || !databaseUrl) throw new Error("LOCAL_API_URL and LOCAL_DATABASE_URL are required for the isolated concurrency test.");
const parsedBase = new URL(base);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedBase.hostname)) {
  throw new Error("LOCAL_API_URL must point to a loopback API.");
}

const authResponse = await fetch(`${base}/api/local-auth/session`, { headers: { origin: "http://127.0.0.1:8090" } });
const authSession = await authResponse.json();
if (!authResponse.ok || !authSession.token) throw new Error(`Local auth bootstrap failed (${authResponse.status}): ${JSON.stringify(authSession)}`);
const authHeaders = { "content-type": "application/json", origin: "http://127.0.0.1:8090", authorization: `Bearer ${authSession.token}` };

const request = async (path, body) => {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = {}; }
  return { ok: response.ok, status: response.status, payload };
};

const mustPost = async (path, body) => {
  const result = await request(path, body);
  if (!result.ok) throw new Error(`${path} failed (${result.status}): ${JSON.stringify(result.payload)}`);
  return result.payload;
};

const token = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const createDayWorker = async (suffix) => {
  const worker = await mustPost("/api/workers", {
    employee_code: `RACE-${token}-${suffix}`,
    display_name: `Concurrency ${suffix}`,
    worker_type: "GENERIC",
  });
  await mustPost("/api/worker-methods", {
    worker_id: worker.id,
    attendance_method: "DAY",
    rate_amount: 260000,
    effective_from: today,
    reason: "Concurrency test",
  });
  return worker;
};

const worker = await createDayWorker("IDEM");
const idempotencyKey = `race-attendance-${token}`;
const samePayload = {
  worker_id: worker.id,
  attendance_method: "DAY",
  work_date: today,
  day_units: 1,
  idempotency_key: idempotencyKey,
};
const retries = await Promise.all(Array.from({ length: 10 }, () => request("/api/attendance", samePayload)));
if (retries.some((result) => !result.ok)) throw new Error(`Concurrent identical retries failed: ${JSON.stringify(retries)}`);
const retryIds = new Set(retries.map((result) => result.payload.id));
if (retryIds.size !== 1) throw new Error("Concurrent identical retries created more than one attendance row.");
if (retries.filter((result) => result.payload.reused === false).length !== 1) {
  throw new Error("Concurrent identical retries did not produce exactly one original write.");
}

const conflictWorker = await createDayWorker("CONFLICT");
const conflictKey = `race-conflict-${token}`;
const conflicting = await Promise.all([
  request("/api/attendance", { worker_id: conflictWorker.id, attendance_method: "DAY", work_date: today, day_units: 1, idempotency_key: conflictKey }),
  request("/api/attendance", { worker_id: conflictWorker.id, attendance_method: "DAY", work_date: today, day_units: 0.5, idempotency_key: conflictKey }),
]);
if (conflicting.filter((result) => result.ok).length !== 1
  || conflicting.filter((result) => result.status === 409).length !== 1) {
  throw new Error(`Concurrent divergent idempotency payloads were not split into success/conflict: ${JSON.stringify(conflicting)}`);
}

const transitionWorker = await createDayWorker("STATUS");
const transitionRecord = await mustPost("/api/attendance", {
  worker_id: transitionWorker.id,
  attendance_method: "DAY",
  work_date: today,
  day_units: 1,
  idempotency_key: `race-status-source-${token}`,
});
const transitions = await Promise.all([
  request("/api/attendance/status", { attendance_record_id: transitionRecord.id, target_status: "APPROVED", reason: "Approve race", idempotency_key: `race-status-a-${token}` }),
  request("/api/attendance/status", { attendance_record_id: transitionRecord.id, target_status: "REJECTED", reason: "Reject race", idempotency_key: `race-status-b-${token}` }),
]);
if (transitions.filter((result) => result.ok).length !== 1) {
  throw new Error(`Concurrent workflow transitions did not serialize to one winner: ${JSON.stringify(transitions)}`);
}

const dayWorker = await createDayWorker("DAY");
const dayRace = await Promise.all([
  request("/api/attendance", { worker_id: dayWorker.id, attendance_method: "DAY", work_date: today, day_units: 1, idempotency_key: `race-day-work-${token}` }),
  request("/api/attendance/day-status", { worker_id: dayWorker.id, work_date: today, status: "ABSENT", reason: "Day race", idempotency_key: `race-day-absent-${token}` }),
]);
if (dayRace.filter((result) => result.ok).length !== 1) {
  throw new Error(`Attendance and ABSENT status were both accepted/rejected: ${JSON.stringify(dayRace)}`);
}

const replayWorker = await createDayWorker("REPLAY");
const oldDayKey = `race-day-replay-old-${token}`;
await mustPost("/api/attendance/day-status", {
  worker_id: replayWorker.id,
  work_date: today,
  status: "PRESENT",
  meal_eligible: false,
  reason: "Original day status",
  idempotency_key: oldDayKey,
});
await mustPost("/api/attendance/day-status", {
  worker_id: replayWorker.id,
  work_date: today,
  status: "HOLIDAY",
  meal_eligible: false,
  reason: "Later day status",
  idempotency_key: `race-day-replay-new-${token}`,
});
const oldReplay = await request("/api/attendance/day-status", {
  worker_id: replayWorker.id,
  work_date: today,
  status: "PRESENT",
  meal_eligible: false,
  reason: "Original day status",
  idempotency_key: oldDayKey,
});
if (!oldReplay.ok || oldReplay.payload.reused !== true || oldReplay.payload.status !== "PRESENT") {
  throw new Error(`Historical day-status replay was not idempotent: ${JSON.stringify(oldReplay)}`);
}
const changedOldReplay = await request("/api/attendance/day-status", {
  worker_id: replayWorker.id,
  work_date: today,
  status: "PRESENT",
  meal_eligible: true,
  reason: "Original day status",
  idempotency_key: oldDayKey,
});
if (changedOldReplay.status !== 409) {
  throw new Error(`Historical day-status payload conflict was not rejected: ${JSON.stringify(changedOldReplay)}`);
}

const closedWorker = await createDayWorker("CLOSED");
const closedRecord = await mustPost("/api/attendance", {
  worker_id: closedWorker.id,
  attendance_method: "DAY",
  work_date: today,
  day_units: 1,
  idempotency_key: `race-closed-source-${token}`,
});
await mustPost("/api/attendance/status", {
  attendance_record_id: closedRecord.id,
  target_status: "APPROVED",
  reason: "Close fixture",
  idempotency_key: `race-closed-approve-${token}`,
});
await mustPost("/api/attendance/closures", {
  worker_id: closedWorker.id,
  work_date: today,
  target_status: "EMPLOYEE_CONFIRMED",
  idempotency_key: `race-closed-employee-${token}`,
});
await mustPost("/api/attendance/closures", {
  worker_id: closedWorker.id,
  work_date: today,
  target_status: "LEADER_CONFIRMED",
  idempotency_key: `race-closed-leader-${token}`,
});

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
try {
  let directClosedWriteFailed = false;
  try {
    await pool.query(`
      insert into local_attendance(
        worker_id,attendance_method,work_date,day_units,rate_amount,calculated_amount,
        workflow_status,idempotency_key,notes
      ) values($1,'DAY',$2::date,1,260000,10000,'SUBMITTED',$3,'Direct closed-day guard')`,
    [closedWorker.id, today, `race-direct-closed-${token}`]);
  } catch (error) {
    directClosedWriteFailed = String(error.message).includes("trưởng nhóm xác nhận");
  }
  if (!directClosedWriteFailed) throw new Error("Database guard allowed a direct attendance insert into a leader-confirmed day.");

  const directWorker = await createDayWorker("DIRECT");
  const rate = await pool.query("select id,rate_amount from local_worker_rates where worker_id=$1 and attendance_method='DAY' order by created_at desc limit 1", [directWorker.id]);
  const directRace = await Promise.allSettled([
    pool.query(`insert into local_attendance(worker_id,attendance_method,work_date,day_units,rate_id,rate_amount,calculated_amount,workflow_status,idempotency_key)
      values($1,'DAY',$2::date,1,$3,$4,10000,'SUBMITTED',$5)`, [directWorker.id, today, rate.rows[0].id, rate.rows[0].rate_amount, `race-direct-work-${token}`]),
    pool.query(`insert into local_day_statuses(worker_id,work_date,status,meal_eligible,reason,idempotency_key)
      values($1,$2::date,'ABSENT',false,'Direct race',$3)`, [directWorker.id, today, `race-direct-absent-${token}`]),
  ]);
  if (directRace.filter((result) => result.status === "fulfilled").length !== 1) {
    throw new Error(`Database worker/day guard did not serialize direct writes: ${JSON.stringify(directRace)}`);
  }

  const currentReplayStatus = await pool.query("select status from local_day_statuses where worker_id=$1 and work_date=$2::date", [replayWorker.id, today]);
  if (currentReplayStatus.rows[0]?.status !== "HOLIDAY") {
    throw new Error("Historical day-status replay changed the current materialized status.");
  }

  const duplicates = await pool.query(`
    select entity_type,idempotency_key,count(*)::int count
    from local_attendance_workflow_events
    where idempotency_key is not null
    group by entity_type,idempotency_key
    having count(*) > 1`);
  if (duplicates.rows.length) throw new Error(`Duplicate workflow events found: ${JSON.stringify(duplicates.rows)}`);

  // Migration 032 requires source triggers to take the global shared payroll
  // boundary before the worker/day lock. Recreate the dangerous three-way
  // interleaving and assert that it serializes instead of deadlocking.
  const lockOrderWorker = await createDayWorker("LOCKORDER");
  const lockOrderRate = await pool.query(
    "select id,rate_amount from local_worker_rates where worker_id=$1 and attendance_method='DAY' order by created_at desc limit 1",
    [lockOrderWorker.id],
  );
  const blocker = await pool.connect();
  const sourceClient = await pool.connect();
  const payrollClient = await pool.connect();
  const timeout = async (promise, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded the 12s test timeout.`)), 12_000); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    await blocker.query("begin");
    await blocker.query("set local statement_timeout='8s'");
    await blocker.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`local-attendance-day:local-tenant:${lockOrderWorker.id}:${today}`],
    );

    await sourceClient.query("begin");
    await sourceClient.query("set local statement_timeout='8s'");
    const sourcePid = Number((await sourceClient.query("select pg_backend_pid() pid")).rows[0].pid);
    const sourceWrite = sourceClient.query(
      `insert into local_attendance(
        worker_id,attendance_method,work_date,day_units,rate_id,rate_amount,calculated_amount,
        workflow_status,idempotency_key,notes
      ) values($1,'DAY',$2::date,1,$3,$4,10000,'SUBMITTED',$5,'Migration 032 lock-order test') returning id`,
      [lockOrderWorker.id, today, lockOrderRate.rows[0].id, lockOrderRate.rows[0].rate_amount, `race-lock-order-${token}`],
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    const sourceLocks = await blocker.query(
      "select mode,granted from pg_locks where pid=$1 and locktype='advisory' order by granted desc,mode",
      [sourcePid],
    );
    if (!sourceLocks.rows.some((row) => row.mode === "ShareLock" && row.granted === true)
      || !sourceLocks.rows.some((row) => row.mode === "ExclusiveLock" && row.granted === false)) {
      throw new Error(`Migration 032 lock order was not observed: ${JSON.stringify(sourceLocks.rows)}`);
    }

    await payrollClient.query("begin");
    await payrollClient.query("set local statement_timeout='8s'");
    const payrollBoundary = (async () => {
      await payrollClient.query("select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard', 0))");
      await payrollClient.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`local-attendance-day:local-tenant:${lockOrderWorker.id}:${today}`],
      );
    })();

    await new Promise((resolve) => setTimeout(resolve, 150));
    await blocker.query("commit");
    await timeout(sourceWrite, "Source write");
    await sourceClient.query("commit");
    await timeout(payrollBoundary, "Payroll exclusive boundary");
    await payrollClient.query("commit");
  } catch (error) {
    await blocker.query("rollback").catch(() => undefined);
    await sourceClient.query("rollback").catch(() => undefined);
    await payrollClient.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    blocker.release();
    sourceClient.release();
    payrollClient.release();
  }
} finally {
  await pool.end();
}

console.log("Local attendance concurrency test passed: idempotency, workflow, worker/day, DB guards and payroll lock order are serialized.");
