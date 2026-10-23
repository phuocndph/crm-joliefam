/** Pure shared quote arithmetic (also re-exported by the frontend): round lines and VAT half-up to whole VND. */
const failure = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };
const decimal = (value: unknown, label: string, places = 6) => {
  if (typeof value !== 'number' && typeof value !== 'string') return failure(`${label} phải là số hợp lệ.`);
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) return failure(`${label} phải là số không âm hữu hạn.`);
  const [whole, fraction = ''] = text.split('.');
  if (fraction.replace(/0+$/, '').length > places || text.length > 40) return failure(`${label} có quá nhiều chữ số thập phân.`);
  const reduced = fraction.replace(/0+$/, '');
  const numerator = BigInt(whole + reduced), denominator = 10n ** BigInt(reduced.length);
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) * denominator) return failure(`${label} vượt giới hạn cho phép.`);
  return { numerator, denominator, value: Number(text) };
};
const rounded = (numerator: bigint, denominator: bigint) => {
  const result = (numerator * 2n + denominator) / (denominator * 2n);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) return failure('Giá trị báo giá vượt giới hạn cho phép.');
  return Number(result);
};
export const quoteObject = (value: unknown): Record<string, unknown> => {
  if (value == null) return {};
  let parsed = value;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { return failure('Dữ liệu báo giá không phải JSON hợp lệ.'); } }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return failure('Dữ liệu báo giá phải là object.');
  return { ...parsed as Record<string, unknown> };
};
/** Tolerant legacy display adapter, never used by strict write validation. */
export function quoteDisplayItems(value: unknown): Record<string, unknown>[] {
  let source = value;
  if (typeof source === 'string') { try { source = JSON.parse(source); } catch { return []; } }
  return Array.isArray(source) ? source.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    // Reject corrupt display rows rather than rendering objects as React children or product names.
    if (!['name', 'sku'].every(key => row[key] == null || typeof row[key] === 'string')) return false;
    return ['quantity', 'price', 'total'].every(key => row[key] == null ||
      (typeof row[key] === 'number' || typeof row[key] === 'string') && Number.isFinite(Number(row[key])));
  }) : [];
}
export function quoteContactSnapshot(quote: Record<string, unknown>, data: Record<string, unknown>, key: string, pattern: RegExp, fallback = '') {
  if (Object.prototype.hasOwnProperty.call(data, key)) return String(data[key] ?? '');
  if (Object.prototype.hasOwnProperty.call(quote, key)) return String(quote[key] ?? '');
  const match = String(quote.notes ?? '').match(pattern);
  return match ? (match[1] ?? '').trim() : fallback;
}
export type CalculatedQuoteItem = Record<string, unknown> & { name: string; quantity: number; price: number; total: number; sku?: string; specifications?: string; description?: string; selectedImage?: string; category?: string; notes?: string };
export function quoteLineAmount(quantity: unknown, price: unknown) {
  const q = decimal(quantity, 'Số lượng'), p = decimal(price, 'Đơn giá');
  return rounded(q.numerator * p.numerator, q.denominator * p.denominator);
}
export function calculateQuote(input: { items: unknown; includeVAT?: unknown; vatRate?: unknown; payment1?: unknown; payment2?: unknown }) {
  let source = input.items;
  if (typeof source === 'string') { try { source = JSON.parse(source); } catch { return failure('Danh sách sản phẩm không phải JSON hợp lệ.'); } }
  if (!Array.isArray(source) || !source.length || source.length > 1000) return failure('Báo giá cần từ 1 đến 1.000 dòng sản phẩm hợp lệ.');
  const items: CalculatedQuoteItem[] = source.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failure(`Dòng ${index + 1} không hợp lệ.`);
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== 'string' || !item.name.trim()) return failure(`Dòng ${index + 1} cần tên sản phẩm.`);
    const quantity = decimal(item.quantity, `Số lượng dòng ${index + 1}`);
    if (quantity.numerator === 0n) return failure(`Số lượng dòng ${index + 1} phải lớn hơn 0.`);
    const price = decimal(item.price, `Đơn giá dòng ${index + 1}`);
    if (item.total !== undefined) decimal(item.total, `Thành tiền dòng ${index + 1}`);
    return { ...item, name: item.name.trim(), quantity: quantity.value, price: price.value,
      total: rounded(quantity.numerator * price.numerator, quantity.denominator * price.denominator) };
  });
  if (input.includeVAT !== undefined && typeof input.includeVAT !== 'boolean') return failure('Tùy chọn VAT phải là boolean.');
  const rate = decimal(input.vatRate ?? 0, 'Thuế VAT', 3);
  if (rate.value > 100) return failure('Thuế VAT phải từ 0 đến 100%.');
  const payment1 = decimal(input.payment1 ?? 0, 'Dự kiến thanh toán lần 1').value;
  const payment2 = decimal(input.payment2 ?? 0, 'Dự kiến thanh toán lần 2').value;
  const subtotalBig = items.reduce((sum, item) => sum + BigInt(item.total), 0n);
  const subtotal = rounded(subtotalBig, 1n);
  const includeVAT = input.includeVAT ?? false;
  const vatAmount = includeVAT ? rounded(subtotalBig * rate.numerator, rate.denominator * 100n) : 0;
  const total = rounded(subtotalBig + BigInt(vatAmount), 1n);
  return { items, subtotal, includeVAT: Boolean(includeVAT), vatRate: rate.value, vatAmount, total, payment1, payment2, remaining: total - payment1 - payment2 };
}
/** Explicit client monetary fields may be inaccurate, but never malformed/negative. */
export function validateQuoteMoney(value: unknown, label: string) { return decimal(value, label).value; }
/** Read/approval checks must not silently replace a saved financial snapshot with recomputed values. */
export function assertSavedQuoteFinancials(source: Record<string, unknown>, result: ReturnType<typeof calculateQuote>, data = quoteObject(source.quote_data)) {
  const compare = (value: unknown, expected: number, label: string) => {
    const saved = decimal(value, label), canonical = decimal(expected, label);
    if (saved.numerator * canonical.denominator !== canonical.numerator * saved.denominator)
      failure(`${label} đã lưu không khớp dòng sản phẩm/VAT. Hãy sửa bản nháp hoặc nhân bản để kiểm tra lại.`);
  };
  const rootFields = { subtotal: result.subtotal, vat_rate: result.vatRate, vat_amount: result.vatAmount, total_amount: result.total };
  for (const [field, expected] of Object.entries(rootFields)) if (Object.prototype.hasOwnProperty.call(source, field)) compare(source[field], expected, field);
  const dataFields = { subtotal: result.subtotal, vatRate: result.vatRate, vatAmount: result.vatAmount, total: result.total, totalAmount: result.total };
  for (const [field, expected] of Object.entries(dataFields)) if (Object.prototype.hasOwnProperty.call(data, field)) compare(data[field], expected, `Snapshot ${field}`);
  if (Object.prototype.hasOwnProperty.call(source, 'include_vat') && source.include_vat !== result.includeVAT) failure('Tùy chọn VAT đã lưu không khớp.');
  if (Object.prototype.hasOwnProperty.call(data, 'includeVAT') && data.includeVAT !== result.includeVAT) failure('Snapshot tùy chọn VAT đã lưu không khớp.');
  const items = typeof source.items === 'string' ? JSON.parse(source.items) : source.items;
  if (Array.isArray(items)) items.forEach((item, index) => {
    if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'total')) compare(item.total, result.items[index].total, `Thành tiền dòng ${index + 1}`);
  });
}
export function canonicalQuote(body: Record<string, unknown>) {
  const data = quoteObject(body.quote_data);
  for (const field of ['subtotal', 'vat_amount', 'total_amount']) if (body[field] !== undefined) validateQuoteMoney(body[field], field);
  for (const field of ['subtotal', 'vatAmount', 'total', 'totalAmount']) if (data[field] !== undefined) validateQuoteMoney(data[field], field);
  const result = calculateQuote({ items: body.items, includeVAT: body.include_vat ?? data.includeVAT,
    vatRate: body.vat_rate ?? data.vatRate, payment1: data.payment1, payment2: data.payment2 });
  delete data.__local_create_receipt;
  return { subtotal: result.subtotal, vat_rate: result.vatRate, vat_amount: result.vatAmount, total_amount: result.total,
    include_vat: result.includeVAT, items: result.items, quote_data: { ...data, ...result, totalAmount: result.total } };
}
