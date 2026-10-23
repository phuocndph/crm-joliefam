// Explicit synthetic approved configuration for established isolated financial
// regression suites. Never imported by production code; no implied server defaults.
let fixtureQueue = Promise.resolve();
export function approveLegacyPayrollFixture(db, start, end, days = 26) {
  const next = fixtureQueue.then(() => approve(db,start,end,days)); fixtureQueue = next.catch(() => undefined); return next;
}
async function approve(db, start, end, days) {
  const exists = (await db.query("select to_regclass('local_payroll_calendar_versions') present")).rows[0].present;
  if (!exists) return;
  const locations = (await db.query("select distinct coalesce(nullif(location_code,''),'__UNASSIGNED__') location from local_workers")).rows;
  for (const { location } of locations) {
    // Overlapping-period regression intentionally asks an already-closed interval;
    // avoid injecting an overlapping approved fixture that should be rejected.
    const overlap = (await db.query("select id from local_payroll_calendar_versions where status='APPROVED' and location_code=$3 and period_start<=$2::date and period_end>=$1::date", [start,end,location])).rows;
    if (!overlap.length) await db.query("insert into local_payroll_calendar_versions(period_start,period_end,location_code,standard_days,daily_minutes,reason,source_reference,created_by,status,approved_by,approved_at)values($1,$2,$3,$4,480,'legacy isolated regression fixture','approved synthetic golden calendar','qa-fixture','APPROVED','qa-fixture',now())", [start,end,location,days]);
  }
  for (const { id } of (await db.query('select id from local_payroll_policy_groups')).rows) {
    const exists = (await db.query("select id from local_payroll_rule_versions where policy_group_id=$1 and status='APPROVED' and rule_kind='OT' and overtime_type='NORMAL'",[id])).rows;
    if (!exists.length) await db.query("insert into local_payroll_rule_versions(policy_group_id,rule_kind,overtime_type,calculation_method,multiplier,effective_from,effective_to,reason,source_reference,created_by,status,approved_by,approved_at)values($1,'OT','NORMAL','BASE_RATE_MULTIPLIER',1.5,'2020-01-01','2030-12-31','legacy isolated regression fixture','approved synthetic normal OT rule','qa-fixture','APPROVED','qa-fixture',now())",[id]);
  }
}
