import { preservePayrollApprovalHistory } from "./payroll-approval-history.js";
import type { Express } from 'express';
import type { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';

type Selection = { assignment_id: string; profile_id: string; rate_id?: string | null; insurance_id?: string | null };
const conflict = (message: string) => Object.assign(new Error(message), { status: 409 });
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' && !(value instanceof Date) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export async function lockPayrollWorkerConfiguration(db: Pick<PoolClient, 'query'>, worker: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended('payroll-worker-config:' || $1,0))", [worker]);
}
const components = [
  ['assignment_id', 'local_worker_compensation_assignments', 'worker_compensation_assignments'],
  ['profile_id', 'local_worker_payroll_profiles', 'worker_payroll_profiles'],
  ['rate_id', 'local_worker_rates', 'worker_rates'],
  ['insurance_id', 'local_social_insurance_versions', 'social_insurance_versions'],
] as const;
async function inspect(db: PoolClient, workerId: string, selection: Selection, includeInsurance: boolean) {
  if (!selection.assignment_id || !selection.profile_id) throw conflict('Chọn đúng bản nháp phân loại và hồ sơ nguồn cần duyệt.');
  if (selection.insurance_id && !includeInsurance) throw Object.assign(new Error('Bạn không có quyền duyệt BHXH.'), { status: 403 });
  const worker = (await db.query('select * from local_workers where id=$1 for update', [workerId])).rows[0];
  if (!worker) throw conflict('Không tìm thấy nhân sự.');
  const rows: Record<string, Record<string, unknown>> = {};
  const previous: Record<string, unknown[]> = {};
  for (const [key, table] of components) {
    const id = selection[key];
    if (!id) continue;
    const row = (await db.query(`select * from ${table} where id=$1 for update`, [id])).rows[0];
    if (!row || row.worker_id !== workerId || row.status !== 'DRAFT') throw conflict('Phiên bản không còn là bản nháp của nhân sự đã chọn. Hãy tải lại và đối chiếu.');
    rows[key] = row;
    previous[key] = (await db.query(`select * from ${table} where worker_id=$1 and status='APPROVED' order by id for update`, [workerId])).rows;
  }
  const assignment = rows.assignment_id, profile = rows.profile_id;
  if (!includeInsurance) {
    const baseline=(await db.query("select insurance_enabled from local_worker_payroll_profiles where worker_id=$1 and status='APPROVED' and effective_from<=$2::date and (effective_to is null or ($3::date is not null and effective_to>=$3::date))",[workerId,profile.effective_from,profile.effective_to])).rows;
    const overlaps=(await db.query("select id from local_worker_payroll_profiles where worker_id=$1 and status='APPROVED' and (effective_to is null or effective_to>=$2::date) and ($3::date is null or effective_from<=$3::date)",[workerId,profile.effective_from,profile.effective_to])).rows;
    if ((overlaps.length && baseline.length!==1) || profile.insurance_enabled !== (baseline[0]?.insurance_enabled===true)) throw Object.assign(new Error('Thay đổi việc áp dụng BHXH cần người có quyền bảo hiểm đối chiếu và duyệt.'),{status:403});
  }

  const group = (await db.query('select id from local_payroll_policy_groups where id=$1 and is_active',[assignment.payroll_policy_group_id])).rows[0];
  if(!group) throw conflict('Nhóm chính sách không còn hoạt động.');
  for (const row of Object.values(rows)) {
    if (String(row.effective_from) !== String(assignment.effective_from) || String(row.effective_to || '') !== String(assignment.effective_to || '')) throw conflict('Các phiên bản trong bộ phải có cùng khoảng hiệu lực.');
  }
  if (!['MONTHLY_MANAGER', 'MONTHLY_HELPER', 'HOURLY', 'PIECE_RATE'].includes(String(assignment.compensation_type))) throw conflict('Hình thức lương không hợp lệ.');
  if (assignment.compensation_type !== 'PIECE_RATE' && !rows.rate_id) throw conflict('Bộ hồ sơ thiếu phiên bản mức lương chính.');
  if (rows.rate_id && (rows.rate_id.compensation_type !== assignment.compensation_type || rows.rate_id.attendance_method !== (assignment.compensation_type === 'HOURLY' ? 'HOUR' : 'DAY'))) throw conflict('Mức lương không khớp hình thức lương.');
  if (rows.insurance_id && !profile.insurance_enabled) throw conflict('Bản BHXH được chọn nhưng hồ sơ không bật BHXH.');
  if (profile.insurance_enabled && !rows.insurance_id) {
    const coverage = (await db.query("select id from local_social_insurance_versions where worker_id=$1 and status='APPROVED' and effective_from<=$2::date and (effective_to is null or ($3::date is not null and effective_to>=$3::date))", [workerId,profile.effective_from,profile.effective_to])).rows;
    if (coverage.length!==1) throw conflict('Hồ sơ bật BHXH cần đúng một phiên bản BHXH đã duyệt bao phủ khoảng hiệu lực, hoặc chọn bản BHXH nháp cùng bộ.');
    previous.insurance_coverage = coverage;
  }
  const fingerprint = hash({ worker, rows, previous });
  return { worker, rows, previous, fingerprint };
}
export function registerPayrollBundleApproval(app: Express, pool: Pool, actor: () => string, lockSource: (db: PoolClient) => Promise<unknown>, sendError: (res: import('express').Response, error: unknown) => unknown) {
  for (const operation of ['review', 'approve'] as const) app.post(`/api/payroll/worker-profile-bundle/${operation}`, async (req, res) => {
    const db = await pool.connect();
    try {
      const workerId = String(req.body.worker_id || '');
      const selection: Selection = req.body.selection || {};
      const includeInsurance = res.locals.payrollCanInsurance === true;
      const validId=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      if (!validId(workerId)||Object.values(selection).some(value=>value!=null&&value!==''&&!validId(value))) throw conflict('Nhân sự hoặc mã phiên bản không hợp lệ.');
      const reason = String(req.body.reason || '').trim();
      const key = String(req.body.idempotency_key || '').trim();
      if (operation === 'approve' && (!reason || !key || !req.body.expected_fingerprint)) throw conflict('Cần lý do, mã yêu cầu và nội dung đã đối chiếu.');
      await db.query('begin');
      await lockSource(db);
      if (operation === 'approve') await db.query("select pg_advisory_xact_lock(hashtextextended('payroll-bundle-key:' || $1,0))", [key]);
      await lockPayrollWorkerConfiguration(db, workerId);
      const requestHash = hash({ actor: actor(), workerId, selection, reason, fingerprint: req.body.expected_fingerprint });
      if (operation === 'approve') {
        const receipt = (await db.query('select * from local_payroll_bundle_approvals where idempotency_key=$1', [key])).rows[0];
        if (receipt) {
          if (receipt.actor_id !== actor() || receipt.request_hash !== requestHash) throw conflict('Mã yêu cầu đã được sử dụng cho nội dung khác.');
          await db.query('commit'); res.json({ ...receipt.result, reused: true }); return;
        }
      }
      const reviewed = await inspect(db, workerId, selection, includeInsurance);
      if (operation === 'review') {
        await db.query('commit');
        res.json({ worker_id: workerId, selection, fingerprint: reviewed.fingerprint, components: reviewed.rows, previous: reviewed.previous }); return;
      }
      if (reviewed.fingerprint !== req.body.expected_fingerprint) throw conflict('Hồ sơ đã thay đổi sau đối chiếu. Hãy tải lại và kiểm tra mức cũ → mới.');
      for (const [field, table, entity] of components) {
        const row = reviewed.rows[field]; if (!row) continue;
        await preservePayrollApprovalHistory(db, table, String(row.id), actor(), reason);
        await db.query(`update ${table} set status='APPROVED',updated_at=now()${field === 'rate_id' ? ',local_modified_at=now()' : ',approved_by=$2,approved_at=now()'} where id=$1`, field === 'rate_id' ? [row.id] : [row.id, actor()]);
        await db.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values($1,$2,'APPROVE',$3,$4)", [entity, row.id, reason, actor()]);
      }
      const result = { worker_id: workerId, selection, fingerprint: reviewed.fingerprint, approved: true, reused: false };
      await db.query('insert into local_payroll_bundle_approvals(idempotency_key,actor_id,worker_id,request_hash,selection_hash,result) values($1,$2,$3,$4,$5,$6::jsonb)', [key, actor(), workerId, requestHash, hash(selection), JSON.stringify(result)]);
      await db.query('commit'); res.json(result);
    } catch (error) { await db.query('rollback').catch(() => undefined); sendError(res, error); }
    finally { db.release(); }
  });
}
