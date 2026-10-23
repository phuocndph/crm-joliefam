import type { Pool, PoolClient } from 'pg';
import { canonicalQuote, quoteObject } from './quote-calculation.js';
type Database = Pool | PoolClient;
export function stableQuoteFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableQuoteFingerprint).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableQuoteFingerprint(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export async function quoteOwnerScope(db: Database, actor: string, role: string, requested?: unknown) {
  const wanted = String(requested ?? '').trim();
  if (role === 'admin') return wanted === 'all' ? '' : wanted;
  if (!actor || !['manager', 'employee', 'accountant', 'team_leader'].includes(role)) throw Object.assign(new Error('Không có quyền truy cập báo giá.'), { status: 403 });
  const assignment = ['employee', 'accountant'].includes(role)
    ? (await db.query('select nullif(btrim(assigned_by),\'\') assigned_by from local_user_roles where user_id=$1 and role=$2 and is_active limit 1', [actor, role])).rows[0]?.assigned_by : null;
  const owner = assignment || actor;
  if (wanted && wanted !== 'all' && wanted !== owner) throw Object.assign(new Error('Báo giá không thuộc phạm vi phụ trách của bạn.'), { status: 403 });
  return owner;
}
export async function requireQuoteScope(db: Database, actor: string, role: string, row: Record<string, unknown>) {
  const scope = await quoteOwnerScope(db, actor, role);
  if (scope && row.manager_id !== scope) throw Object.assign(new Error('Báo giá không thuộc phạm vi phụ trách của bạn.'), { status: 403 });
}
export const assertQuoteStatus = (body: Record<string, unknown>) => {
  if (body.status !== undefined && !['draft', 'sent', 'rejected', 'expired'].includes(String(body.status)))
    throw Object.assign(new Error('Chỉ thao tác Duyệt báo giá được chuyển sang đã duyệt.'), { status: 400 });
};
export const publicQuoteData = (value: unknown) => {
  // Historical imported metadata must not make an entire read/list fail. Writes remain strict.
  try { const data = quoteObject(value); delete data.__local_create_receipt; return data; } catch { return {}; }
};
export function approvalFinancialSnapshot(quote: Record<string, unknown>) {
  try {
    const result = canonicalQuote(quote);
    for (const key of ['subtotal', 'vat_rate', 'vat_amount', 'total_amount'] as const)
      if (Number(quote[key]) !== result[key]) throw new Error('Tổng tiền hoặc VAT không khớp dòng sản phẩm.');
    if (quote.include_vat !== result.include_vat) throw new Error('Tùy chọn VAT không khớp.');
    return result;
  } catch (error) {
    throw Object.assign(new Error(`Báo giá cũ chưa hợp lệ: ${(error as Error).message} Hãy sửa bản nháp hoặc nhân bản để kiểm tra lại trước khi duyệt.`), { status: 409 });
  }
}
