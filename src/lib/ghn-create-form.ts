import type { GhnProductLine } from './ghn-quote-comparison';
import { formatGhnIntegerInput, parseGhnIntegerInput } from './ghn-integer-input';

export type GhnProductDraft = { id: string; name: string; quantity: number; weightInput: string; code: string };
type PrefilledProduct = GhnProductLine & { weightInput?: string };

/** Preserve real order contents, including invalid source values for correction. */
export function prefillGhnProducts(source: unknown, fallback = ''): PrefilledProduct[] {
  let rows = source;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch { rows = null; }
  }
  if (!Array.isArray(rows) || !rows.length) return [{ name: fallback, quantity: 1 }];
  return rows.map(value => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const product = row.product && typeof row.product === 'object' ? row.product as Record<string, unknown> : {};
    const name = row.name ?? row.product_name ?? product.name;
    const weight = row.unit_weight_grams ?? row.weight_grams ?? product.unit_weight_grams ?? product.weight_grams;
    const code = row.sku ?? row.product_code ?? product.sku ?? product.product_code;
    // Generic `weight` has no reliable unit. Never guess grams or fabricate 1 kg.
    return { name: typeof name === 'string' ? name : '', quantity: row.quantity === undefined ? 1 : Number(row.quantity), ...(weight !== undefined && weight !== null ? { weightInput: formatGhnIntegerInput(String(weight)) } : {}), ...(code !== undefined && code !== null ? { code: String(code) } : {}) };
  });
}

export function createGhnProductDrafts(source: unknown, fallback = '', newId: () => string = () => crypto.randomUUID()): GhnProductDraft[] {
  return prefillGhnProducts(source, fallback).map(row => ({ id: newId(), name: row.name, quantity: row.quantity, weightInput: row.weightInput ?? '', code: row.code ?? '' }));
}

export const ghnProductDraftSignature = (items: readonly GhnProductDraft[]) => items.map(({ name, quantity, weightInput, code }) => ({ name, quantity, weightInput, code }));

/** Every product weight is per unit; its quantity is never a physical parcel count. */
export function calculateGhnProductWeight(items: readonly Pick<GhnProductDraft, 'quantity' | 'weightInput'>[]): { total: number | null; invalidIndex: number; error: string } {
  if (!items.length || items.length > 100) return { total: null, invalidIndex: 0, error: 'Mỗi đơn có từ 1 đến 100 sản phẩm.' };
  let total = 0;
  for (let index = 0; index < items.length; index++) {
    const row = items[index], grams = parseGhnIntegerInput(row.weightInput, 1, 50000);
    if (grams === null || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 1000) return { total: null, invalidIndex: index, error: `SP ${index + 1}: nhập KL mỗi sản phẩm (gram) và số lượng hợp lệ để cộng khối lượng.` };
    total += grams * row.quantity;
    if (!Number.isSafeInteger(total) || total > 5000000) return { total: null, invalidIndex: index, error: 'Tổng khối lượng sản phẩm vượt phạm vi 100 kiện, mỗi kiện 50.000 gram. Khai các kiện đã cân để tiếp tục.' };
  }
  return { total, invalidIndex: -1, error: '' };
}

export function ghnProductWeightError(items: readonly Pick<GhnProductDraft, 'weightInput'>[]): string {
  const index = items.findIndex(row => row.weightInput !== '' && parseGhnIntegerInput(row.weightInput, 1, 50000) === null);
  return index < 0 ? '' : `SP ${index + 1}: khối lượng phải là số nguyên từ 1 đến 50.000 gram; để trống nếu chưa biết.`;
}

export function buildGhnProductLines(items: readonly GhnProductDraft[]): GhnProductLine[] {
  return items.map(row => ({ name: row.name.trim(), quantity: row.quantity, ...(row.weightInput !== '' ? { weight: parseGhnIntegerInput(row.weightInput, 1, 50000) ?? NaN } : {}), ...(row.code.trim() ? { code: row.code.trim() } : {}) }));
}

/** Derived in render: no effect can briefly quote the previous product weight. */
export function effectiveGhnParcels<T extends { weight: number; weightInput: string }>(parcels: T[], total: number | null, followsProducts: boolean): T[] {
  if (!followsProducts || parcels.length !== 1) return parcels;
  return [{ ...parcels[0], weight: total ?? 0, weightInput: total === null ? '' : formatGhnIntegerInput(String(total)) }];
}

/** Gram entry must be an exact positive integer; separators/fractions are not guessed. */
export function parseGhnGrams(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const grams = Number(value.trim());
  return Number.isSafeInteger(grams) && grams >= 1 && grams <= 50000 ? grams : null;
}
