import { calculateQuote } from './quote-calculation';

/** Vietnamese input uses dots for grouping and a comma for decimal places. */
export function parseQuotePriceInput(value: string): number {
  const normalized = value.replace(/[\s₫đ]/gi, '').replace(/\./g, '').replace(',', '.');
  return normalized === '' ? 0 : Number(normalized);
}

export function quoteFormPreview(
  rows: { item: unknown; index: number; id: string }[],
  settings: Omit<Parameters<typeof calculateQuote>[0], 'items'>,
) {
  const lineErrors: Record<string, string> = {};
  for (const row of rows) {
    try {
      calculateQuote({ items: [row.item] });
    } catch (error) {
      lineErrors[row.id] = (error instanceof Error ? error.message : 'Dòng sản phẩm không hợp lệ.')
        .replace(/dòng 1/gi, match => `${match.startsWith('D') ? 'Dòng' : 'dòng'} ${row.index + 1}`);
    }
  }
  const validLineCount = rows.length - Object.keys(lineErrors).length;
  if (!rows.length) return { lineErrors, validLineCount, calculationError: '', calculation: { subtotal: 0, vatAmount: 0, total: 0, remaining: 0 } };
  if (Object.keys(lineErrors).length) return { lineErrors, validLineCount, calculationError: 'Kiểm tra các dòng sản phẩm được đánh dấu trước khi lưu.', calculation: null };
  try {
    return { lineErrors, validLineCount, calculationError: '', calculation: calculateQuote({ ...settings, items: rows.map(row => row.item) }) };
  } catch (error) {
    return { lineErrors, validLineCount, calculationError: error instanceof Error ? error.message : 'Chưa thể tính tổng báo giá.', calculation: null };
  }
}
