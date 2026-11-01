import type { PoolClient } from 'pg';
import { codeKey, semanticText } from './product-labor-resolver.js';

export type ProductRateConsumptionRow = {
  id: string;
  product_id: string | null;
  piece_rate_code: string | null;
  piece_rate_name: string | null;
  rate_exact: string | null;
  rate_unit: string | null;
  effective_from: string;
  effective_to: string | null;
  product_sku?: string | null;
  product_name?: string | null;
  product_category?: string | null;
  product_active?: boolean | null;
  price_list_name?: string | null;
  price_list_year?: number | null;
  price_list_active?: boolean | null;
};

type Queryable = Pick<PoolClient, 'query'>;
export type ProductRateIdentity = { date: string; rateId?: string; productId?: string; pieceRateCode?: string };

const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 409 }); };
// PostgreSQL serializes UUID columns in lowercase, while the previous UUID
// predicates accepted either hex case. This comparison key is internal only:
// request payloads and their replay fingerprints retain their exact spelling.
const uuidIdentityKey = (value: unknown) => {
  const text = String(value ?? '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text.toLowerCase()
    : text;
};
const exactPositiveRate = (value: unknown) => {
  const raw = String(value ?? '');
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(raw)) return false;
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) > 0n;
};

export async function lockProductRateConfigShared(client: Queryable) {
  await client.query("select pg_advisory_xact_lock_shared(hashtextextended('payroll-product-rate-config',0))");
}

/** Load every effective approved source before any identity, product or search filter. */
export async function loadEffectiveApprovedProductRates(client: Queryable, date: string): Promise<ProductRateConsumptionRow[]> {
  return (await client.query(`select r.id::text,r.product_id::text,r.piece_rate_code,r.piece_rate_name,
      r.rate::text rate_exact,r.rate_unit,r.effective_from::text,r.effective_to::text,
      p.sku product_sku,p.name product_name,p.category product_category,p.is_active product_active,
      l.name price_list_name,l.year price_list_year,l.is_active price_list_active
    from local_product_rates r
    left join local_products p on p.id=r.product_id
    left join local_price_lists l on l.id=p.price_list_id
    where r.status='APPROVED' and r.effective_from<=$1::date
      and (r.effective_to is null or r.effective_to>=$1::date)
    order by r.id`, [date])).rows as ProductRateConsumptionRow[];
}

export const canonicalRateCandidates = (rows: ProductRateConsumptionRow[], code: unknown) =>
  rows.filter(row => codeKey(row.piece_rate_code) === codeKey(code));

export function assertRuntimePieceRate(candidates: ProductRateConsumptionRow[]): ProductRateConsumptionRow {
  if (!candidates.length) fail('Mã công may chưa có đơn giá đã duyệt trong ngày làm.');
  if (candidates.length !== 1) fail('Mã công may có nhiều đơn giá đã duyệt cùng hiệu lực; cần quản lý xử lý trước khi chấm công.');
  const row = candidates[0];
  if (!codeKey(row.piece_rate_code) || !semanticText(row.piece_rate_name))
    fail('Nguồn đơn giá thiếu mã hoặc tên công may hợp lệ.');
  if (row.rate_unit !== 'PIECE')
    fail('Đơn giá công may phải có đơn vị PIECE để chấm sản lượng.');
  if (!exactPositiveRate(row.rate_exact))
    fail('Đơn giá công may phải là số dương hợp lệ để chấm sản lượng.');
  return row;
}

const productCodes = (rows: ProductRateConsumptionRow[], productId: string) => {
  const productKey = uuidIdentityKey(productId);
  const matching = rows.filter(row =>
    uuidIdentityKey(row.product_id) === productKey || uuidIdentityKey(row.id) === productKey,
  );
  return new Set(matching.map(row => codeKey(row.piece_rate_code)).filter(Boolean));
};

/**
 * Resolve all submitted aliases against the full effective set. A historical
 * picker may still submit a rate id in product_id, but it can never hide a
 * duplicate canonical code or substitute an unrelated product.
 */
export function resolveRuntimePieceRate(rows: ProductRateConsumptionRow[], identity: ProductRateIdentity): ProductRateConsumptionRow {
  const rateId = String(identity.rateId || '').trim();
  const productId = String(identity.productId || '').trim();
  const suppliedCode = String(identity.pieceRateCode || '').trim();
  if (!rateId && !productId && !suppliedCode) fail('Mã công may hoặc sản phẩm là bắt buộc.');
  let anchored: ProductRateConsumptionRow | undefined;
  if (rateId) {
    anchored = rows.find(row => uuidIdentityKey(row.id) === uuidIdentityKey(rateId));
    if (!anchored) fail('Đơn giá đã chọn không còn hiệu lực trong ngày làm.');
  }
  if (suppliedCode) {
    const codeCandidates = canonicalRateCandidates(rows, suppliedCode);
    if (anchored && codeKey(anchored.piece_rate_code) !== codeKey(suppliedCode))
      fail('Mã công may không khớp đơn giá đã chọn.');
    if (!codeCandidates.length) fail('Mã công may chưa có đơn giá đã duyệt trong ngày làm.');
    if (!anchored) anchored = codeCandidates[0];
  }
  if (!anchored && productId) {
    const codes = productCodes(rows, productId);
    if (!codes.size) fail('Sản phẩm chưa có đơn giá đã duyệt trong ngày làm.');
    if (codes.size !== 1) fail('Sản phẩm có nhiều mã công may hiệu lực; hãy chọn đúng mã công may.');
    anchored = canonicalRateCandidates(rows, [...codes][0])[0];
  }
  const selectedCode = codeKey(anchored?.piece_rate_code || suppliedCode);
  if (!selectedCode) fail('Mã công may Excel là bắt buộc.');
  const selected = assertRuntimePieceRate(canonicalRateCandidates(rows, selectedCode));
  if (rateId && uuidIdentityKey(selected.id) !== uuidIdentityKey(rateId))
    fail('Đơn giá đã chọn không khớp mã công may duy nhất hiệu lực.');
  if (productId && uuidIdentityKey(selected.product_id) !== uuidIdentityKey(productId) && uuidIdentityKey(selected.id) !== uuidIdentityKey(productId))
    fail('Sản phẩm không khớp mã công may đã chọn.');
  return selected;
}

export async function selectRuntimePieceRate(client: Queryable, identity: ProductRateIdentity) {
  return resolveRuntimePieceRate(await loadEffectiveApprovedProductRates(client, identity.date), identity);
}

/** Picker filtering is intentionally after complete-code classification. */
export function listRuntimePieceRates(rows: ProductRateConsumptionRow[]) {
  const groups = new Map<string, ProductRateConsumptionRow[]>();
  for (const row of rows) {
    const key = codeKey(row.piece_rate_code);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const valid: ProductRateConsumptionRow[] = [];
  for (const candidates of groups.values()) {
    try { valid.push(assertRuntimePieceRate(candidates)); } catch { /* unavailable sources stay non-selectable */ }
  }
  return valid;
}
