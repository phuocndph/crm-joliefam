import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { payrollCapability } from './permission-policy.js';
import { businessDateKey } from './business-date.js';

const forbidden = () => Object.assign(new Error('Bạn không có quyền thao tác dữ liệu lương trong phạm vi này.'), { status: 403 });
const resources: Record<string, { table: string; capability: string; worker?: boolean }> = {
  workers: { table: 'local_workers', capability: 'payroll_worker_manage', worker: true },
  'worker-methods': { table: 'local_worker_rates', capability: 'payroll_rate_manage' },
  rates: { table: 'local_worker_rates', capability: 'payroll_rate_manage' },
  'product-rates': { table: 'local_product_rates', capability: 'payroll_rate_manage' },
  'team-assignments': { table: 'local_payroll_team_assignments', capability: 'payroll_worker_manage' },
  'rule-versions': { table: 'local_payroll_rule_versions', capability: 'payroll_policy_manage' },
  'calendar-versions': { table: 'local_payroll_calendar_versions', capability: 'payroll_policy_manage' },
  'policy-groups': { table: 'local_payroll_policy_groups', capability: 'payroll_policy_manage' },
  'compensation-assignments': { table: 'local_worker_compensation_assignments', capability: 'payroll_policy_manage' },
  'worker-profiles': { table: 'local_worker_payroll_profiles', capability: 'payroll_policy_manage' },
  'worker-profile-bundle': { table: 'local_workers', capability: 'payroll_worker_manage' },
  insurance: { table: 'local_social_insurance_versions', capability: 'payroll_insurance_manage' },
  'bank-accounts': { table: 'local_payroll_bank_accounts', capability: 'payroll_bank_manage' },
  adjustments: { table: 'local_payroll_adjustments', capability: 'payroll_worker_manage' },
};

