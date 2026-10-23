import type { Pool } from 'pg';
import { capturePayrollSourceFingerprint } from './payroll-snapshot.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Missing historical metadata must never be interpreted as an all-worker scope. */
export function payrollComparisonScope(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const scope = (config as Record<string, unknown>).worker_scope as Record<string, unknown> | undefined;
  if (!scope || !Object.hasOwn(scope, 'requested_worker_ids')) return null;
  const canonical = (value: unknown) => Array.isArray(value) && value.every(id => typeof id === 'string' && uuid.test(id))
    ? [...new Set((value as string[]).map(id => id.toLowerCase()))].sort() : undefined;
  const requested = scope.requested_worker_ids === null ? null : canonical(scope.requested_worker_ids);
  const resolved = canonical(scope.resolved_worker_ids);
  return requested === undefined || resolved === undefined ? null : JSON.stringify({requested, resolved});
}

export async function readPayrollReconciliation(pool: Pool, runId: string) {
  const db = await pool.connect();
  try {
    await db.query('begin isolation level repeatable read read only');
    const run = (await db.query(`select r.id,r.period_id,r.run_number,r.status,r.calculation_version,
      r.standard_days_snapshot::text,r.config_snapshot,r.created_at,p.period_start::text,p.period_end::text,p.status period_status
      from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id where r.id=$1`, [runId])).rows[0];
    if (!run) throw Object.assign(new Error('Không tìm thấy lần tính lương.'), {status:404});
    const scope = payrollComparisonScope(run.config_snapshot);
    let freshness:'CURRENT'|'STALE'|'UNVERIFIABLE'|'NOT_APPLICABLE'=run.status==='PREVIEW'?'UNVERIFIABLE':'NOT_APPLICABLE';
    const storedFingerprint=run.config_snapshot?.source_fingerprint;
    if(run.status==='PREVIEW'&&scope!==null&&storedFingerprint?.version===2&&typeof storedFingerprint.sha256==='string') {
      const requested=(JSON.parse(scope) as {requested:string[]|null}).requested;
      const current=await capturePayrollSourceFingerprint(db,run.period_start,run.period_end,run.standard_days_snapshot===null?null:Number(run.standard_days_snapshot),requested);
      freshness=current.sha256===storedFingerprint.sha256?'CURRENT':'STALE';
    }
    // Advisory projection of the existing whole-period lock guard. The lock
    // endpoint still rechecks this under its exclusive transaction guard.
    const omittedWorkers=run.status==='PREVIEW'?(await db.query(`select w.id,w.employee_code,w.display_name,w.location_code
      from local_workers w where local_payroll_worker_eligible(w.id,$1::date,$2::date)
      and not (btrim(coalesce(w.employee_code,'')) ~* '^(HARDEN|PAYTEST)([-_ ]|$)'
        or btrim(coalesce(w.display_name,'')) ~* '^(HARDEN|PAYTEST)([-_ ]|$)')
      and not exists(select 1 from local_payroll_records r where r.run_id=$3 and r.worker_id=w.id)
      order by w.id`,[run.period_start,run.period_end,runId])).rows:[];
    const scopeGuard={status:run.status==='PREVIEW'?'CHECKED':'NOT_APPLICABLE',omitted_worker_count:omittedWorkers.length,omitted_workers:omittedWorkers};
    const previous = scope === null ? [] : (await db.query(`select id,config_snapshot from local_payroll_runs
      where period_id=$1 and calculation_version is not distinct from $2 and standard_days_snapshot is not distinct from $3::numeric
      and run_number<$4 and status in ('PREVIEW','SUPERSEDED','LOCKED') order by run_number desc,id desc`,
    [run.period_id,run.calculation_version,run.standard_days_snapshot,run.run_number])).rows;
    const baseline = previous.find(row => payrollComparisonScope(row.config_snapshot) === scope);
    const totals = (await db.query(`select count(*)::int record_count,coalesce(sum(gross_amount),0)::text gross_total,
      coalesce(sum(deductions_amount),0)::text deductions_total,coalesce(sum(net_amount),0)::text net_total,
      coalesce(sum(payment_amount),0)::text payment_total,
      (select count(*)::int from local_payroll_exceptions where run_id=$1 and severity='BLOCKING' and resolved_at is null) blocking_exception_count
      from local_payroll_records where run_id=$1`,[runId])).rows[0];
    const rows = (await db.query(`with categories as (
      select i.payroll_record_id,
        coalesce(sum(i.amount_precise) filter(where i.item_direction='EARNING' and i.item_type in ('DAY_PAY','HOURLY_PAY')),0) main_pay,
        coalesce(sum(i.amount_precise) filter(where i.item_direction='EARNING' and i.item_type in ('PIECE_RATE','OVERTIME_PAY')),0) output_overtime,
        coalesce(sum(i.amount_precise) filter(where i.item_direction='EARNING' and i.item_type not in ('DAY_PAY','HOURLY_PAY','PIECE_RATE','OVERTIME_PAY')),0) other_earnings
      from local_payroll_items i join local_payroll_records r on r.id=i.payroll_record_id where r.run_id=$1 or r.run_id=$2 group by i.payroll_record_id
    ), current_rows as (select r.*,coalesce(c.main_pay,0) main_pay,coalesce(c.output_overtime,0) output_overtime,coalesce(c.other_earnings,0) other_earnings
      from local_payroll_records r left join categories c on c.payroll_record_id=r.id where r.run_id=$1),
    previous_rows as (select r.*,coalesce(c.main_pay,0) main_pay,coalesce(c.output_overtime,0) output_overtime,coalesce(c.other_earnings,0) other_earnings
      from local_payroll_records r left join categories c on c.payroll_record_id=r.id where r.run_id=$2)
    select coalesce(c.worker_id,b.worker_id) worker_id,c.id record_id,
      case when coalesce(c.employee_identity_snapshot,b.employee_identity_snapshot) is null then w.display_name else coalesce(c.employee_identity_snapshot,b.employee_identity_snapshot)->>'display_name' end worker_name,
      case when coalesce(c.employee_identity_snapshot,b.employee_identity_snapshot) is null then w.employee_code else coalesce(c.employee_identity_snapshot,b.employee_identity_snapshot)->>'employee_code' end employee_code,
      case when coalesce(c.employee_identity_snapshot,b.employee_identity_snapshot) is null then w.location_code else coalesce(c.employee_identity_snapshot,b.employee_identity_snapshot)->>'location_code' end location_code,
      case when coalesce(c.employee_identity_snapshot,b.employee_identity_snapshot) is null then 'LEGACY_UNSNAPSHOTTED' else 'SNAPSHOT' end identity_source,
      coalesce(c.main_pay,0)::text main_pay,coalesce(c.output_overtime,0)::text output_overtime,coalesce(c.other_earnings,0)::text other_earnings,
      coalesce(c.gross_amount,0)::text gross_amount,coalesce(c.deductions_amount,0)::text deductions_amount,coalesce(c.net_amount,0)::text net_amount,coalesce(c.payment_amount,0)::text payment_amount,
      case when $2::uuid is null then null else (coalesce(c.payment_amount,0)-coalesce(b.payment_amount,0))::text end payment_delta,
      case when $2::uuid is null then 'INCOMPARABLE' when c.id is null then 'REMOVED' when b.id is null then 'ADDED'
        when row(c.main_pay,c.output_overtime,c.other_earnings,c.gross_amount,c.deductions_amount,c.net_amount,c.payment_amount) is distinct from
        row(b.main_pay,b.output_overtime,b.other_earnings,b.gross_amount,b.deductions_amount,b.net_amount,b.payment_amount) then 'CHANGED' else 'UNCHANGED' end change_status,
      coalesce(c.payment_amount<=0,false) nonpositive,
      exists(select 1 from local_payroll_exceptions e where e.run_id=$1 and e.worker_id=coalesce(c.worker_id,b.worker_id) and e.resolved_at is null) has_exception,
      c.id is not null and not exists(select 1 from local_payroll_bank_accounts a where a.worker_id=c.worker_id and a.status='VERIFIED' and a.is_primary
        and a.effective_from<=$3::date and (a.effective_to is null or a.effective_to>=$3::date)) missing_verified_bank
    from current_rows c full join previous_rows b on b.worker_id=c.worker_id join local_workers w on w.id=coalesce(c.worker_id,b.worker_id)
    order by worker_name,worker_id`,[runId,baseline?.id??null,run.period_end])).rows;
    const items = (await db.query(`select i.id,i.payroll_record_id,i.worker_id,i.item_type,i.item_direction,i.source_type,i.source_id,
      i.quantity::text,i.unit_rate::text,i.multiplier::text,i.amount_precise::text,i.formula,i.details
      from local_payroll_items i join local_payroll_records r on r.id=i.payroll_record_id where r.run_id=$1 order by i.created_at,i.item_type,i.id`,[runId])).rows;
    const exceptions = (await db.query(`select id,worker_id,severity,code,message,source_type,source_id,resolved_at
      from local_payroll_exceptions where run_id=$1 order by created_at,id`,[runId])).rows;
    await db.query('commit');
    return {run,totals,comparison:{comparable:!!baseline,previous_run_id:baseline?.id??null,reason:baseline?null:scope===null?'MISSING_SCOPE_METADATA':'NO_COMPATIBLE_PREVIOUS_RUN'},rows,items,exceptions,bank_advisory_as_of:run.period_end,freshness:{status:freshness},scope_guard:scopeGuard};
  } catch(error) { await db.query('rollback'); throw error; }
  finally {db.release();}
}
