import { calculateQuote, businessDecimal, roundBusinessAmount, quoteObject, validateQuoteMoney } from './quote-calculation.js';
import { businessDateKey } from './business-date.js';

const invalid = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };
export const contractFinancialFields = ['items', 'include_vat', 'vat_rate', 'subtotal', 'vat_amount', 'total_amount', 'deposit_amount', 'deposit_percentage'];
export const frameworkContract = (body: Record<string, unknown>) => String(body.contract_number ?? '').startsWith('HDNT-');
export function contractBusinessDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '';
  return businessDateKey(date);
}
export function contractDateLabel(value: unknown): string {
  const day = contractBusinessDate(value);
  return day ? day.split('-').reverse().join('/') : '—';
}
/** Ignore empty quote-template placeholders only while prefilling a new form. */
export function contractPrefillItems(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
    const row = item as Record<string,unknown>;
    const emptyText = ['name','specifications','description','details','sku','notes'].every(key => row[key] == null || typeof row[key] === 'string' && !row[key].trim());
    const zero = (raw: unknown) => raw == null || raw === '' || (typeof raw === 'string' || typeof raw === 'number') && Number.isFinite(Number(raw)) && Number(raw) === 0;
    const emptyQuantity = row.quantity == null || row.quantity === '' || row.quantity === 0 || row.quantity === 1 || row.quantity === '0' || row.quantity === '1';
    return !(emptyText && zero(row.price) && zero(row.total) && emptyQuantity);
  }).map(item => item && typeof item === 'object' && !Array.isArray(item) ? item : { name: '', quantity: 0, price: 0, notes: 'Dòng báo giá không hợp lệ.' });
}
export function validateContractBuyer(value: unknown) {
  const buyer = quoteObject(value);
  if (typeof buyer.company_name !== 'string' || !buyer.company_name.trim()) invalid('Tên công ty/cá nhân Bên B là bắt buộc.');
}
export function normalizedContractDates(body: Record<string, unknown>) {
  const result = { ...body };
  for (const field of ['contract_date','start_date','end_date']) {
    const raw = result[field];
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) result[field] = raw+'T00:00:00.000Z';
  }
  return result;
}
export function validateContractDates(body: Record<string, unknown>) {
  for (const field of ['contract_date', 'start_date', 'end_date']) {
    const raw = body[field];
    if (raw == null || raw === '') continue;
    if (raw instanceof Date) {
      if (!Number.isFinite(raw.getTime())) invalid('Ngày hợp đồng không hợp lệ.');
      continue;
    }
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw.slice(0,10)+'T00:00:00Z').toISOString().slice(0, 10) !== raw.slice(0, 10)) invalid('Ngày hợp đồng không hợp lệ.');
  }
  if (body.start_date && body.end_date && Date.parse(String(body.end_date)) < Date.parse(String(body.start_date))) invalid('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
}
export function canonicalContract(body: Record<string, unknown>) {
  const seller = quoteObject(body.seller_info);
  for (const field of ['subtotal', 'vat_amount', 'total_amount', 'deposit_amount']) if (body[field] !== undefined) validateQuoteMoney(body[field], field);
  const rate = businessDecimal(body.deposit_percentage ?? 0, 'Tỷ lệ đặt cọc', 3);
  const percent = rate.value;
  if (percent > 100) invalid('Tỷ lệ đặt cọc phải từ 0 đến 100%.');
  const mode = seller.deposit_mode ?? (percent > 0 ? 'percent' : 'amount');
  if (!['none', 'percent', 'amount'].includes(String(mode))) invalid('Cách đặt cọc không hợp lệ.');
  const framework = frameworkContract(body);
  if (framework && (body.items == null || Array.isArray(body.items) && !body.items.length)) {
    if (['subtotal', 'vat_amount', 'total_amount', 'deposit_amount'].some(key => Number(body[key] ?? 0) !== 0)) invalid('Hợp đồng nguyên tắc không có bảng sản phẩm phải có giá trị bằng 0.');
    return { items: [], subtotal: 0, vat_amount: 0, total_amount: 0, include_vat: false, vat_rate: 0, deposit_amount: 0, deposit_percentage: 0, seller_info: { ...seller, deposit_mode: 'none' } };
  }
  const calc = calculateQuote({ items: body.items, includeVAT: body.include_vat, vatRate: body.vat_rate });
  const deposit = mode === 'none' ? 0 : mode === 'percent' ? roundBusinessAmount(BigInt(calc.total) * rate.numerator, rate.denominator * 100n) : validateQuoteMoney(body.deposit_amount ?? 0, 'Tiền đặt cọc');
  if (deposit > calc.total) invalid('Tiền đặt cọc không được vượt giá trị hợp đồng.');
  return { items: calc.items, subtotal: calc.subtotal, vat_amount: calc.vatAmount, total_amount: calc.total, include_vat: calc.includeVAT, vat_rate: calc.vatRate, deposit_amount: deposit, deposit_percentage: mode === 'percent' ? percent : 0, seller_info: { ...seller, deposit_mode: mode } };
}
export function validateContract(body: Record<string, unknown>) {
  if (typeof body.contract_number !== 'string' || !body.contract_number.trim()) invalid('Số hợp đồng là bắt buộc.');
  validateContractBuyer(body.buyer_info);
  if (!['draft', 'active', 'completed', 'cancelled'].includes(String(body.status ?? 'draft'))) invalid('Trạng thái hợp đồng không hợp lệ.');
  validateContractDates(body);
}
