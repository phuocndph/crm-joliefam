import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

type Queryable = Pick<PoolClient, 'query'>;
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + stable(item)).join(',') + '}';
  return JSON.stringify(value);
};

/** Mutations require the exclusive source guard. Read-only diagnostics may use a coherent REPEATABLE READ snapshot; they do not replace the mutation guard. Does not hash derived runs/events. */
export async function capturePayrollSourceFingerprint(queryable: Queryable, start: string, end: string, standardDays: number | null, workerIds: string[] | null | undefined) {
  const scope = workerIds ? [...workerIds].sort() : null;
  const sources: Record<string, unknown> = {};
  const selects: Array<[string, string]> = [
    ['workers', `select to_jsonb(t)::text value from local_workers t where local_payroll_worker_eligible(id,$1::date,$2::date) and ($3::uuid[] is null or id=any($3::uuid[])) order by id`],
    ...['local_worker_compensation_assignments','local_worker_payroll_profiles','local_worker_rates','local_social_insurance_versions'].map(table => [table, `select to_jsonb(t)::text value from ${table} t where status='APPROVED' and effective_from <= $2::date and (effective_to is null or effective_to >= $1::date) and ($3::uuid[] is null or worker_id=any($3::uuid[])) order by id`] as [string, string]),
    ['attendance', `select to_jsonb(t)::text value from local_attendance t where workflow_status in ('APPROVED','LOCKED') and not is_reversed and work_date between $1::date and $2::date and ($3::uuid[] is null or worker_id=any($3::uuid[])) order by id`],
    ['production', `select to_jsonb(t)::text value from local_production_entries t where workflow_status in ('APPROVED','LOCKED') and not is_reversed and work_date between $1::date and $2::date and ($3::uuid[] is null or worker_id=any($3::uuid[])) order by id`],
    ['overtime', `select to_jsonb(t)::text value from local_overtime t where status in ('APPROVED','LOCKED') and work_date between $1::date and $2::date and ($3::uuid[] is null or worker_id=any($3::uuid[])) order by id`],
    ['days', `select to_jsonb(t)::text value from local_day_statuses t where work_date between $1::date and $2::date and ($3::uuid[] is null or worker_id=any($3::uuid[])) order by id`],
    ['closures', `select to_jsonb(t)::text value from local_day_closures t where work_date between $1::date and $2::date and ($3::uuid[] is null or worker_id=any($3::uuid[])) order by id`],
    ['adjustments', `select to_jsonb(t)::text value from local_payroll_adjustments t join local_payroll_periods p on p.id=t.period_id where t.status='APPROVED' and p.period_start=$1::date and p.period_end=$2::date and ($3::uuid[] is null or t.worker_id=any($3::uuid[])) order by t.id`],
  ];
  for (const [key, sql] of selects) sources[key] = (await queryable.query(sql, [start, end, scope])).rows.map(row => row.value);
  for (const table of ['local_payroll_rule_versions','local_payroll_calendar_versions','local_payroll_policy_groups','local_payroll_policies','local_product_rates','local_products']) {
    const where = table === 'local_payroll_policies' || table === 'local_product_rates' ? "where status='APPROVED'" : '';
    sources[table] = (await queryable.query(`select to_jsonb(t)::text value from ${table} t ${where} order by id`)).rows.map(row => row.value);
  }
  return { version: 2, sha256: createHash('sha256').update(stable({ start, end, standardDays, scope, sources })).digest('hex') };
}

export async function resolvePayrollOvertimeRate(queryable: Queryable, workerId: string, workDate: string, compensationType: string | null) {
  const result = await queryable.query(`select r.id,r.attendance_method,
    case when r.attendance_method='HOUR' then r.rate_amount else r.rate_amount/nullif(r.standard_days_per_month,0)/nullif(r.standard_hours_per_day,0) end::numeric::text unit_rate,
    r.rate_amount::numeric::text base_rate_amount,r.standard_days_per_month::numeric::text standard_days_per_month,r.standard_hours_per_day::numeric::text standard_hours_per_day
    from local_worker_rates r where r.worker_id=$1 and r.status='APPROVED' and r.effective_from <= $2::date and (r.effective_to is null or r.effective_to >= $2::date)
    and (r.attendance_method='HOUR' or (r.attendance_method='DAY' and $3::text in ('MONTHLY_MANAGER','MONTHLY_HELPER')))`, [workerId, workDate, compensationType]);
  const hourly = result.rows.filter(row => row.attendance_method === 'HOUR');
  const winners = hourly.length ? hourly : result.rows;
  return winners.length === 1 && Number(winners[0].unit_rate) > 0 ? winners[0] : null;
}