/** An explicit API boundary. Generic adapters cannot bypass this action/scope policy. */
export async function authorizePayrollRequest(req: Request, res: Response, db: Pool, actor: string, role: string, grants: ReadonlySet<string>) {
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  if (!/^\/api\/(?:payroll(?:\/|$)|workers(?:\/|$)|rates(?:\/|$)|worker-methods(?:\/|$))/.test(path)) return;
  if (path === '/api/payroll/capabilities') return;
  const read = req.method === 'GET' || req.method === 'HEAD';
  const key = path.replace(/^\/api\/(?:payroll\/)?/, '').split('/')[0];
  const can = (permission: string) => payrollCapability(role, permission, grants);
  const elevated = ['admin', 'manager', 'accountant'].includes(role);
  const manager = ['admin', 'manager'].includes(role);
  const config = resources[key];
  if (path === '/api/payroll/bank-accounts/proposal' && !can('payroll_bank_manage')) throw forbidden();
  if (['rule-versions','calendar-versions'].includes(key)) {
    if (!(read ? elevated && can('payroll_view') : manager && can('payroll_policy_manage'))) throw forbidden();
    return;
  }
  const productionRoster = read && ['/api/workers','/api/worker-methods'].includes(path)
    && ['production_view','production_manage','production_operations','production_worker_manage'].some(permission => grants.has(permission));
  if (key === 'import') {
    // Per-sheet capabilities are also validated by the import handlers. Import
    // currently supports global batches only; no employee-scoped bulk mutation.
    if (!manager && role !== 'accountant') throw forbidden();
    return;
  }
  if (['runs', 'preflight'].includes(key)) {
    // Run snapshots include period-wide totals and immutable configuration.
    // Self income is served by /my-attendance, never by the global run export.
    if (!elevated || !(read ? can('payroll_view') : can('payroll_policy_manage'))) throw forbidden();
    return;
  }
  if (!config && key !== 'products') throw forbidden();
  if (read) {
    if (['rates', 'product-rates', 'products'].includes(key)) {
      if (!can('payroll_rate_view') && !can('payroll_rate_manage')) throw forbidden();
    } else if (!productionRoster && !['insurance', 'bank-accounts'].includes(key) && !can('payroll_view') && !can('payroll_team_view') && !can('payroll_worker_manage')) throw forbidden();
  } else {
    if (!config || !can(config.capability)) throw forbidden();
    if (['compensation-assignments','worker-profiles'].includes(key) && !can('payroll_worker_manage')) throw forbidden();
    if (key === 'workers' && !manager && req.method === 'POST') throw forbidden();
    if (key === 'team-assignments' && !manager) throw forbidden();
    if (key === 'worker-profile-bundle') {
      res.locals.payrollCanInsurance = can('payroll_insurance_manage');
      if (!can('payroll_policy_manage') || !can('payroll_rate_manage')) throw forbidden();
      if (req.body.primary_amount != null && !can('payroll_rate_manage')) throw forbidden();
      if (!can('payroll_insurance_manage') && ['insurance_enabled','insurance_amount','insurance_source_reference'].some(field => Object.prototype.hasOwnProperty.call(req.body, field))) throw forbidden();
      if (req.body.selection?.insurance_id && !can('payroll_insurance_manage')) throw forbidden();
    }
  }
  // Resolve team membership on the server, never from a user-provided worker ID.
  // Managing a current master record is authorized by today's assignment, not
  // by a historical effective date supplied by the caller. Backdating a draft
  // must never restore an expired supervisor's access.
  const date = businessDateKey();
  const scope = await db.query(`select w.id,w.user_id,
    exists(select 1 from local_payroll_team_assignments a join local_workers s on s.id=a.supervisor_worker_id
      where a.worker_id=w.id and s.user_id=$1 and s.is_active and a.status='ACTIVE'
      and a.effective_from<=coalesce($2::date,current_date) and (a.effective_to is null or a.effective_to>=coalesce($2::date,current_date))) in_team
    from local_workers w`, [actor, date]);
  const own = new Set<string>(scope.rows.filter(w => w.user_id === actor).map(w => String(w.id)));
  const team = new Set<string>(scope.rows.filter(w => w.in_team).map(w => String(w.id)));
  const readable = new Set<string>(scope.rows.filter(w => elevated || own.has(w.id) || ((can('payroll_team_view') || (productionRoster && role === 'team_leader')) && team.has(w.id))).map(w => String(w.id)));
  const manageable = new Set<string>(scope.rows.filter(w => manager || (can('payroll_worker_manage') && team.has(w.id))).map(w => String(w.id)));
  const ids = [req.query.workerId, req.query.worker_id, req.body?.worker_id, req.body?.workerId].filter(Boolean).map(String);
  const suffix = path.replace(/^\/api\/(?:payroll\/)?/, '').split('/')[1];
  if (config && suffix && /^[0-9a-f-]{36}$/i.test(suffix)) {
    if (key === 'workers') ids.push(suffix);
    else if (!['policy-groups', 'product-rates'].includes(key)) {
      const row = await db.query(`select worker_id from ${config.table} where id=$1`, [suffix]);
      if (row.rows[0]) ids.push(String(row.rows[0].worker_id));
    }
  }
  const fullSensitive = key === 'insurance' ? can('payroll_insurance_manage') : key === 'bank-accounts' ? can('payroll_bank_manage') : false;
  const allowed = read ? (['insurance', 'bank-accounts'].includes(key) && !fullSensitive ? own : readable) : (manager || fullSensitive || ['rates','product-rates','policy-groups'].includes(key) ? readable : manageable);
  if (ids.some(id => !allowed.has(id))) throw forbidden();
  if (!read && !elevated && !ids.length) throw forbidden();
  if (read) {
    const json = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 400) return json(body);
      const filtered = Array.isArray(body) ? body.filter(row => {
        const worker = key === 'workers' ? row.id : row.worker_id;
        return !worker || allowed.has(String(worker));
      }).map(row => key === 'bank-accounts' && !fullSensitive ? { ...row, account_number: null } : row) : body;
      return json(filtered);
    }) as Response['json'];
  }
}
