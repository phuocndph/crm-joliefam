export type ExactPayrollRow = {
  worker_id:string;record_id:string|null;worker_name:string;employee_code:string;location_code:string|null;identity_source:string;
  main_pay:string;output_overtime:string;other_earnings:string;gross_amount:string;deductions_amount:string;net_amount:string;payment_amount:string;payment_delta:string|null;
  change_status:'INCOMPARABLE'|'CHANGED'|'UNCHANGED'|'ADDED'|'REMOVED';nonpositive:boolean;has_exception:boolean;missing_verified_bank:boolean;
};
export type PayrollReconciliation = {
  run:Record<string,unknown>;totals:{record_count:number;gross_total:string;deductions_total:string;net_total:string;payment_total:string;blocking_exception_count:number};
  comparison:{comparable:boolean;previous_run_id:string|null;reason:string|null};rows:ExactPayrollRow[];items:Record<string,unknown>[];exceptions:Record<string,unknown>[];bank_advisory_as_of:string;freshness:{status:'CURRENT'|'STALE'|'UNVERIFIABLE'|'NOT_APPLICABLE'};
  scope_guard:{status:'CHECKED'|'NOT_APPLICABLE';omitted_worker_count:number;omitted_workers:Array<{id:string;employee_code:string;display_name:string;location_code:string|null}>};
};
/** Format the server's decimal string without a lossy floating-point conversion. */
export function formatPayrollDecimal(value:unknown):string {
  const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value??''));
  if(!match)return '—';
  const fraction=(match[3]||'').replace(/0+$/,'');
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')}${fraction?','+fraction:''}`;
}
export function canonicalPayrollScope(config:unknown):{requested:string[]|null;resolved:string[]}|null {
  const scope=(config as {worker_scope?:Record<string,unknown>}|null)?.worker_scope;
  const valid=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if(!scope||!Object.prototype.hasOwnProperty.call(scope,'requested_worker_ids')||!(scope.requested_worker_ids===null||valid(scope.requested_worker_ids))||!valid(scope.resolved_worker_ids))return null;
  const sort=(ids:string[])=>[...new Set(ids.map(id=>id.toLowerCase()))].sort();
  return {requested:scope.requested_worker_ids===null?null:sort(scope.requested_worker_ids as string[]),resolved:sort(scope.resolved_worker_ids)};
}

type Issue=Record<string,unknown>;
export function payrollIssueTarget(issue:Issue):string {
  if(issue.resolution_target)return String(issue.resolution_target);
  const code=String(issue.code);
  if(['MISSING_ASSIGNMENT','MISSING_POLICY_GROUP','MISSING_PAYROLL_PROFILE','MISSING_PRIMARY_RATE','MISSING_OVERTIME_RATE','MISSING_INSURANCE'].includes(code))return 'WORKER';
  if(['PAYROLL_CALENDAR','MISSING_MEAL_POLICY','PAYROLL_V3_CONFIG'].includes(code))return 'POLICY';
  if(code==='UNAPPROVED_ADJUSTMENT')return 'ADJUSTMENT';
  if(['UNAPPROVED_ATTENDANCE','UNAPPROVED_PRODUCTION','UNAPPROVED_OVERTIME','LEGACY_OUTPUT_ATTENDANCE_SOURCE','INVALID_ATTENDANCE_SNAPSHOT','MISSING_PRODUCTION_RATE_SNAPSHOT'].includes(code))return 'SOURCE';
  return 'REVIEW';
}
export const payrollIssueKey=(row:Issue)=>[row.code,row.worker_id,row.source_type,row.source_id,row.source_date,row.location_code,payrollIssueTarget(row)].join('|');
export function mergePayrollIssues(issues:Issue[],lockIssues:Issue[]):Issue[]{return [...new Map([...issues,...lockIssues].map(row=>[payrollIssueKey(row),row])).values()];}
export function payrollSourceDate(value:unknown,month:string):string|undefined {
  const date=String(value||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==month)return undefined;
  const parsed=new Date(date+'T12:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:undefined;
}
export function payrollIssueLink(issue:Issue,context:URLSearchParams):string {
  const month=context.get('month')||'',location=context.get('location')||'ALL',target=payrollIssueTarget(issue);
  const next=new URLSearchParams();next.set('month',month);
  next.set('location',Object.prototype.hasOwnProperty.call(issue,'location_code')?String(issue.location_code||'__UNASSIGNED__'):location);
  if(issue.worker_id)next.set('worker',String(issue.worker_id));
  if(target==='SOURCE') {
    const date=payrollSourceDate(issue.source_date,month);if(date)next.set('date',date);
    const back=new URLSearchParams(context);back.set('tab','runs');back.set('month',month);back.set('location',location);
    next.set('returnTo','/payroll-settings?'+back.toString());return '/production-attendance?'+next;
  }
  next.set('tab',target==='WORKER'?'workers':target==='POLICY'?'policies':target==='ADJUSTMENT'?'adjustments':'runs');
  if(issue.code==='PAYROLL_CALENDAR')next.set('editor','calendar');
  return '/payroll-settings?'+next;
}
