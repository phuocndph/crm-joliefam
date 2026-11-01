/* eslint-disable @typescript-eslint/no-explicit-any */
import type express from 'express';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { pool } from './db/bootstrap.js';
import { cuttingRequirementForOutput } from './production-sales-workflow.js';
import {projectedProductionImages} from './production-reference-images.js';
import {cuttingScope} from './production-uncut-cancellations.js';
import {resolveDispatchLabor,validateDispatchLabor,publicLaborAssignment} from './dispatch-labor.js';
import {codeKey} from './product-labor-resolver.js';
import {listRuntimePieceRates,loadEffectiveApprovedProductRates,selectRuntimePieceRate} from './product-rate-consumption.js';

type Body = Record<string, unknown>;
type Row = Record<string, any>;
interface Dependencies {
  actor: () => string;
  role: () => string;
  transaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  lockShared: (client: PoolClient) => Promise<void>;
  lockRateConfigShared: (client: PoolClient) => Promise<void>;
  sendError: (res: express.Response, error: unknown) => void;
  lockDay: (client: PoolClient, worker: string, date: string) => Promise<void>;
  writable: (client: PoolClient, worker: string, date: string, status: string) => Promise<void>;
  dayAllowsWork: (client: PoolClient, worker: string, date: string, action: string) => Promise<void>;
  reviewScope: (client: PoolClient, worker: string, date: string) => Promise<void>;
  createEntry: (body: Body, worker: string | undefined, client: PoolClient) => Promise<{ id: unknown }>;
  workflowEvent: (client: PoolClient, type: string, id: string, action: string, from: string | null, to: string | null, reason: string | null, key: string) => Promise<void>;
}
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const quantity = (value: unknown, zero = false) => {
  const text = String(value ?? (zero ? 0 : ''));
  if (!/^\d+(\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) > 9999999999.99 || (zero ? Number(text) < 0 : Number(text) <= 0))
    fail('Số lượng phải hợp lệ, tối đa 2 chữ số thập phân và lớn hơn 0.');
  return text;
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const productionStages = ['CUTTING','SEWING','FINISHING','COUNTING'];
export const productionStageWorkers: Record<string,string[]> = {CUTTING:['CUTTER'],SEWING:['SEWER','SEWING'],FINISHING:['IRONING'],COUNTING:['QC','PACKER']};
export const productionPredecessor: Record<string,string> = {SEWING:'CUTTING',FINISHING:'SEWING',COUNTING:'FINISHING'};
const workDate = (value: unknown) => {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > today()) fail('Ngày làm không hợp lệ hoặc ở tương lai.');
  return date;
};

// Call only after the shared payroll guard and the parent order row are locked.
// All assignment/report writers take that same lock, so settlement cannot race.
export async function assertProductionDispatchSettled(client: PoolClient, orderId: string, batchId?: string) {
  const pending = await client.query(`select 1 from local_assignments a
    where a.production_order_id=$1 and ($2::uuid is null or a.production_batch_id=$2)
    and a.dispatch_stage is not null and (
      a.dispatch_status='PENDING' or
      (a.dispatch_status='ACCEPTED' and a.accepted_quantity-a.returned_quantity-
        coalesce((select sum(quantity_received) from local_production_stage_events e where e.assignment_id=a.id and e.source_stage_event_id is null and e.status in ('SUBMITTED','APPROVED','LOCKED')),0)>0) or
      exists(select 1 from local_production_stage_events e where e.assignment_id=a.id and e.status='SUBMITTED')) limit 1`, [orderId, batchId || null]);
  if (pending.rows[0]) fail('Còn việc chưa nhận, chưa trả hoặc báo cáo chưa được duyệt; chưa thể chốt.', 409);
  const publication = await client.query(`select 1 from local_production_job_publications p where p.production_order_id=$1
    and ($2::uuid is null or p.production_batch_id=$2) and p.status='OPEN'
    and p.quantity>coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity)
      from local_assignments a where a.publication_id=p.id and a.dispatch_status<>'REJECTED'),0) limit 1`, [orderId, batchId || null]);
  if (publication.rows[0]) fail('Còn công việc công khai chưa nhận hết; hãy đóng hoặc hủy trước khi chốt.', 409);
}

