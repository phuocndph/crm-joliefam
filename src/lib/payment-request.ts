import { businessDecimal } from '../../server/quote-calculation';
import { contractBusinessDate } from './contract-calculation';

export interface PaymentRequestSource {
  known: boolean;
  paid: number | null;
  remaining: number | null;
  reason: string;
  contract: Record<string, unknown>;
}

export const paymentRequestLabels = {
  total: 'Tổng giá trị hợp đồng',
  advance: 'Tạm ứng theo hợp đồng',
  remaining: 'Số tiền đề nghị thanh toán sau khi nhận hàng',
};

/** Project agreed contract terms only. An agreed advance is not evidence of cash received. */
export function paymentRequestFinancialView(contract: Record<string, unknown> | null | undefined, source?: Record<string, unknown> | null) {
  const result = { total: null as number | null, advance: null as number | null, remaining: null as number | null,
    ready: false, noRemaining: false, fingerprint: '', reason: 'Chưa tải được điều khoản thanh toán của hợp đồng. Vui lòng làm mới dữ liệu.' };
  try {
    const snapshot = source || contract;
    const total = businessDecimal(snapshot?.total_amount, 'Tổng giá trị hợp đồng');
    result.total = total.value;
    if (!source) return result;
    if (!source.id || source.id !== contract?.id) return { ...result, reason: 'Nguồn hợp đồng chưa xác định. Vui lòng đóng và mở lại biểu mẫu.' };
    if (!source.contract_number || source.contract_number !== contract?.contract_number) return { ...result, reason: 'Số hợp đồng đã thay đổi. Vui lòng đóng và mở lại biểu mẫu.' };
    const advance = businessDecimal(source.deposit_amount, 'Tạm ứng theo hợp đồng');
    // businessDecimal denominators are powers of ten. Subtract at the common decimal scale.
    const denominator = total.denominator > advance.denominator ? total.denominator : advance.denominator;
    const difference = total.numerator * (denominator / total.denominator) - advance.numerator * (denominator / advance.denominator);
    if (difference < 0n) {
      return { ...result, advance: advance.value, reason: 'Tạm ứng theo hợp đồng không được vượt tổng giá trị hợp đồng. Vui lòng kiểm tra điều khoản thanh toán.' };
    }
    const places = denominator.toString().length - 1;
    const remainder = difference % denominator;
    const decimal = `${difference / denominator}${places ? '.' + remainder.toString().padStart(places, '0') : ''}`;
    return { total: total.value, advance: advance.value, remaining: Number(decimal),
      ready: difference > 0n, noRemaining: difference === 0n,
      fingerprint: [source.id, source.contract_number, `${total.numerator}/${total.denominator}`, `${advance.numerator}/${advance.denominator}`].join('|'),
      reason: difference === 0n ? 'Không có khoản thanh toán còn lại theo thỏa thuận.' : '' };
  } catch {
    return { ...result, reason: 'Tổng giá trị hoặc tạm ứng theo hợp đồng chưa hợp lệ. Vui lòng kiểm tra điều khoản thanh toán; nếu không tạm ứng, nhập rõ 0.' };
  }
}

export function paymentRequestToday(now = new Date()): string { return contractBusinessDate(now.toISOString()); }

export function paymentRequestCurrency(value: number | null): string {
  return value == null ? 'Chưa xác định' : value.toLocaleString('vi-VN', { maximumFractionDigits: 6 }) + ' ₫';
}

/** Only prose is editable; migrate exact previous canned text without rewriting custom content. */
export function paymentRequestProse<T extends Record<string, string>>(defaults: T, saved: unknown, previousDefaults: Partial<Record<keyof T, readonly string[]>> = {}): T {
  const result = { ...defaults };
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
  const fields = saved as Record<string, unknown>;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = fields[String(key)];
    if (typeof value === 'string' && !previousDefaults[key]?.includes(value)) result[key] = value as T[keyof T];
  }
  return result;
}

export function paymentRequestDateValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

/** Snapshots can already include their field label. Normalize presentation, never the legal source. */
export function paymentRequestField(value: string, field: 'address' | 'phone' | 'tax'): string {
  const prefix = field === 'address' ? /^(?:Địa chỉ|Address)\s*:\s*/iu : field === 'phone' ? /^(?:Điện thoại|ĐT|Phone|Tel)\s*:\s*/iu : /^(?:Mã số thuế|MST|Tax code)\s*:\s*/iu;
  let text = value.trim();
  while (prefix.test(text)) text = text.replace(prefix, '').trim();
  return text;
}
