import type { Pool, PoolClient } from 'pg';
type Db = Pool | PoolClient;
export type ContractPrincipal = { actor: string; role: string; assigned: string | null };
const forbidden = (): never => { throw Object.assign(new Error('Chứng từ không thuộc phạm vi phụ trách của bạn.'), { status: 403 }); };
export async function contractPrincipal(db: Db, actor: string, role: string): Promise<ContractPrincipal> {
  if (!actor || !['admin', 'manager', 'employee', 'accountant', 'team_leader'].includes(role)) forbidden();
  const assigned = ['employee', 'accountant'].includes(role) ? (await db.query('select assigned_by from local_user_roles where user_id=$1 and role=$2 and is_active limit 1', [actor, role])).rows[0]?.assigned_by ?? null : null;
  return { actor, role, assigned };
}
export function contractOwner(p: ContractPrincipal, requested?: unknown): string | null {
  const wanted = String(requested ?? '').trim();
  if (p.role === 'admin' || p.role === 'accountant') return !wanted || wanted === 'all' ? null : wanted;
  const owner = p.role === 'manager' ? p.actor : p.assigned;
  if (!owner || wanted && wanted !== 'all' && wanted !== owner) forbidden();
  return owner;
}
export function contractCreationOwner(p: ContractPrincipal, requested?: unknown): string | null {
  if (p.role === 'admin') return requested == null || requested === '' ? null : String(requested);
  const owner = p.role === 'manager' ? p.actor : p.assigned;
  if (!owner) forbidden();
  return owner;
}
export function requireContract(p: ContractPrincipal, row: Record<string, unknown>) { const owner = contractOwner(p); if (owner && row.manager_id !== owner) forbidden(); }
export function canTemplate(p: ContractPrincipal, row: Record<string, unknown>, write = false) {
  if (p.role === 'admin') return true;
  if (p.role === 'manager') return row.manager_id == null || row.manager_id === p.actor;
  if (write) return false;
  return p.role === 'accountant' || Boolean(p.assigned && row.manager_id === p.assigned);
}
export function canInvoice(p: ContractPrincipal, row: Record<string, unknown>, write = false) {
  if (p.role === 'admin' || row.manager_id === p.actor) return true;
  return !write && ['employee', 'accountant'].includes(p.role) && Boolean(p.assigned && row.manager_id === p.assigned);
}
export function requireInvoice(p: ContractPrincipal, row: Record<string, unknown>, write = false) { if (!canInvoice(p, row, write)) forbidden(); }
export async function validateContractLinks(db: Db, p: ContractPrincipal, body: Record<string, unknown>) {
  for (const [field, table] of [['customer_id', 'local_customers'], ['quote_id', 'local_quotes'], ['order_id', 'local_orders'], ['template_id', 'local_contract_templates']]) {
    if (!body[field]) continue;
    const row = (await db.query(`select * from ${table} where id=$1`, [body[field]])).rows[0];
    if (!row) throw Object.assign(new Error('Dữ liệu liên kết hợp đồng không tồn tại.'), { status: 400 });
    if (field === 'template_id') { if (!canTemplate(p, row)) forbidden(); }
    else { requireContract(p, row); if ((row.manager_id ?? null) !== (body.manager_id ?? null)) forbidden(); }
    if (row.tenant_id && body.tenant_id && row.tenant_id !== body.tenant_id && !(field === 'template_id' && row.manager_id == null)) forbidden();
    if ((field === 'quote_id' || field === 'order_id') && body.customer_id && row.customer_id && row.customer_id !== body.customer_id) throw Object.assign(new Error('Khách hàng không khớp báo giá/đơn hàng liên kết.'), { status: 400 });
  }
}
export async function contractLinkTenant(db: Db, body: Record<string, unknown>) {
  for (const [field, table] of [['quote_id','local_quotes'],['order_id','local_orders'],['customer_id','local_customers']]) {
    if (!body[field]) continue;
    const row = (await db.query(`select tenant_id from ${table} where id=$1`, [body[field]])).rows[0];
    if (row?.tenant_id) return row.tenant_id as string;
  }
  return 'local-tenant';
}
