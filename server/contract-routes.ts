import { requireInvoiceCompany } from './invoice-workspace.js';
import { invoiceContractCash } from './invoice-dossier.js';
import type { Express, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { canonicalContract, contractFinancialFields, normalizedContractDates, validateContract, validateContractBuyer, validateContractDates } from './contract-calculation.js';
import { quoteObject, validateQuoteMoney } from './quote-calculation.js';
import { contractPrincipal, contractOwner, contractCreationOwner, contractLinkTenant, requireContract, validateContractLinks, canTemplate } from './contract-policy.js';

type Row = Record<string, unknown>;
type Dependencies = { app: Express; pool: Pool; actor: () => string; role: () => string; contractRow: (row: Row) => Row; invoiceRow: (row: Row) => Row; sendError: (res: Response, error: unknown) => unknown; simplePdf: (lines: string[]) => string };
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const jsonFields = new Set(['items', 'terms', 'legal_basis', 'articles', 'seller_info', 'buyer_info', 'document_overrides', 'payment_terms', 'item_columns']);
const contractFields = ['contract_number','customer_id','quote_id','order_id','template_id','title','status','contract_date','start_date','end_date','subtotal','vat_rate','vat_amount','total_amount','deposit_amount','deposit_percentage','include_vat','items','terms','legal_basis','articles','seller_info','buyer_info','content','document_overrides','notes'];
const templateFields = ['name','legal_basis','seller_info','item_columns','articles','include_vat','vat_rate','payment_terms'];
const encode = (field: string, value: unknown) => jsonFields.has(field) ? JSON.stringify(value) : value;
async function update(db: PoolClient, table: string, id: string, body: Row, allowed: string[]) {
  const fields = allowed.filter(key => Object.prototype.hasOwnProperty.call(body, key));
  if (!fields.length) fail('Không có dữ liệu cần cập nhật.');
  const values: unknown[] = [id];
  const set = fields.map(key => { values.push(encode(key, body[key])); return `${key}=$${values.length}${jsonFields.has(key) ? '::jsonb' : ''}`; });
  return (await db.query(`update ${table} set ${set.join(',')},local_modified_at=now(),updated_at=now() where id=$1 returning *`, values)).rows[0];
}
export function registerContractRoutes(d: Dependencies) {
  const { app, pool } = d;
  const principal = (db: Pool | PoolClient = pool) => contractPrincipal(db, d.actor(), d.role());
  const tx = async <T>(operation: (db: PoolClient) => Promise<T>) => { const db = await pool.connect(); try { await db.query('begin'); const result = await operation(db); await db.query('commit'); return result; } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); } };
  const handler = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => { try { await fn(req, res); } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === '23505') Object.assign(error, { status: 409 }); d.sendError(res, error); } };
  const loadContract = async (db: Pool | PoolClient, id: string, lock = false) => { const row = (await db.query(`select * from local_contracts where id=$1${lock ? ' for update' : ''}`, [id])).rows[0]; if (!row) fail('Không tìm thấy hợp đồng.', 404); requireContract(await principal(db), row); return row; };
  app.get('/api/contracts', handler(async (req, res) => {
    const owner = contractOwner(await principal(), req.query.managerId);
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const { rows } = await pool.query(`select c.*,cu.name customer_name,cu.email customer_email,cu.phone customer_phone,cu.address customer_address,cu.company customer_company from local_contracts c left join local_customers cu on cu.id=c.customer_id where ($1::text is null or c.manager_id=$1) and ($2='' or lower(concat_ws(' ',c.contract_number,c.title,cu.name,cu.company,c.buyer_info->>'company_name')) like '%'||$2||'%') order by c.created_at desc nulls last`, [owner, search]);
    res.json(rows.map(d.contractRow));
  }));
  app.post('/api/contracts', handler(async (req, res) => {
    const row = await tx(async db => {
      const p = await principal(db), b = normalizedContractDates(req.body) as Row;
      let requestedOwner = b.manager_id;
      if (p.role === 'admin' && requestedOwner == null) {
        for (const [field,table] of [['quote_id','local_quotes'],['order_id','local_orders'],['customer_id','local_customers']]) {
          if (!b[field]) continue;
          const linked = (await db.query(`select manager_id from ${table} where id=$1`,[b[field]])).rows[0];
          if (linked) { requestedOwner = linked.manager_id; break; }
        }
      }
      const owner = contractCreationOwner(p, requestedOwner);
      b.manager_id = owner; b.tenant_id = await contractLinkTenant(db,b); b.contract_number = String(b.contract_number ?? '').trim();
      validateContract(b); await validateContractLinks(db, p, b);
      Object.assign(b, canonicalContract(b));
      const fields = contractFields.filter(key => b[key] !== undefined);
      const values = fields.map(key => encode(key, b[key])); values.push(owner,b.tenant_id);
      const row = (await db.query(`insert into local_contracts(id,${fields.join(',')},manager_id,tenant_id,created_at,updated_at,is_snapshot_record,local_modified_at) values(gen_random_uuid()::text,${fields.map((key, i) => `$${i + 1}${jsonFields.has(key) ? '::jsonb' : ''}`).join(',')},$${values.length-1},$${values.length},now(),now(),false,now()) returning *`, values)).rows[0];
      return row;
    }); res.status(201).json(d.contractRow(row));
  }));
  app.patch('/api/contracts/:id', handler(async (req, res) => {
    const row = await tx(async db => {
      const previous = await loadContract(db, String(req.params.id), true), p = await principal(db), b = normalizedContractDates(req.body) as Row;
      if ('manager_id' in b && b.manager_id !== previous.manager_id) fail('Không đổi người phụ trách qua chỉnh sửa hợp đồng.', 403);
      const merged = { ...previous, ...b };
      // Historical records retain their financial snapshot when only notes/document text change.
      validateContractDates(merged);
      if ('contract_number' in b && !String(b.contract_number ?? '').trim()) fail('Số hợp đồng là bắt buộc.');
      if ('status' in b && !['draft','active','completed','cancelled'].includes(String(b.status))) fail('Trạng thái hợp đồng không hợp lệ.');
      if ('buyer_info' in b && JSON.stringify(b.buyer_info) !== JSON.stringify(previous.buyer_info)) validateContractBuyer(b.buyer_info);
      if (['customer_id','quote_id','order_id','template_id'].some(key => key in b && (b[key] ?? null) !== (previous[key] ?? null))) await validateContractLinks(db, p, merged);
      if (contractFinancialFields.some(key => key in b) || 'seller_info' in b && quoteObject(b.seller_info).deposit_mode !== quoteObject(previous.seller_info).deposit_mode) { validateContract(merged); Object.assign(b, canonicalContract(merged)); }
      return update(db, 'local_contracts', String(req.params.id), b, contractFields);
    }); res.json(d.contractRow(row));
  }));
  app.delete('/api/contracts/:id', handler(async (req, res) => {
    await tx(async db => { await loadContract(db, String(req.params.id), true); const linked = await db.query('select 1 from local_einvoices where contract_id=$1 limit 1', [req.params.id]); if (linked.rowCount) fail('Hợp đồng đã có hóa đơn liên kết. Hãy hủy hợp đồng để giữ chứng từ.', 409); await db.query('delete from local_contracts where id=$1', [req.params.id]); }); res.json({ id: req.params.id });
  }));
  app.get('/api/contracts/:id/payment-summary', handler(async (req, res) => {
    const result = await tx(async db => {
      const c = await loadContract(db, String(req.params.id));
      const cash=await invoiceContractCash(db,c,await principal(db));
      if(!cash.known||cash.amount==null)return {known:false,paid:null,remaining:null,reason:cash.reason};
      const remaining=(await db.query('select greatest(0,$1::numeric-$2::numeric)::text remaining',[c.total_amount,cash.amount])).rows[0].remaining;
      return {known:true,paid:Number(cash.amount),remaining:Number(remaining),reason:cash.reason};
    }); res.json(result);
  }));
  app.get('/api/contract-templates', handler(async (_req, res) => { const p = await principal(); const rows = (await pool.query('select * from local_contract_templates order by created_at desc nulls last')).rows.filter(row => canTemplate(p, row)); res.json(rows.map(row => ({ ...row, vat_rate: Number(row.vat_rate) }))); }));
  app.post('/api/contract-templates', handler(async (req, res) => {
    const p = await principal(); if (!['admin','manager'].includes(p.role)) fail('Chỉ quản trị viên/quản lý được sửa mẫu hợp đồng.', 403);
    const b = req.body as Row; if (!String(b.name ?? '').trim()) fail('Tên mẫu hợp đồng là bắt buộc.');
    const vat = validateQuoteMoney(b.vat_rate ?? 0, 'Thuế VAT'); if (vat > 100) fail('VAT phải từ 0 đến 100%.');
    const fields = templateFields.filter(key => b[key] !== undefined), values = fields.map(key => encode(key, b[key])); values.push(p.actor);
    const row = (await pool.query(`insert into local_contract_templates(id,${fields.join(',')},manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,${fields.map((key, i) => `$${i + 1}${jsonFields.has(key) ? '::jsonb' : ''}`).join(',')},$${values.length},'local-tenant',false,now(),now(),now()) returning *`, values)).rows[0]; res.status(201).json(row);
  }));
  for (const method of ['patch','delete'] as const) app[method]('/api/contract-templates/:id', handler(async (req, res) => {
    const row = await tx(async db => { const old = (await db.query('select * from local_contract_templates where id=$1 for update', [req.params.id])).rows[0]; if (!old) fail('Không tìm thấy mẫu hợp đồng.', 404); if (!canTemplate(await principal(db), old, true)) fail('Không có quyền sửa mẫu hợp đồng.', 403); if (method === 'delete') { await db.query('delete from local_contract_templates where id=$1', [req.params.id]); return { id: req.params.id }; } const b = req.body as Row; if ('vat_rate' in b && validateQuoteMoney(b.vat_rate, 'VAT') > 100) fail('VAT phải từ 0 đến 100%.'); return update(db, 'local_contract_templates', String(req.params.id), b, templateFields); }); res.json(row);
  }));
  app.get('/api/einvoices', handler(async (req, res) => { const p = await principal(); const all = (await pool.query("select * from local_einvoices where ($1='' or contract_id=$1) order by created_at desc", [String(req.query.contractId ?? '')])).rows;const rows=[];for(const row of all){try{await requireInvoiceCompany(pool,p,row);rows.push(row);}catch{/* Exclude invoices outside the caller's company access. */}}res.json(rows.map(d.invoiceRow)); }));
  app.post('/api/einvoices/draft', handler(async (_req, _res) => {
    await principal();
    fail('Luồng tạo nháp cũ đã đóng. Dùng workspace hóa đơn, chọn doanh nghiệp và nguồn hợp đồng để kiểm tra quyền, revision và phần còn lại.', 409);
  }));
  app.post('/api/einvoices/:id/issue', handler(async (req, _res) => { const row = (await pool.query('select * from local_einvoices where id=$1', [req.params.id])).rows[0]; if (!row) fail('Không tìm thấy hóa đơn.', 404); await requireInvoiceCompany(pool,await principal(),row,'draft'); fail('Bản local chỉ lưu hóa đơn nháp, không phát hành Viettel. Trạng thái chứng từ được giữ nguyên.', 409); }));
  app.post('/api/einvoices/:id/preview', handler(async (req, res) => {
    const row = (await pool.query('select * from local_einvoices where id=$1', [req.params.id])).rows[0]; if (!row) fail('Không tìm thấy hóa đơn.', 404); await requireInvoiceCompany(pool,await principal(),row);
    const invoice = d.invoiceRow(row), base64 = d.simplePdf(['CRM LOCAL - BAN XEM NOI BO', `Ma: ${invoice.invoice_number || invoice.id}`, `Khach hang: ${invoice.buyer_name || ''}`, `Tong tien: ${invoice.total_with_vat || 0} ${invoice.currency || 'VND'}`, 'Khong thay the hoa don dien tu da phat hanh.']);
    res.json({ success: true, local_only: true, invoice, base64, fileType: 'PDF', fileName: `invoice-${invoice.id}.pdf` });
  }));
  app.delete('/api/einvoices/:id', handler(async (req, res) => { await tx(async db => { const row = (await db.query('select * from local_einvoices where id=$1 for update', [req.params.id])).rows[0]; if (!row) fail('Không tìm thấy hóa đơn.', 404); await requireInvoiceCompany(db,await principal(db),row,'draft');if(row.company_id)fail('Dùng workspace để hủy nháp có revision và giữ lịch sử.',409); if (row.is_snapshot_record || !row.is_draft || !['draft','local_draft'].includes(String(row.status)) || row.invoice_action !== 'local_draft') fail('Chỉ xóa được hóa đơn nháp tạo tại local.', 409); await db.query('delete from local_einvoices where id=$1', [req.params.id]); }); res.json({ success: true, id: req.params.id, local_only: true }); }));
}