export function registerProductionDispatch(app: express.Express, d: Dependencies) {
  async function permission(client: PoolClient, capabilities: string[]) {
    if (['admin', 'manager'].includes(d.role())) return;
    const allowed = await client.query('select 1 from local_employee_permissions where user_id=$1 and permission_type=any($2::text[]) and enabled limit 1', [d.actor(), capabilities]);
    if (!allowed.rows[0]) fail('Tài khoản chưa được cấp quyền thực hiện giao việc sản xuất.', 403);
  }
  async function manager(client: PoolClient) {
    if (d.role() === 'employee') fail('Nhân viên không được phân công hoặc duyệt công việc.', 403);
    await permission(client, ['production_manage', 'production_operations']);
  }
  async function scope(client: PoolClient, worker: string, date: string, review = false) {
    const own = await client.query('select 1 from local_workers where id=$1 and user_id=$2 and is_active', [worker, d.actor()]);
    if (d.role() === 'employee') { if (!own.rows[0] || review) fail('Chỉ được thao tác công việc của chính mình.', 403); return; }
    if (d.role() === 'team_leader') {
      if (own.rows[0] && !review) return;
      await d.reviewScope(client, worker, date);
    }
  }
  async function lockParent(client: PoolClient, orderId: string, batchId?: string, correction = false) {
    const order = (await client.query('select * from local_production_orders where id=$1 for update', [orderId])).rows[0];
    if (!order) fail('Không tìm thấy lệnh sản xuất.', 404);
    if (!(correction ? ['RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] : ['RELEASED', 'IN_PROGRESS']).includes(order.status)) fail('Lệnh phải được phát hành và không tạm dừng, hủy hoặc hoàn thành.');
    if (!batchId) return { order, batch: null as Row | null };
    const batch = (await client.query('select * from local_production_batches where id=$1 and production_order_id=$2 for update', [batchId, orderId])).rows[0];
    if (!batch || !(correction ? ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] : ['PLANNED', 'IN_PROGRESS']).includes(batch.status)) fail('Lô không thuộc lệnh hoặc đã dừng/hoàn thành.');
    return { order, batch };
  }
  async function assignment(client: PoolClient, id: string, correction = false) {
    const pointer = (await client.query('select production_order_id,production_batch_id from local_assignments where id=$1 and dispatch_stage is not null', [id])).rows[0];
    if (!pointer) fail('Không tìm thấy việc được giao.', 404);
    await lockParent(client, pointer.production_order_id, pointer.production_batch_id, correction);
    return (await client.query('select * from local_assignments where id=$1 for update', [id])).rows[0] as Row;
  }
  async function audit(client: PoolClient, order: string, action: string, row: Row, body: Body, qty?: string) {
    await client.query('insert into local_dispatch_audit_events(production_order_id,assignment_id,stage_event_id,action,quantity,reason,actor_id,data) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [order, row.assignment_id || (row.dispatch_stage ? row.id : null), row.assignment_id ? row.id : null, action, qty || null, body.reason || body.notes || null, d.actor(), JSON.stringify(row)]);
  }
  async function mutate(action: string, body: Body, fn: (client: PoolClient, key: string) => Promise<Row>) {
    const key = String(body.idempotency_key || body.idempotencyKey || '').trim();
    if (!key || key.length > 200) fail('Cần khóa chống gửi trùng cho thao tác.');
    const fingerprint = createHash('sha256').update(JSON.stringify({ action, body })).digest('hex');
    return d.transaction(async (client) => {
      await d.lockShared(client);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`production-dispatch:${key}`]);
      const replay = (await client.query('select * from local_dispatch_requests where idempotency_key=$1', [key])).rows[0];
      if (replay) {
        if (replay.actor_id !== d.actor() || replay.fingerprint !== fingerprint) fail('Khóa chống gửi trùng đã dùng cho tài khoản hoặc nội dung khác.', 409);
        if(action==='ASSIGN'||action==='PUBLISH'||action.startsWith('RECONCILE_LABOR'))await manager(client);
        if(replay.result.worker_id)await scope(client,String(replay.result.worker_id),String(replay.result.work_date||replay.result.assigned_from||today()),action.startsWith('review:')||action.startsWith('reverse:'));
        if(action.startsWith('review:')||action.startsWith('reverse:'))await permission(client,['production_manage','production_attendance_approve']);
        return { ...publicLaborAssignment(replay.result), reused: true };
      }
      // New dispatch writers take configuration before parent/assignment/day
      // locks. Replay deliberately returns above without recalculating prices.
      await d.lockRateConfigShared(client);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended('labor-mapping-writer',0))");
      const result = await fn(client, key);
      await client.query('insert into local_dispatch_requests(idempotency_key,actor_id,fingerprint,result) values($1,$2,$3,$4::jsonb)', [key, d.actor(), fingerprint, JSON.stringify(result)]);
      return result.labor_basis?publicLaborAssignment(result):result;
    });
  }
  async function consumption(client: PoolClient, id: string) {
    return String((await client.query("select coalesce(sum(quantity_received),0) qty from local_production_stage_events where assignment_id=$1 and source_stage_event_id is null and status in ('SUBMITTED','APPROVED','LOCKED')", [id])).rows[0].qty);
  }
  async function available(client: PoolClient, batchId: string, stage: string, itemId?: string,ticketId?: string) {
    if(ticketId){
      const ticket=(await client.query('select * from local_production_repair_tickets where id=$1 and production_batch_id=$2 and order_item_id=$3',[ticketId,batchId,itemId])).rows[0];
      if(!ticket||productionStages.indexOf(stage)<productionStages.indexOf(ticket.target_stage)||productionStages.indexOf(stage)>productionStages.indexOf(ticket.return_stage))fail('Công đoạn không thuộc phiếu trả sửa.',409);
      return (await client.query(`select case when $2=$3 then $4::numeric else (select coalesce(sum(e.quantity_good),0) from local_production_stage_events e join local_assignments a on a.id=e.assignment_id where a.repair_ticket_id=$1 and e.stage=$5 and e.status in ('APPROVED','LOCKED')) end capacity,
       (select coalesce(sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity),0) from local_assignments a where a.repair_ticket_id=$1 and a.dispatch_stage=$2 and a.dispatch_status<>'REJECTED') reserved`,[ticketId,stage,ticket.target_stage,ticket.quantity,productionPredecessor[stage]])).rows[0];
    }
    const result = await client.query(`select
      case when $2='CUTTING' then least(b.planned_quantity,coalesce(i.planned_quantity,b.planned_quantity))-coalesce((select sum(quantity) from local_production_uncut_cancellations c where c.production_batch_id=b.id and ($3::uuid is null or c.order_item_id=$3)),0) else (select coalesce(sum(quantity_good),0) from local_production_effective_stage_good e where e.production_batch_id=b.id and e.stage=$4 and ($3::uuid is null or e.order_item_id=$3)) end capacity,
      (select coalesce(sum(coalesce(accepted_quantity,allocated_quantity)-returned_quantity),0) from local_assignments a where a.production_batch_id=b.id and a.repair_ticket_id is null and ($3::uuid is null or a.order_item_id=$3) and a.dispatch_stage=$2 and a.dispatch_status<>'REJECTED') reserved
      from local_production_batches b left join local_production_order_items i on i.id=$3 and i.production_order_id=b.production_order_id where b.id=$1`, [batchId, stage,itemId||null,productionPredecessor[stage]||null]);
    return result.rows[0] as Row;
  }
  async function openPublicationQuantity(client: PoolClient, batchId: string, stage: string,itemId?: string,ticketId?: string) {
    return String((await client.query(`select coalesce(sum(p.quantity-coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity)
      from local_assignments a where a.publication_id=p.id and a.dispatch_status<>'REJECTED'),0)),0) quantity
      from local_production_job_publications p where p.production_batch_id=$1 and p.stage=$2 and ($3::uuid is null or p.order_item_id=$3) and p.repair_ticket_id is not distinct from $4::uuid and p.status='OPEN'`, [batchId, stage,itemId||null,ticketId||null])).rows[0].quantity);
  }
  async function workerForStage(client: PoolClient, workerId: string, stage: string) {
    const worker = (await client.query('select * from local_workers where id=$1 and is_active for share', [workerId])).rows[0];
    if (!worker) fail('Nhân sự không còn hoạt động.');
    if (!(productionStageWorkers[stage]||[]).includes(String(worker.worker_type || '').trim().toUpperCase())) fail('Loại nhân sự không phù hợp với công đoạn được giao.',409);
    return worker as Row;
  }
  async function cuttingPlanCapacity(client:PoolClient,orderId:string,batchId:string,itemId:string|undefined,add:string){
    const cap=await available(client,batchId,'CUTTING');const open=await openPublicationQuantity(client,batchId,'CUTTING');
    if((await client.query('select $1::numeric+$2::numeric+$3::numeric>$4::numeric exceeds',[cap.reserved,open,add,cap.capacity])).rows[0].exceeds)fail('Tổng giao cắt các dòng vượt kế hoạch lô sau hủy phần chưa cắt.',409);
    if(!itemId)return;
    const item=(await client.query(`select i.planned_quantity,
      (select coalesce(sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity),0) from local_assignments a where a.production_order_id=$1 and a.order_item_id=$2 and a.dispatch_stage='CUTTING' and a.dispatch_status<>'REJECTED') reserved,
      (select coalesce(sum(p.quantity-coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity) from local_assignments a where a.publication_id=p.id and a.dispatch_status<>'REJECTED'),0)),0) from local_production_job_publications p where p.production_order_id=$1 and p.order_item_id=$2 and p.stage='CUTTING' and p.status='OPEN') open
      from local_production_order_items i where i.id=$2 and i.production_order_id=$1`,[orderId,itemId])).rows[0];
    const cancelled=await cuttingScope(client,orderId,null,itemId);
    if(!item||(await client.query('select $1::numeric+$2::numeric+$3::numeric+$5::numeric>$4::numeric exceeds',[item.reserved,item.open,add,item.planned_quantity,cancelled.cancelled])).rows[0].exceeds)fail('Tổng giao cắt qua các lô vượt kế hoạch dòng sản phẩm sau hủy.',409);
  }
  async function cuttingGate(client: PoolClient, orderId: string, batchId: string, requiredQuantity: string) {
    const order = (await client.query('select workflow_generation from local_production_orders where id=$1', [orderId])).rows[0];
    if (!order || !['WORKFLOW_V2','WORKFLOW_V3'].includes(order.workflow_generation)) return;
    const estimate = (await client.query("select * from local_cutting_estimates where production_order_id=$1 and production_batch_id=$2 and estimate_kind='BASE' and status='APPROVED' for share", [orderId, batchId])).rows[0];
    if (!estimate) fail('Lô chưa có dự toán cắt được duyệt.', 409);
    if (estimate.no_material_required) return;
    const lines = (await client.query("select * from local_cutting_estimate_lines where estimate_id=$1", [estimate.id])).rows;
    for (const line of lines) {
      const required = cuttingRequirementForOutput(line, requiredQuantity);
      const issued = (await client.query(`select coalesce(-sum(m.quantity_delta),0) quantity from local_inventory_movements m
        join local_inventory_documents d on d.id=m.document_id and d.status='CONFIRMED' where m.cutting_estimate_line_id=$1`, [line.id])).rows[0].quantity;
      if ((await client.query("select $1::numeric<$2::numeric insufficient", [issued, required])).rows[0].insufficient) fail('Vật tư đã xuất ròng chưa đủ cho số lượng cắt này.', 409);
    }
  }
  // These handlers run before legacy production endpoints. Linked reports and
  // payroll entries cannot bypass dispatch capacity, approval or reversal checks.
  app.use(async (req, res, next) => {
    const normalizedPath = req.path.toLowerCase().replace(/\/+$/, '') || '/';
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || normalizedPath.startsWith('/api/production-dispatch')) return next();
    try {
      // Resolve old mutation aliases before any legacy handler can execute.
      if (normalizedPath.startsWith('/api/legacy-production-orders')) {
        const suffix = normalizedPath.slice('/api/legacy-production-orders'.length);
        req.url = `/api/production-orders${suffix === '/group' ? '/groups' : suffix.replace(/\/status$/, '/transition')}`;
      }
      const cuttingEstimateCreate = /^\/api\/production-orders\/[^/]+\/cutting-estimates$/.test(normalizedPath);
      if (!cuttingEstimateCreate && /^\/api\/(?:legacy-)?production-orders(?:\/|$)|^\/api\/production-batches\//.test(normalizedPath)) {
        const capability = normalizedPath.endsWith('/release') ? 'production_release' : normalizedPath.endsWith('/complete') ? 'production_complete' : 'production_manage';
        await permission(awaitClientProxy(), [capability]);
        if (d.role() === 'employee') fail('Nhân viên không được quản lý lệnh sản xuất.', 403);
      }
      if (/^\/api\/production-operations\//.test(normalizedPath) || ['/api/production/scrap', '/api/production/rework'].includes(normalizedPath)) await manager(awaitClientProxy());
      if (normalizedPath === '/api/production/entries' && (req.body.source_stage_event_id || req.body.assignment_id || req.body.production_batch_id)) fail('Liên kết giao việc chỉ được tạo qua báo cáo được duyệt.', 409);
      if (normalizedPath === '/api/production-stage-events') {
        await manager(awaitClientProxy());
        const stage = String(req.body.stage || '').trim().toUpperCase();
        if((await pool.query("select 1 from local_production_orders where id=$1 and workflow_generation='WORKFLOW_V3'",[req.body.production_order_id])).rows[0])fail('Lệnh mới chỉ ghi công đoạn qua công việc đã giao.',409);
        if (productionStages.includes(stage)) fail('Công đoạn cần được báo cáo từ việc được giao.');
        req.body.stage = stage;
        await lockParentRead(req.body.production_order_id, req.body.production_batch_id);
      }
      const stageMatch = normalizedPath.match(/^\/api\/production-stage-events\/([^/]+)\/(status|reverse)$/);
      if (stageMatch) {
        await manager(awaitClientProxy());
        const row = (await pool.query('select assignment_id,production_order_id,production_batch_id from local_production_stage_events where id=$1', [stageMatch[1]])).rows[0];
        if (row?.assignment_id) fail('Báo cáo giao việc phải duyệt hoặc đảo tại mục Giao việc.');
        if (row) await lockParentRead(row.production_order_id, row.production_batch_id);
        if (req.body.target_status === 'LOCKED') fail('Chỉ kỳ lương mới được khóa số liệu.');
      }
      const entryStatus = normalizedPath === '/api/production/entries/status' ? String(req.body.production_entry_id || '') : (normalizedPath.match(/^\/api\/production\/entries\/([^/]+)\/reverse$/)?.[1] || '');
      if (entryStatus) {
        const linked = (await pool.query('select source_stage_event_id from local_production_entries where id=$1', [entryStatus])).rows[0];
        if (linked?.source_stage_event_id) fail('Bản ghi tiền lương gắn giao việc phải xử lý tại mục Giao việc.', 409);
      }
      const oldAssignment = normalizedPath.match(/^\/api\/production-attendance\/assignments\/([^/]+)$/);
      if (oldAssignment && (await pool.query('select 1 from local_assignments where id=$1 and dispatch_stage is not null', [oldAssignment[1]])).rows[0]) fail('Việc có định lượng cần trả lại phần chưa làm tại mục Giao việc.');
      next();
    } catch (error) { d.sendError(res, error); }
  });
  function awaitClientProxy() { return pool as unknown as PoolClient; }
  async function lockParentRead(order: string, batch: string) { await d.transaction(async (client) => { await d.lockShared(client); return lockParent(client, order, batch); }); }

  const read = async (req: express.Request, self: boolean) => {
    if(self&&(await pool.query('select id from local_workers where user_id=$1 and is_active',[d.actor()])).rowCount!==1)fail('Tài khoản cần liên kết đúng một hồ sơ nhân sự đang hoạt động.',409);
    if (!self) await permission(awaitClientProxy(), ['production_view', 'production_manage', 'production_operations']);
    const params: unknown[] = self ? [d.actor()] : [String(req.query.orderId || '')];
    let clause = self ? 'w.user_id=$1 and w.is_active' : 'a.production_order_id=$1';
    if (!self && d.role() === 'employee') fail('Dùng mục Việc được giao để xem công việc của mình.', 403);
    if (!self && d.role() === 'team_leader') {
      params.push(d.actor());
      clause += ` and exists(select 1 from local_payroll_team_assignments t join local_workers s on s.id=t.supervisor_worker_id where s.user_id=$2 and s.is_active and t.worker_id=a.worker_id and t.status='ACTIVE' and t.effective_from<=a.assigned_from and (t.effective_to is null or t.effective_to>=a.assigned_from))`;
    }
    const assignments = (await pool.query(`select a.*,w.user_id=$${params.length+1} own_assignment,w.employee_code,w.display_name worker_name,o.production_order_number,o.status order_status,o.dispatch_priority,o.dispatch_reference,o.dispatch_notes,b.batch_number,b.status batch_status,
      (select sum(l.estimated_quantity) from local_cutting_estimate_lines l join local_cutting_estimates ce on ce.id=l.estimate_id and ce.status='APPROVED' and ce.estimate_kind='BASE' join local_inventory_items fi on fi.id=l.inventory_item_id and fi.base_unit='METER' where ce.production_batch_id=b.id and l.order_item_id=a.order_item_id) fabric_estimated_m,
      (select -sum(m.quantity_delta) from local_inventory_movements m join local_cutting_estimate_lines l on l.id=m.cutting_estimate_line_id join local_cutting_estimates ce on ce.id=l.estimate_id and ce.status='APPROVED' and ce.estimate_kind='BASE' join local_inventory_items fi on fi.id=l.inventory_item_id and fi.base_unit='METER' where ce.production_batch_id=b.id and l.order_item_id=a.order_item_id) fabric_issued_m,
      coalesce(i.product_name,p.name) product_name,coalesce(i.product_sku,p.sku) product_sku,i.fabric_variant_id,i.color,i.size,i.dimensions,i.notes product_notes,i.reference_images,
      coalesce(c.consumed,0) consumed_quantity,greatest(coalesce(a.accepted_quantity,0)-a.returned_quantity-coalesce(c.consumed,0),0) remaining_quantity
      from local_assignments a join local_workers w on w.id=a.worker_id join local_production_orders o on o.id=a.production_order_id join local_production_batches b on b.id=a.production_batch_id
      left join local_production_order_items i on i.id=coalesce(a.order_item_id,(select id from local_production_order_items where production_order_id=o.id order by created_at,id limit 1)) left join local_products p on p.id=o.product_id
      left join lateral (select sum(quantity_received) consumed from local_production_stage_events where assignment_id=a.id and source_stage_event_id is null and status in ('SUBMITTED','APPROVED','LOCKED')) c on true
      where a.dispatch_stage is not null and ${clause} order by a.created_at desc`, [...params,d.actor()])).rows;
    const ids = assignments.map((a: Row) => a.id);
    const reports = (await pool.query('select e.*,w.display_name worker_name,a.piece_rate_code from local_production_stage_events e join local_assignments a on a.id=e.assignment_id join local_workers w on w.id=e.worker_id where e.assignment_id=any($1::uuid[]) order by e.created_at desc', [ids])).rows;
    const order = self ? null : (await pool.query('select * from local_production_orders where id=$1', params.slice(0, 1))).rows[0];
    const batches = self ? [] : (await pool.query(`select b.*,
      coalesce((select sum(e.quantity_good) from local_production_stage_events e where e.production_batch_id=b.id and e.assignment_id is not null and e.stage='CUTTING' and e.status in ('APPROVED','LOCKED')),0) cutting_good,
      coalesce((select sum(e.quantity_good) from local_production_stage_events e where e.production_batch_id=b.id and e.assignment_id is not null and e.stage='SEWING' and e.status in ('APPROVED','LOCKED')),0) sewing_good,
      coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity) from local_assignments a where a.production_batch_id=b.id and a.dispatch_stage='CUTTING' and a.dispatch_status<>'REJECTED'),0) cutting_reserved,
      coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity) from local_assignments a where a.production_batch_id=b.id and a.dispatch_stage='SEWING' and a.dispatch_status<>'REJECTED'),0) sewing_reserved
      from local_production_batches b where b.production_order_id=$1 order by b.created_at`, params.slice(0, 1))).rows;
    const publications = self ? (await pool.query(`select p.*,o.production_order_number,o.dispatch_notes,b.batch_number,i.product_name,i.product_sku,i.color,i.size,i.dimensions,i.notes product_notes,i.reference_images,
      coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity) from local_assignments a where a.publication_id=p.id and a.dispatch_status<>'REJECTED'),0) claimed_quantity
      from local_production_job_publications p join local_production_orders o on o.id=p.production_order_id join local_production_batches b on b.id=p.production_batch_id join local_production_order_items i on i.id=p.order_item_id
      join local_workers w on w.user_id=$1 and w.is_active where p.status='OPEN' and p.assigned_from<=current_date and (p.assigned_to is null or p.assigned_to>=current_date)
      and ((p.stage='CUTTING' and upper(w.worker_type)='CUTTER') or (p.stage='SEWING' and upper(w.worker_type) in ('SEWER','SEWING')) or (p.stage='FINISHING' and upper(w.worker_type)='IRONING') or (p.stage='COUNTING' and upper(w.worker_type) in ('QC','PACKER')))
      and (p.eligible_supervisor_worker_id is null or exists(select 1 from local_payroll_team_assignments t where t.supervisor_worker_id=p.eligible_supervisor_worker_id and t.worker_id=w.id and t.status='ACTIVE' and t.effective_from<=current_date and (t.effective_to is null or t.effective_to>=current_date))) order by p.created_at desc`, [d.actor()])).rows : (await pool.query(`select p.*,coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity) from local_assignments a where a.publication_id=p.id and a.dispatch_status<>'REJECTED'),0) claimed_quantity from local_production_job_publications p where p.production_order_id=$1 order by p.created_at desc`, params.slice(0,1))).rows;
    for(const row of [...assignments,...publications]){row.reference_images=projectedProductionImages(row.reference_images);row.labor_basis_status=row.repair_ticket_id?'NON_PAYABLE':row.labor_basis?'PINNED':'RECONCILIATION_REQUIRED';delete row.labor_basis;}
    const materialTargets=[...assignments.filter(a=>a.dispatch_stage==='CUTTING'),...publications.filter(p=>p.stage==='CUTTING')];
    for(const target of materialTargets){
      target.no_material_required=Boolean((await pool.query("select 1 from local_cutting_estimates where production_order_id=$1 and production_batch_id=$2 and estimate_kind='BASE' and status='APPROVED' and no_material_required",[target.production_order_id,target.production_batch_id])).rows[0]);
      target.materials=(await pool.query(`select ce.id estimate_id,l.id estimate_line_id,ce.estimate_kind,i.code inventory_item_code,i.name inventory_item_name,w.name warehouse_name,
        coalesce(v.variant_name,s.payload->>'variant_name') variant_name,coalesce(v.color,s.payload->>'color') color,coalesce(v.width_code,s.payload->>'width_code') width_code,i.base_unit unit,l.estimated_quantity,
        coalesce((select -sum(m.quantity_delta) from local_inventory_movements m where m.cutting_estimate_line_id=l.id and m.quantity_delta<0),0) issued_quantity,
        coalesce((select sum(m.quantity_delta) from local_inventory_movements m where m.cutting_estimate_line_id=l.id and m.quantity_delta>0),0) returned_quantity
        from local_cutting_estimates ce join local_cutting_estimate_lines l on l.estimate_id=ce.id join local_inventory_items i on i.id=l.inventory_item_id join local_inventory_warehouses w on w.id=l.warehouse_id
        left join local_fabric_variants v on v.id=l.fabric_variant_id::text
        left join local_source_snapshots s on s.source='SUPABASE' and s.source_table='fabric_variants' and s.source_key=l.fabric_variant_id::text and not s.is_deleted
        where ce.production_order_id=$1 and ce.production_batch_id=$2 and l.order_item_id=$3 and ce.status='APPROVED' order by ce.created_at,l.id`,[target.production_order_id,target.production_batch_id,target.order_item_id])).rows;
    }
    const auditRows = self || d.role() === 'team_leader' ? (await pool.query('select * from local_dispatch_audit_events where assignment_id=any($1::uuid[]) order by created_at desc limit 500', [ids])).rows : (await pool.query('select * from local_dispatch_audit_events where production_order_id=$1 order by created_at desc limit 500', params.slice(0, 1))).rows;
    for(const batch of batches)batch.cancelled_uncut=(await cuttingScope(pool,String(order?.id||''),batch.id,null)).cancelled;
    return { order, assignments, reports, batches, publications, audit: auditRows, progress: batches.map((b: Row) => ({ batch_id: b.id, cutting_available: Number(b.planned_quantity)-Number(b.cancelled_uncut) - Number(b.cutting_reserved), sewing_available: Number(b.cutting_good) - Number(b.sewing_reserved) })) };
  };
  app.get('/api/production-dispatch', async (req, res) => { try { res.json(await read(req, false)); } catch (error) { d.sendError(res, error); } });
  app.get('/api/production-dispatch/mine', async (req, res) => { try { res.json(await read(req, true)); } catch (error) { d.sendError(res, error); } });
  app.get('/api/production-dispatch/review-queue',async(req,res)=>{try{
    const client=awaitClientProxy();
    if(d.role()==='employee')fail('Nhân viên không được duyệt báo cáo.',403);
    await permission(client,['production_manage','production_attendance_approve']);
    // Mirrors assertLocalReviewScope's additional team-leader permission, own
    // worker exclusion and effective-date policy. Scope must precede pagination.
    if(d.role()==='team_leader')await permission(client,['production_attendance_approve']);
    const rawLimit=String(req.query.limit??'50'),cursor=String(req.query.cursor||'');
    if(!/^\d{1,3}$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>100)fail('Giới hạn trang phải từ 1 đến 100.');
    if(cursor&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor))fail('Vị trí phân trang không hợp lệ.');
    const limit=Number(rawLimit),team=d.role()==='team_leader';
    const scopeSql=team?`and not exists(select 1 from local_workers own_worker where own_worker.id=e.worker_id and own_worker.user_id=$1)
      and exists(select 1 from local_payroll_team_assignments t join local_workers supervisor on supervisor.id=t.supervisor_worker_id where supervisor.user_id=$1 and supervisor.is_active and t.worker_id=e.worker_id and t.status='ACTIVE' and t.effective_from<=e.work_date and (t.effective_to is null or t.effective_to>=e.work_date))`:'';
    const result=(await pool.query(`with authorized as (
      select e.id,
        jsonb_build_object('id',e.id,'assignment_id',e.assignment_id,'worker_name',w.display_name,'stage',e.stage,'work_date',e.work_date::text,'quantity_good',e.quantity_good,'status',e.status,'created_by',e.created_by) report,
        jsonb_build_object('id',a.id,'production_order_id',a.production_order_id,'production_batch_id',a.production_batch_id,'order_item_id',a.order_item_id,'dispatch_stage',a.dispatch_stage,'dispatch_status',a.dispatch_status,'production_order_number',o.production_order_number,'order_status',o.status,'batch_status',b.status,'product_name',i.product_name,'assigned_from',a.assigned_from::text,'assigned_to',a.assigned_to::text) assignment
      from local_production_stage_events e join local_assignments a on a.id=e.assignment_id and a.dispatch_stage is not null
      join local_workers w on w.id=e.worker_id join local_production_orders o on o.id=a.production_order_id join local_production_batches b on b.id=a.production_batch_id
      left join local_production_order_items i on i.id=a.order_item_id
      where e.status='SUBMITTED' and e.created_by is distinct from $1::text ${scopeSql}
    ) select (select count(*)::int from authorized) total,
      coalesce((select jsonb_agg(jsonb_build_object('id',page.id,'report',page.report,'assignment',page.assignment) order by page.id desc) from (select id,report,assignment from authorized where ($2::uuid is null or id<$2::uuid) order by id desc limit $3) page),'[]'::jsonb) entries`,[d.actor(),cursor||null,limit+1])).rows[0];
    const entries=result.entries as Array<{id:string;report:Row;assignment:Row}>,has_more=entries.length>limit,page=entries.slice(0,limit);
    const assignments=[...new Map(page.map(row=>[row.assignment.id,row.assignment])).values()];
    res.json({assignments,reports:page.map(row=>row.report),total:result.total,has_more,next_cursor:has_more?page.at(-1)!.id:null,limit});
  }catch(error){d.sendError(res,error);}});
  app.get('/api/production-dispatch/received-work',async(req,res)=>{try{const result=await d.transaction(async client=>{await manager(client);const worker=String(req.query.worker_id||''),date=workDate(req.query.date||today());await scope(client,worker,date);return(await client.query(`select a.id,a.piece_rate_code,i.product_name,o.production_order_number,a.accepted_quantity-a.returned_quantity-coalesce((select sum(e.quantity_received) from local_production_stage_events e where e.assignment_id=a.id and e.source_stage_event_id is null and e.status in ('SUBMITTED','APPROVED','LOCKED')),0) remaining_quantity from local_assignments a join local_production_orders o on o.id=a.production_order_id join local_production_order_items i on i.id=a.order_item_id where a.worker_id=$1 and a.dispatch_stage='SEWING' and a.dispatch_status='ACCEPTED' and a.assigned_from<=$2::date and (a.assigned_to is null or a.assigned_to>=$2::date) and o.status in ('RELEASED','IN_PROGRESS') order by a.created_at desc`,[worker,date])).rows;});res.json(result);}catch(error){d.sendError(res,error);}});
  app.get('/api/production-dispatch/labor-preview',async(req,res)=>{try{const result=await d.transaction(async client=>{await manager(client);await d.lockRateConfigShared(client);await client.query("select pg_advisory_xact_lock_shared(hashtextextended('labor-mapping-writer',0))");return resolveDispatchLabor(client,String(req.query.production_order_id||''),String(req.query.order_item_id||''),workDate(req.query.date||today()));});res.json({status:'RESOLVED',piece_rate_code:result.basis.piece_rate_code,rate_unit:'PIECE',reason:'Mã công từ hồ sơ kỹ thuật và ánh xạ đã duyệt.'});}catch(error){d.sendError(res,error);}});
  app.post('/api/production-dispatch/assignments/:id/reconcile-labor',async(req,res)=>{try{res.json(await mutate(`RECONCILE_LABOR:${req.params.id}`,req.body,async client=>{await manager(client);const a=await assignment(client,String(req.params.id));await scope(client,a.worker_id,String(a.assigned_from));if(a.repair_ticket_id||a.dispatch_stage!=='SEWING')fail('Công việc không cần đối soát mã may.');const reason=String(req.body.reason||'').trim();if(reason.length<3)fail('Nhập lý do đối soát ít nhất 3 ký tự.');const resolved=await resolveDispatchLabor(client,a.production_order_id,a.order_item_id,String(a.assigned_from));if(codeKey(a.piece_rate_code)!==codeKey(resolved.basis.piece_rate_code))fail('Mã công hiện tại không khớp; không tự thay mã của việc đã giao.',409);await client.query('update local_assignments set labor_basis=$2::jsonb where id=$1',[a.id,JSON.stringify(resolved.basis)]);await audit(client,a.production_order_id,'RECONCILE_LABOR',{...a,labor_basis:resolved.basis},req.body);return publicLaborAssignment({...a,labor_basis:resolved.basis});}));}catch(error){d.sendError(res,error);}});
  app.get('/api/production-dispatch/assignments/:id/pay-preview',async(req,res)=>{try{const result=await d.transaction(async client=>{await d.lockRateConfigShared(client);await client.query("select pg_advisory_xact_lock_shared(hashtextextended('labor-mapping-writer',0))");
    const date=workDate(req.query.work_date),good=quantity(req.query.quantity_good,true);
    const a=(await client.query(`select a.*,o.status order_status,b.status batch_status from local_assignments a join local_workers w on w.id=a.worker_id and w.user_id=$2 and w.is_active join local_production_orders o on o.id=a.production_order_id join local_production_batches b on b.id=a.production_batch_id where a.id=$1 and a.dispatch_stage is not null`,[req.params.id,d.actor()])).rows[0];
    if(!a)fail('Chỉ được xem tiền dự kiến cho công việc của chính mình.',403);
    if(a.dispatch_status!=='ACCEPTED'||!['RELEASED','IN_PROGRESS'].includes(a.order_status)||!['PLANNED','IN_PROGRESS'].includes(a.batch_status)||date<a.assigned_from||a.assigned_to&&date>a.assigned_to)fail('Công việc hoặc ngày làm không đủ điều kiện báo cáo.',409);
    const remaining=(await client.query(`select $2::numeric-$3::numeric-coalesce(sum(quantity_received),0) quantity from local_production_stage_events where assignment_id=$1 and source_stage_event_id is null and status in ('SUBMITTED','APPROVED','LOCKED')`,[a.id,a.accepted_quantity,a.returned_quantity])).rows[0].quantity;
    if((await client.query('select $1::numeric>$2::numeric exceeds',[good,remaining])).rows[0].exceeds)fail('Số đạt vượt phần còn lại chưa báo cáo.',409);
    const base={work_date:date,quantity_good:good,piece_rate_code:a.piece_rate_code,rate_unit:a.rate_unit,rate_amount:null,pending_amount:null};
    if(a.dispatch_stage!=='SEWING'||a.repair_ticket_id)return ({...base,status:'NON_PAYABLE',reason:a.repair_ticket_id?'Hàng trả sửa / kiểm lại không tính tiền sản phẩm lần hai.':'Công đoạn này tính theo hồ sơ lương ngày / giờ, không cộng tiền may.'});
    const profiles=(await client.query("select piece_output_enabled from local_worker_payroll_profiles where worker_id=$1 and status='APPROVED' and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)",[a.worker_id,date])).rows;
    if(profiles.length!==1||profiles[0].piece_output_enabled!==true)return ({...base,status:'UNAVAILABLE',reason:'Hồ sơ lương sản lượng thiếu, trùng hoặc chưa bật. Liên hệ quản lý.'});
    let rate;
    try { await validateDispatchLabor(client,a,date);rate=await selectRuntimePieceRate(client,{date,pieceRateCode:a.piece_rate_code}); }
    catch { return ({...base,status:'UNAVAILABLE',reason:'Thiếu, trùng hoặc sai đơn vị đơn giá hiệu lực. Liên hệ quản lý.'}); }
    if(String(rate.rate_unit)!==String(a.rate_unit))return ({...base,status:'UNAVAILABLE',reason:'Thiếu, trùng hoặc sai đơn vị đơn giá hiệu lực. Liên hệ quản lý.'});
    const pending=(await client.query('select round($1::numeric*$2::numeric,2)::text pending_amount',[good,rate.rate_exact])).rows[0].pending_amount;
    return ({...base,status:'READY',rate_amount:rate.rate_exact,pending_amount:pending,reason:null});
  });res.json(result);}catch(error){d.sendError(res,error);}});
  app.get('/api/production-dispatch/publications', async (req, res) => {
    try {
      const mine = String(req.query.mine || '') === '1';
      res.json((await read(req, mine)).publications);
    } catch (error) { d.sendError(res, error); }
  });
  app.get('/api/production-dispatch/rates', async (req,res) => {
    try {
      await permission(awaitClientProxy(),['production_manage','production_operations']);
      if (d.role()==='employee') fail('Nhân viên chỉ xem mã công trên công việc của mình.',403);
      const date=workDate(req.query.date || today());
      const rows=listRuntimePieceRates(await loadEffectiveApprovedProductRates(pool,date))
        .map(row=>({id:row.id,piece_rate_code:row.piece_rate_code,piece_rate_name:row.piece_rate_name,rate_unit:row.rate_unit}))
        .sort((a,b)=>String(a.piece_rate_code).localeCompare(String(b.piece_rate_code),'vi'));
      res.json(rows);
    } catch(error) { d.sendError(res,error); }
  });
  app.post('/api/production-dispatch/assignments', async (req, res) => {
    try { res.status(201).json(await mutate('ASSIGN', req.body, async (client) => {
      await manager(client);
      const b = req.body;
      const stage = String(b.stage || '').trim().toUpperCase();
      if (!productionStages.includes(stage)) fail('Công đoạn không hợp lệ.');
      const qty = quantity(b.quantity);
      const from = workDate(b.assigned_from || today());
      if (b.assigned_to && (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.assigned_to)) || String(b.assigned_to) < from)) fail('Hạn giao phải từ ngày nhận việc trở đi.');
      const parent = await lockParent(client, b.production_order_id, b.production_batch_id);
      if (['FINISHING','COUNTING'].includes(stage) && parent.order.workflow_generation!=='WORKFLOW_V3') fail('Lệnh cũ cần chuyển sang quy trình mới trước khi giao công đoạn sau may.',409);
      if(parent.order.workflow_generation==='WORKFLOW_V3'&&!b.order_item_id) fail('Chọn dòng sản phẩm cần giao.');
      await workerForStage(client, String(b.worker_id), stage);
      await scope(client, b.worker_id, from);
      if (b.order_item_id && !(await client.query('select 1 from local_production_order_items where id=$1 and production_order_id=$2', [b.order_item_id, b.production_order_id])).rows[0]) fail('Dòng sản phẩm không thuộc lệnh.');
      const cap = await available(client, b.production_batch_id, stage,b.order_item_id,b.repair_ticket_id);
      const open = await openPublicationQuantity(client, String(b.production_batch_id), stage,b.order_item_id,b.repair_ticket_id);
      if(stage==='CUTTING')await cuttingPlanCapacity(client,b.production_order_id,b.production_batch_id,b.order_item_id,qty);
      if ((await client.query('select $1::numeric+$2::numeric+$3::numeric>$4::numeric exceeds', [cap.reserved, open, qty, cap.capacity])).rows[0].exceeds) fail(stage === 'CUTTING' ? 'Phân công vượt kế hoạch lô cắt hoặc phần đã công khai.' : 'Phân công may vượt số đã cắt đạt hoặc phần đã công khai.');
      if (stage === 'CUTTING') await cuttingGate(client, String(b.production_order_id), String(b.production_batch_id), String((await client.query('select ($1::numeric+$2::numeric+$3::numeric)::text qty', [cap.reserved, open, qty])).rows[0].qty));
      let code: string | null = null, unit: string | null = null;let laborBasis:Row|null=null;
      if(stage==='SEWING'&&b.repair_ticket_id){code='SUA_KHONG_TINH_CONG';unit='PIECE';}
      if (stage === 'SEWING'&&!b.repair_ticket_id) {
        const resolved=await resolveDispatchLabor(client,String(b.production_order_id),String(b.order_item_id||''),from);
        if(b.piece_rate_code&&codeKey(b.piece_rate_code)!==codeKey(resolved.basis.piece_rate_code))fail('Mã công gửi lên không khớp hồ sơ và ánh xạ đã duyệt.',409);
        code=resolved.basis.piece_rate_code;unit='PIECE';laborBasis=resolved.basis;
      }
      const row = (await client.query("insert into local_assignments(production_order_id,production_batch_id,order_item_id,worker_id,assigned_from,assigned_to,notes,dispatch_stage,allocated_quantity,dispatch_status,piece_rate_code,rate_unit,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10,$11,$12) returning *", [b.production_order_id, b.production_batch_id, b.order_item_id || null, b.worker_id, from, b.assigned_to || null, b.notes || null, stage, qty, code, unit, d.actor()])).rows[0];
      if(laborBasis)await client.query('update local_assignments set labor_basis=$2::jsonb where id=$1',[row.id,JSON.stringify(laborBasis)]);
      if(b.repair_ticket_id)await client.query('update local_assignments set repair_ticket_id=$2 where id=$1',[row.id,b.repair_ticket_id]);
      await audit(client, row.production_order_id, 'ASSIGN', {...row,labor_basis:laborBasis}, b, qty); return publicLaborAssignment({...row,labor_basis:laborBasis});
    })); } catch (error) { d.sendError(res, error); }
  });
  app.post('/api/production-dispatch/publications', async (req, res) => {
    try { res.status(201).json(await mutate('PUBLISH', req.body, async (client) => {
      await manager(client);
      const b = req.body;
      const stage = String(b.stage || '').trim().toUpperCase();
      if (!productionStages.includes(stage)) fail('Công đoạn không hợp lệ.');
      const eligible = String(b.eligible_worker_type || '').trim().toUpperCase();
      if (!(productionStageWorkers[stage]||[]).includes(eligible)) fail('Loại nhân sự không phù hợp công đoạn.');
      const qty = quantity(b.quantity), from = workDate(b.assigned_from || today());
      if (b.assigned_to && (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.assigned_to)) || new Date(`${b.assigned_to}T00:00:00Z`).toISOString().slice(0,10) !== String(b.assigned_to) || String(b.assigned_to) < from)) fail('Hạn nhận việc không hợp lệ.');
      const parent = await lockParent(client, String(b.production_order_id), String(b.production_batch_id));
      if (['FINISHING','COUNTING'].includes(stage) && parent.order.workflow_generation!=='WORKFLOW_V3') fail('Lệnh cũ cần chuyển sang quy trình mới trước khi giao công đoạn sau may.',409);
      if (!(await client.query('select 1 from local_production_order_items where id=$1 and production_order_id=$2', [b.order_item_id, b.production_order_id])).rows[0]) fail('Dòng sản phẩm không thuộc lệnh.');
      if (b.eligible_supervisor_worker_id && !(await client.query('select 1 from local_workers where id=$1 and is_active', [b.eligible_supervisor_worker_id])).rows[0]) fail('Tổ trưởng giới hạn không còn hoạt động.');
      const cap = await available(client, String(b.production_batch_id), stage,b.order_item_id,b.repair_ticket_id);
      const open = await openPublicationQuantity(client,String(b.production_batch_id),stage,b.order_item_id,b.repair_ticket_id);
      if(stage==='CUTTING')await cuttingPlanCapacity(client,b.production_order_id,b.production_batch_id,b.order_item_id,qty);
      if ((await client.query('select $1::numeric+$2::numeric+$3::numeric>$4::numeric exceeds', [cap.reserved, open, qty, cap.capacity])).rows[0].exceeds) fail(stage === 'CUTTING' ? 'Tổng việc công khai vượt kế hoạch lô cắt.' : 'Tổng việc công khai vượt số đã cắt đạt và duyệt.');
      if (stage === 'CUTTING') await cuttingGate(client, String(b.production_order_id), String(b.production_batch_id), String((await client.query('select ($1::numeric+$2::numeric+$3::numeric)::text qty', [cap.reserved, open, qty])).rows[0].qty));
      let code: string | null = null, unit: string | null = null;let laborBasis:Row|null=null;
      if(stage==='SEWING'&&b.repair_ticket_id){code='SUA_KHONG_TINH_CONG';unit='PIECE';}
      if (stage === 'SEWING'&&!b.repair_ticket_id) {
        const resolved=await resolveDispatchLabor(client,String(b.production_order_id),String(b.order_item_id||''),from);
        if(b.piece_rate_code&&codeKey(b.piece_rate_code)!==codeKey(resolved.basis.piece_rate_code))fail('Mã công gửi lên không khớp hồ sơ và ánh xạ đã duyệt.',409);
        code=resolved.basis.piece_rate_code;unit='PIECE';laborBasis=resolved.basis;
      }
      const row = (await client.query(`insert into local_production_job_publications(production_order_id,production_batch_id,order_item_id,stage,quantity,eligible_worker_type,eligible_supervisor_worker_id,piece_rate_code,rate_unit,assigned_from,assigned_to,notes,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`, [b.production_order_id,b.production_batch_id,b.order_item_id,stage,qty,eligible,b.eligible_supervisor_worker_id||null,code,unit,from,b.assigned_to||null,b.notes||null,d.actor()])).rows[0];
      if(laborBasis)await client.query('update local_production_job_publications set labor_basis=$2::jsonb where id=$1',[row.id,JSON.stringify(laborBasis)]);
      if(b.repair_ticket_id)await client.query('update local_production_job_publications set repair_ticket_id=$2 where id=$1',[row.id,b.repair_ticket_id]);
      await client.query("insert into local_dispatch_audit_events(production_order_id,action,quantity,reason,actor_id,data) values($1,'PUBLISH',$2,$3,$4,$5::jsonb)", [row.production_order_id,qty,b.notes||null,d.actor(),JSON.stringify(row)]);
      return publicLaborAssignment({...row,labor_basis:laborBasis});
    })); } catch (error) { d.sendError(res, error); }
  });
  app.post('/api/production-dispatch/publications/:id/claim', async (req, res) => {
    try { res.status(201).json(await mutate(`CLAIM:${req.params.id}`, req.body, async (client) => {
      const pointer = (await client.query('select production_order_id,production_batch_id from local_production_job_publications where id=$1', [req.params.id])).rows[0];
      if (!pointer) fail('Công việc công khai không tồn tại.', 404);
      await lockParent(client, pointer.production_order_id, pointer.production_batch_id);
      const publication = (await client.query('select * from local_production_job_publications where id=$1 for update', [req.params.id])).rows[0];
      if (!publication || publication.status !== 'OPEN') fail('Công việc không còn mở để nhận.', 409);
      const date = today();
      if (publication.assigned_from > date || (publication.assigned_to && publication.assigned_to < date)) fail('Công việc đang ngoài thời hạn nhận.', 409);
      const worker = (await client.query('select * from local_workers where user_id=$1 and is_active for share', [d.actor()])).rows[0];
      if (!worker) fail('Tài khoản chưa liên kết nhân sự đang hoạt động.', 403);
      await workerForStage(client, worker.id, publication.stage);
      if (publication.eligible_supervisor_worker_id && !(await client.query(`select 1 from local_payroll_team_assignments where supervisor_worker_id=$1 and worker_id=$2 and status='ACTIVE'
        and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)`, [publication.eligible_supervisor_worker_id,worker.id,date])).rows[0]) fail('Bạn không thuộc tổ được nhận công việc này.', 403);
      await validateDispatchLabor(client,publication,date);
      const qty = quantity(req.body.quantity);
      const claimed = (await client.query("select coalesce(sum(coalesce(accepted_quantity,allocated_quantity)-returned_quantity),0) quantity from local_assignments where publication_id=$1 and dispatch_status<>'REJECTED'", [publication.id])).rows[0].quantity;
      if ((await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds', [claimed,qty,publication.quantity])).rows[0].exceeds) fail('Số lượng nhận vượt phần công việc còn mở.', 409);
      const cap = await available(client, publication.production_batch_id, publication.stage,publication.order_item_id,publication.repair_ticket_id);
      if ((await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds', [cap.reserved,qty,cap.capacity])).rows[0].exceeds) fail('Năng lực công đoạn không còn đủ cho số lượng này.', 409);
      if (publication.stage === 'CUTTING') await cuttingGate(client, publication.production_order_id, publication.production_batch_id, String((await client.query('select ($1::numeric+$2::numeric)::text qty', [cap.reserved,qty])).rows[0].qty));
      const row = (await client.query(`insert into local_assignments(production_order_id,production_batch_id,order_item_id,worker_id,assigned_from,assigned_to,notes,dispatch_stage,allocated_quantity,accepted_quantity,dispatch_status,piece_rate_code,rate_unit,created_by,accepted_by,accepted_at,publication_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'ACCEPTED',$10,$11,$12,$12,now(),$13) returning *`, [publication.production_order_id,publication.production_batch_id,publication.order_item_id,worker.id,publication.assigned_from,publication.assigned_to,publication.notes,publication.stage,qty,publication.piece_rate_code,publication.rate_unit,d.actor(),publication.id])).rows[0];
      if(publication.labor_basis)await client.query('update local_assignments set labor_basis=$2::jsonb where id=$1',[row.id,JSON.stringify(publication.labor_basis)]);
      if(publication.repair_ticket_id)await client.query('update local_assignments set repair_ticket_id=$2 where id=$1',[row.id,publication.repair_ticket_id]);
      await audit(client,row.production_order_id,'CLAIM',row,req.body,qty);
      return publicLaborAssignment({...row,labor_basis:publication.labor_basis});
    })); } catch (error) { d.sendError(res, error); }
  });
  app.post('/api/production-dispatch/publications/:id/close', async (req, res) => {
    try { res.json(await mutate(`CLOSE_PUBLICATION:${req.params.id}`, req.body, async (client) => {
      await manager(client);
      const pointer = (await client.query('select production_order_id,production_batch_id from local_production_job_publications where id=$1', [req.params.id])).rows[0];
      if (!pointer) fail('Không tìm thấy công việc công khai.',404);
      await lockParent(client,pointer.production_order_id,pointer.production_batch_id,true);
      const status = String(req.body.status || 'CLOSED').trim().toUpperCase();
      if (!['CLOSED','CANCELLED'].includes(status)) fail('Trạng thái đóng không hợp lệ.');
      if (status === 'CANCELLED' && !String(req.body.reason || '').trim()) fail('Hủy công việc công khai phải có lý do.');
      const row = (await client.query("update local_production_job_publications set status=$2,closed_by=$3,closed_at=now(),updated_at=now() where id=$1 and status='OPEN' returning *", [req.params.id,status,d.actor()])).rows[0];
      if (!row) fail('Công việc đã được đóng trước đó.',409);
      await client.query("insert into local_dispatch_audit_events(production_order_id,action,reason,actor_id,data) values($1,$2,$3,$4,$5::jsonb)", [row.production_order_id,status==='CANCELLED'?'CANCEL_PUBLICATION':'CLOSE_PUBLICATION',req.body.reason||null,d.actor(),JSON.stringify(row)]);
      return row;
    })); } catch (error) { d.sendError(res,error); }
  });
  for (const action of ['accept', 'return', 'reject']) app.post(`/api/production-dispatch/assignments/:id/${action}`, async (req, res) => {
    try { res.json(await mutate(`${action}:${req.params.id}`, req.body, async (client) => {
      const a = await assignment(client, String(req.params.id), action !== 'accept');
      await scope(client, a.worker_id, a.assigned_from);
      if (d.role() !== 'employee') await manager(client);
      const reason = String(req.body.reason || '').trim();
      if (action === 'accept') {
        await validateDispatchLabor(client,a,today());
        if (a.dispatch_status !== 'PENDING') fail('Việc đã nhận hoặc từ chối, không thể nhận lại.');
        const qty = quantity(req.body.quantity, true);
        const check = (await client.query('select $1::numeric>$2::numeric exceeds,$1::numeric<$2::numeric shortfall', [qty, a.allocated_quantity])).rows[0];
        if (check.exceeds || (check.shortfall && !reason)) fail('Không nhận vượt số giao; nhận thiếu phải ghi rõ lý do.');
        const row = (await client.query("update local_assignments set accepted_quantity=$2,dispatch_status='ACCEPTED',accepted_at=now(),accepted_by=$3,discrepancy_reason=$4 where id=$1 returning *", [a.id, qty, d.actor(), reason || null])).rows[0];
        await audit(client, a.production_order_id, 'ACCEPT', row, req.body, qty); return row;
      }
      if (!reason) fail('Phải nhập lý do trả lại hoặc từ chối.');
      if (action === 'reject') {
        if (a.dispatch_status !== 'PENDING') fail('Việc đã nhận chỉ được trả phần chưa làm.');
        const row = (await client.query("update local_assignments set dispatch_status='REJECTED',is_active=false,discrepancy_reason=$2 where id=$1 returning *", [a.id, reason])).rows[0];
        await audit(client, a.production_order_id, 'REJECT_ASSIGNMENT', row, req.body); return row;
      }
      if (a.dispatch_status !== 'ACCEPTED') fail('Chỉ trả lại việc đã nhận.');
      const qty = quantity(req.body.quantity), used = await consumption(client, a.id);
      if ((await client.query('select $1::numeric+$2::numeric+$3::numeric>$4::numeric exceeds', [qty, used, a.returned_quantity, a.accepted_quantity])).rows[0].exceeds) fail('Chỉ được trả phần chưa báo cáo; cả báo cáo chờ duyệt vẫn giữ số lượng.');
      const row = (await client.query('update local_assignments set returned_quantity=returned_quantity+$2::numeric where id=$1 returning *', [a.id, qty])).rows[0];
      await audit(client, a.production_order_id, 'RETURN', row, req.body, qty); return row;
    })); } catch (error) { d.sendError(res, error); }
  });
  async function reportLinkedOutput(id:string,body:Body){return mutate(`REPORT:${id}`,body,async(client,key)=>{
      const a = await assignment(client, String(id));
      const date = workDate(body.work_date);
      await scope(client, a.worker_id, date);
      if (d.role() !== 'employee') await manager(client);
      if (a.dispatch_status !== 'ACCEPTED' || date < a.assigned_from || (a.assigned_to && date > a.assigned_to)) fail('Việc chưa nhận hoặc ngày báo cáo ngoài thời hạn giao việc.');
      await validateDispatchLabor(client,a,date);
      const good = quantity(body.quantity_good, true), rework = quantity(body.quantity_rework, true), remake = quantity(body.quantity_remake, true), defect = quantity(body.quantity_defect, true);
      const total = (await client.query('select ($1::numeric+$2::numeric+$3::numeric+$4::numeric)::text qty', [good, rework, remake, defect])).rows[0].qty;
      quantity(total);
      if (body.quantity_received !== undefined && Number(quantity(body.quantity_received)) !== Number(total)) fail('Số lượng xử lý phải bằng tổng đạt, sửa, làm lại và lỗi.');
      const used = await consumption(client, a.id);
      if ((await client.query('select $1::numeric+$2::numeric+$3::numeric>$4::numeric exceeds', [total, used, a.returned_quantity, a.accepted_quantity])).rows[0].exceeds) fail('Báo cáo vượt số lượng đã nhận còn lại.');
      if (a.dispatch_stage === 'CUTTING') await cuttingGate(client, a.production_order_id, a.production_batch_id, String((await client.query('select ($1::numeric+$2::numeric)::text qty', [used, total])).rows[0].qty));
      await d.lockDay(client, a.worker_id, date);
      await d.writable(client, a.worker_id, date, 'SUBMITTED');
      await d.dayAllowsWork(client, a.worker_id, date, 'báo cáo công đoạn');
      const row = (await client.query("insert into local_production_stage_events(production_order_id,production_batch_id,order_item_id,assignment_id,stage,worker_id,quantity_received,quantity_good,quantity_rework,quantity_remake,quantity_defect,work_date,occurred_at,created_by,notes,idempotency_key,is_payable) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12::date::timestamptz,$13,$14,$15,true) returning *", [a.production_order_id, a.production_batch_id, a.order_item_id, a.id, a.dispatch_stage, a.worker_id, total, good, rework, remake, defect, date, d.actor(), body.notes || null, `dispatch-report:${key}`])).rows[0];
      if(a.repair_ticket_id||a.dispatch_stage!=='SEWING')await client.query('update local_production_stage_events set is_payable=false where id=$1',[row.id]);
      await client.query("update local_production_orders set status='IN_PROGRESS',local_modified_at=now(),updated_at=now() where id=$1", [a.production_order_id]);
      await audit(client, a.production_order_id, 'REPORT', row, body, total); return row;
    });}
  app.post('/api/production-dispatch/assignments/:id/reports',async(req,res)=>{try{res.status(201).json(await reportLinkedOutput(String(req.params.id),req.body||{}));}catch(error){d.sendError(res,error);}});
  app.post('/api/production-dispatch/reports/:id/repair', async (req, res) => {
    try { res.status(201).json(await mutate(`REPAIR:${req.params.id}`, req.body, async (client,key) => {
      const sourcePointer = (await client.query('select production_order_id,production_batch_id,assignment_id from local_production_stage_events where id=$1', [req.params.id])).rows[0];
      if (!sourcePointer?.assignment_id) fail('Không tìm thấy báo cáo gốc có giao việc.',404);
      await lockParent(client,sourcePointer.production_order_id,sourcePointer.production_batch_id);
      const source = (await client.query("select * from local_production_stage_events where id=$1 and status in ('APPROVED','LOCKED') for update", [req.params.id])).rows[0];
      if (!source) fail('Chỉ được báo sửa/làm lại từ báo cáo đã duyệt.',409);
      if((await client.query('select 1 from local_production_repair_tickets where source_stage_event_id=$1',[source.id])).rows[0])fail('Phần lỗi đã có phiếu trả sửa; hãy làm trên công việc của phiếu trả sửa.',409);
      const assignmentId = String(req.body.assignment_id || source.assignment_id);
      if (assignmentId !== String(source.assignment_id)) fail('Sửa/làm lại phải giữ nguyên việc và người thực hiện của báo cáo gốc.', 403);
      const a = (await client.query('select * from local_assignments where id=$1 and production_order_id=$2 and production_batch_id=$3 and dispatch_stage=$4 and dispatch_status=\'ACCEPTED\' for update', [assignmentId,source.production_order_id,source.production_batch_id,source.stage])).rows[0];
      if (!a) fail('Việc dùng để sửa/làm lại không hợp lệ.',409);
      if (String(a.worker_id) !== String(source.worker_id)) fail('Không được chuyển phần sửa/làm lại sang nhân sự khác.', 403);
      const date = workDate(req.body.work_date);
      await scope(client,a.worker_id,date);
      if (d.role() !== 'employee') await manager(client);
      if (date < a.assigned_from || (a.assigned_to && date > a.assigned_to)) fail('Ngày sửa/làm lại phải nằm trong thời hạn giao việc.', 409);
      const kind = String(req.body.repair_kind || (Number(source.quantity_rework)>0 && Number(source.quantity_remake)<=0 ? 'REWORK' : 'REMAKE')).trim().toUpperCase();
      if (!['REWORK','REMAKE'].includes(kind)) fail('Loại xử lý phải là sửa hoặc làm lại.');
      const qty = quantity(req.body.quantity_good);
      const allowed = kind === 'REWORK' ? source.quantity_rework : source.quantity_remake;
      const repaired = (await client.query("select coalesce(sum(quantity_received),0) quantity from local_production_stage_events where source_stage_event_id=$1 and repair_kind=$2 and status in ('SUBMITTED','APPROVED','LOCKED')", [source.id,kind])).rows[0].quantity;
      if ((await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds', [repaired,qty,allowed])).rows[0].exceeds) fail('Số lượng sửa/làm lại vượt số lượng của báo cáo gốc.',409);
      let supplementId: string | null = null;
      if (source.stage === 'CUTTING' && kind === 'REMAKE') {
        supplementId = String(req.body.cutting_estimate_id || '');
        if (!supplementId) fail('Làm lại công đoạn cắt phải chọn dự toán vật tư bổ sung đã duyệt.', 409);
        const supplement = (await client.query(`select * from local_cutting_estimates where id=$1 and estimate_kind='REMAKE' and source_stage_event_id=$2
          and production_order_id=$3 and production_batch_id=$4 and status='APPROVED' for update`, [supplementId,source.id,source.production_order_id,source.production_batch_id])).rows[0];
        if (!supplement) fail('Làm lại công đoạn cắt phải chọn dự toán vật tư bổ sung đã duyệt.', 409);
        const supplementUsed = (await client.query("select coalesce(sum(quantity_received),0) quantity from local_production_stage_events where cutting_estimate_id=$1 and repair_kind='REMAKE' and status in ('SUBMITTED','APPROVED','LOCKED')", [supplement.id])).rows[0].quantity;
        if ((await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds', [supplementUsed,qty,supplement.remake_quantity])).rows[0].exceeds) fail('Báo cáo làm lại vượt hạn mức của dự toán vật tư bổ sung.', 409);
        const lines = (await client.query('select id,estimated_quantity from local_cutting_estimate_lines where estimate_id=$1', [supplement.id])).rows;
        for (const line of lines) {
          const issued = (await client.query(`select coalesce(-sum(m.quantity_delta),0) quantity from local_inventory_movements m
            join local_inventory_documents d on d.id=m.document_id and d.status='CONFIRMED' where m.cutting_estimate_line_id=$1`, [line.id])).rows[0].quantity;
          if ((await client.query('select $1::numeric<$2::numeric insufficient', [issued,line.estimated_quantity])).rows[0].insufficient) fail('Phải cấp đủ vật tư của dự toán bổ sung trước khi báo làm lại công đoạn cắt.', 409);
        }
      }
      await d.lockDay(client,a.worker_id,date);
      await d.writable(client,a.worker_id,date,'SUBMITTED');
      await d.dayAllowsWork(client,a.worker_id,date,'báo cáo sửa/làm lại');
      const row = (await client.query(`insert into local_production_stage_events(production_order_id,production_batch_id,order_item_id,assignment_id,stage,worker_id,quantity_received,quantity_good,quantity_rework,quantity_remake,quantity_defect,work_date,occurred_at,created_by,notes,idempotency_key,source_stage_event_id,repair_kind,is_payable,cutting_estimate_id)
        values($1,$2,$3,$4,$5,$6,$7,$7,0,0,0,$8,$8::date::timestamptz,$9,$10,$11,$12,$13,false,$14) returning *`, [source.production_order_id,source.production_batch_id,source.order_item_id,a.id,source.stage,a.worker_id,qty,date,d.actor(),req.body.notes||null,`dispatch-repair:${key}`,source.id,kind,supplementId])).rows[0];
      await audit(client,row.production_order_id,'REPAIR_REPORT',row,req.body,qty);
      return row;
    })); } catch(error) { d.sendError(res,error); }
  });
  for (const action of ['review', 'reverse']) app.post(`/api/production-dispatch/reports/:id/${action}`, async (req, res) => {
    try { res.json(await mutate(`${action}:${req.params.id}`, req.body, async (client, key) => {
      const pointer = (await client.query('select assignment_id from local_production_stage_events where id=$1', [req.params.id])).rows[0];
      if (!pointer?.assignment_id) fail('Đây không phải báo cáo giao việc.');
      const a = await assignment(client, pointer.assignment_id, action === 'reverse' || req.body.target_status === 'REJECTED');
      const e = (await client.query('select * from local_production_stage_events where id=$1 for update', [req.params.id])).rows[0];
      if (d.role() === 'employee') fail('Nhân viên không được duyệt báo cáo.', 403);
      if (d.role() === 'team_leader' && (action === 'reverse' || e.created_by === d.actor())) fail('Tổ trưởng không được đảo hoặc tự duyệt báo cáo do chính mình tạo.', 403);
      await permission(client, action === 'reverse' ? ['production_manage'] : ['production_manage', 'production_attendance_approve']);
      await scope(client, a.worker_id, e.work_date, true);
      const reason = String(req.body.reason || '').trim();
      const target = action === 'reverse' ? 'REVERSED' : String(req.body.target_status || '');
      if ((action === 'reverse' && e.status !== 'APPROVED') || (action === 'review' && (e.status !== 'SUBMITTED' || !['APPROVED', 'REJECTED'].includes(target)))) fail('Trạng thái báo cáo không cho phép thao tác này.');
      if (target !== 'APPROVED' && !reason) fail('Từ chối hoặc đảo báo cáo phải có lý do.');
      if(target==='APPROVED'&&e.is_payable!==false)await validateDispatchLabor(client,a,String(e.work_date));
      await d.lockDay(client, a.worker_id, e.work_date);
      await d.writable(client, a.worker_id, e.work_date, e.status);
      await d.dayAllowsWork(client, a.worker_id, e.work_date, 'duyệt công đoạn');
      if (target === 'REVERSED' && (await client.query("select 1 from local_production_stage_events where source_stage_event_id=$1 and status in ('SUBMITTED','APPROVED','LOCKED') limit 1", [e.id])).rows[0]) fail('Báo cáo gốc đang có dòng sửa/làm lại còn hiệu lực; không thể đảo.', 409);
      if(target==='REVERSED'&&(await client.query('select 1 from local_production_repair_tickets where source_stage_event_id=$1',[e.id])).rows[0])fail('Báo cáo đã có phiếu trả sửa, không thể đảo.',409);
      if (target === 'REVERSED' && (await client.query(`select 1 from local_cutting_estimates ce join local_cutting_estimate_lines l on l.estimate_id=ce.id
        join local_inventory_movements m on m.cutting_estimate_line_id=l.id join local_inventory_documents d on d.id=m.document_id and d.status='CONFIRMED'
        where ce.source_stage_event_id=$1 and ce.estimate_kind='REMAKE' and ce.status='APPROVED' limit 1`, [e.id])).rows[0]) fail('Báo cáo gốc đã có vật tư làm lại được cấp; không thể đảo.', 409);
      if (target === 'APPROVED' && e.source_stage_event_id) {
        const source = (await client.query("select * from local_production_stage_events where id=$1 for share", [e.source_stage_event_id])).rows[0];
        if (!source || !['APPROVED','LOCKED'].includes(source.status) || String(source.assignment_id) !== String(e.assignment_id) || String(source.worker_id) !== String(e.worker_id)) fail('Báo cáo gốc của phần sửa/làm lại không còn hợp lệ.', 409);
        if (e.stage === 'CUTTING' && e.repair_kind === 'REMAKE') {
          const supplement = (await client.query("select 1 from local_cutting_estimates where id=$1 and estimate_kind='REMAKE' and source_stage_event_id=$2 and status='APPROVED' for share", [e.cutting_estimate_id,source.id])).rows[0];
          if (!supplement) fail('Dự toán vật tư làm lại không còn hợp lệ.', 409);
        }
      }
      const downstream=productionStages[productionStages.indexOf(a.dispatch_stage)+1];
      if (downstream && target === 'REVERSED') {
        const ticket=a.repair_ticket_id?(await client.query('select return_stage from local_production_repair_tickets where id=$1',[a.repair_ticket_id])).rows[0]:null;
        const nextTicket=ticket?.return_stage===a.dispatch_stage?undefined:a.repair_ticket_id;
        const sewing = await available(client, a.production_batch_id, downstream,a.order_item_id,nextTicket);
        const openSewing = await openPublicationQuantity(client, a.production_batch_id, downstream,a.order_item_id,nextTicket);
        if ((await client.query('select $1::numeric-$2::numeric<$3::numeric+$4::numeric exceeds', [sewing.capacity, e.quantity_good, sewing.reserved, openSewing])).rows[0].exceeds) fail('Lượng cắt này đang giữ cho phân công hoặc việc may công khai; cần trả lại/hủy việc may trước.');
      }
      if(a.dispatch_stage==='COUNTING'&&target==='REVERSED'){
        const posted=(await client.query('select coalesce(sum(quantity_good),0) quantity from local_production_outputs where production_order_id=$1 and production_batch_id=$2 and order_item_id=$3 and inventory_receipt_id is not null',[a.production_order_id,a.production_batch_id,a.order_item_id])).rows[0].quantity;
        const good=(await client.query("select coalesce(sum(quantity_good),0) quantity from local_production_effective_stage_good where production_order_id=$1 and production_batch_id=$2 and order_item_id=$3 and stage='COUNTING'",[a.production_order_id,a.production_batch_id,a.order_item_id])).rows[0].quantity;
        if((await client.query('select $1::numeric-$2::numeric<$3::numeric blocked',[good,e.quantity_good,posted])).rows[0].blocked)fail('Số kiểm đếm đã nhập kho, không thể đảo báo cáo.',409);
      }
      await client.query("select set_config('app.dispatch_write','on',true)");
      let entryId = e.production_entry_id;
      if (a.dispatch_stage === 'SEWING' && !a.repair_ticket_id && target === 'APPROVED' && e.is_payable !== false && Number(e.quantity_good) > 0) {
        const rate = await selectRuntimePieceRate(client, { date: String(e.work_date), pieceRateCode: a.piece_rate_code });
        if (String(rate.rate_unit) !== String(a.rate_unit)) fail('Mã công may phải có một đơn giá đã duyệt, cùng đơn vị tại ngày làm.', 409);
        const entry = await d.createEntry({ worker_id: a.worker_id, piece_rate_code: a.piece_rate_code, work_date: e.work_date, quantity: e.quantity_good, notes: e.notes || `Giao việc ${a.id}`, idempotency_key: `dispatch-pay:${e.id}`, source_stage_event_id:e.id }, undefined, client);
        entryId = String(entry.id);
        await client.query("update local_production_entries set source_stage_event_id=$2,workflow_status='APPROVED',workflow_reason=$3,workflow_actor_id=$4,workflow_at=now() where id=$1", [entryId, e.id, reason || null, d.actor()]);
        await d.workflowEvent(client, 'PRODUCTION_ENTRY', String(entryId), 'STATUS', 'SUBMITTED', 'APPROVED', reason || null, `dispatch-approve:${key}`);
      }
      if (entryId && target === 'REVERSED') {
        const entry = (await client.query('select * from local_production_entries where id=$1 for update', [entryId])).rows[0];
        if (!entry || entry.workflow_status !== 'APPROVED') fail('Dòng tiền lương đã khóa hoặc thay đổi, không thể đảo.');
        await client.query("update local_production_entries set is_reversed=true,workflow_status='REVERSED',reversal_reason=$2,workflow_reason=$2,workflow_actor_id=$3,workflow_at=now() where id=$1", [entryId, reason, d.actor()]);
        await d.workflowEvent(client, 'PRODUCTION_ENTRY', String(entryId), 'REVERSE', 'APPROVED', 'REVERSED', reason, `dispatch-reverse:${key}`);
      }
      const row = (await client.query("update local_production_stage_events set status=$2,production_entry_id=$3,approved_by=case when $2='APPROVED' then $4 else approved_by end,reviewed_at=now(),review_reason=$5,reversed_by=case when $2='REVERSED' then $4 else reversed_by end,reversed_at=case when $2='REVERSED' then now() else reversed_at end,reversal_reason=case when $2='REVERSED' then $5 else reversal_reason end,updated_at=now() where id=$1 returning *", [e.id, target, entryId, d.actor(), reason || null])).rows[0];
      await audit(client, a.production_order_id, target, row, req.body, e.quantity_received); return row;
    })); } catch (error) { d.sendError(res, error); }
  });
  for (const method of ['post', 'patch'] as const) app[method](`/api/production-dispatch/batches${method === 'patch' ? '/:id' : ''}`, async (req, res) => {
    const routeId = String((req.params as Record<string, string | undefined>).id || '');
    try { res.json(await mutate(`BATCH:${method}:${routeId}`, req.body, async (client) => {
      await manager(client);
      const pointer = method === 'patch' ? (await client.query('select production_order_id from local_production_batches where id=$1', [routeId])).rows[0] : null;
      const orderId = pointer?.production_order_id || req.body.production_order_id;
      const { order } = await lockParent(client, orderId);
      const qty = quantity(req.body.planned_quantity);
      const sum = (await client.query('select coalesce(sum(planned_quantity),0) qty from local_production_batches where production_order_id=$1 and ($2::uuid is null or id<>$2)', [orderId, method === 'patch' ? routeId : null])).rows[0].qty;
      if ((await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds', [sum, qty, order.quantity_planned])).rows[0].exceeds) fail('Tổng kế hoạch các lô vượt kế hoạch lệnh.');
      if (method === 'patch') {
        const batch = (await client.query('select status from local_production_batches where id=$1 and production_order_id=$2 for update', [routeId, orderId])).rows[0];
        if (!batch) fail('Không tìm thấy lô.');
        if (batch.status !== 'PLANNED') fail('Chỉ sửa lô chưa bắt đầu.');
        if((await client.query('select 1 from local_production_uncut_cancellations where production_batch_id=$1 limit 1',[routeId])).rows[0])fail('Lô đã có hủy phần chưa cắt; không sửa kế hoạch gốc.');
        if ((await client.query('select 1 from local_assignments where production_batch_id=$1 and dispatch_stage is not null limit 1', [routeId])).rows[0]) fail('Lô đã giao việc, không thể sửa kế hoạch.');
        if (!String(req.body.reason || '').trim()) fail('Sửa kế hoạch lô phải có lý do.');
      }
      const row = method === 'post' ? (await client.query('insert into local_production_batches(production_order_id,batch_number,planned_quantity,created_by) values($1,$2,$3,$4) returning *', [orderId, String(req.body.batch_number || '').trim() || fail('Cần mã lô.'), qty, d.actor()])).rows[0] : (await client.query('update local_production_batches set planned_quantity=$2,updated_at=now() where id=$1 returning *', [routeId, qty])).rows[0];
      await audit(client, orderId, method === 'post' ? 'CREATE_BATCH' : 'CHANGE_BATCH', row, req.body, qty); return row;
    })); } catch (error) { d.sendError(res, error); }
  });
  app.post('/api/production-dispatch/batches/:id/split', async (req,res) => {
    try { res.json(await mutate(`SPLIT_BATCH:${req.params.id}`,req.body,async (client) => {
      await manager(client);
      const pointer = (await client.query('select production_order_id from local_production_batches where id=$1',[req.params.id])).rows[0];
      if (!pointer) fail('Không tìm thấy lô.');
      await lockParent(client,pointer.production_order_id);
      const batch = (await client.query('select * from local_production_batches where id=$1 for update',[req.params.id])).rows[0];
      if (batch.status !== 'PLANNED') fail('Chỉ tách lô chưa bắt đầu.');
      if((await client.query('select 1 from local_production_uncut_cancellations where production_batch_id=$1 limit 1',[req.params.id])).rows[0])fail('Lô đã có hủy phần chưa cắt; không tách hoặc chuyển số hủy sang lô khác.');
      if ((await client.query('select 1 from local_assignments where production_batch_id=$1 and dispatch_stage is not null limit 1',[req.params.id])).rows[0]) fail('Lô đã giao việc, không thể tách.');
      const qty = quantity(req.body.planned_quantity);
      if ((await client.query('select $1::numeric>=$2::numeric exceeds',[qty,batch.planned_quantity])).rows[0].exceeds) fail('Số lượng tách phải nhỏ hơn số lượng lô gốc.');
      const reason = String(req.body.reason || '').trim(), number = String(req.body.batch_number || '').trim();
      if (!reason || !number) fail('Tách lô phải nhập mã lô mới và lý do.');
      await client.query('update local_production_batches set planned_quantity=planned_quantity-$2::numeric,updated_at=now() where id=$1',[req.params.id,qty]);
      const row = (await client.query('insert into local_production_batches(production_order_id,batch_number,planned_quantity,created_by) values($1,$2,$3,$4) returning *',[pointer.production_order_id,number,qty,d.actor()])).rows[0];
      await audit(client,pointer.production_order_id,'SPLIT_BATCH',{...row,source_batch_id:batch.id},req.body,qty);
      return row;
    })); } catch(error) { d.sendError(res,error); }
  });
  return {reportLinkedOutput};
}
