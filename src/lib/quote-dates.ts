/** Saved quote dates are calendar dates in Vietnam, independent of the reader's clock/timezone. */
const calendarKey = (year: number, month: number, day: number): string | null => {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export function parseQuoteDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? parseQuoteDate(value.toISOString()) : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (dmy) return calendarKey(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (ymd) return calendarKey(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/i.exec(text);
  if (!iso || !calendarKey(Number(iso[1]), Number(iso[2]), Number(iso[3])) || Number(iso[4]) > 23 || Number(iso[5]) > 59 || Number(iso[6] || 0) > 59 || Number(iso[9] || 0) > 23 || Number(iso[10] || 0) > 59) return null;
  const stamp = Date.parse(text);
  if (!Number.isFinite(stamp)) return null;
  const vietnam = new Date(stamp + 7 * 60 * 60 * 1000);
  return calendarKey(vietnam.getUTCFullYear(), vietnam.getUTCMonth() + 1, vietnam.getUTCDate());
}

export function resolveQuoteDates(quote: Record<string, unknown>, snapshot?: Record<string, unknown>) {
  let data = snapshot;
  if (!data) {
    try { data = typeof quote.quote_data === 'string' ? JSON.parse(quote.quote_data) : quote.quote_data as Record<string, unknown>; } catch { /* Legacy malformed metadata has no usable date. */ }
  }
  const created = quote.created_at;
  // created_at is the locally editable quote date; a stale quote_data date must not override it.
  const quoteDate = parseQuoteDate(created == null || created === '' ? data?.quoteDate : created);
  const expiry = String(quote.notes ?? '').match(/(?:^|\r?\n)Ngày hết hạn:[ \t]*([^\r\n]*)/);
  return { quoteDate, expiryDate: parseQuoteDate(expiry?.[1]) };
}

export function formatQuoteDate(value: unknown): string {
  const date = parseQuoteDate(value);
  return date ? date.split('-').reverse().join('/') : 'Chưa xác định';
}

/** Date objects used by the calendar widget represent the selected local calendar day. */
export function quoteCalendarDate(value: unknown): Date | undefined {
  const key = parseQuoteDate(value);
  if (!key) return undefined;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(2000, month - 1, day, 12);
  date.setFullYear(year);
  return date;
}

/** Persist a chosen calendar day at Vietnam noon, avoiding host timezone shifts. */
export function quoteCalendarDateIso(date: Date): string {
  const key = calendarKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
  if (!key) throw new Error('Ngày báo giá không hợp lệ.');
  return new Date(`${key}T12:00:00+07:00`).toISOString();
}

export function quoteDateHeading(value: unknown): string {
  const key = parseQuoteDate(value);
  if (!key) return 'Ngày báo giá: Chưa xác định';
  const [year, month, day] = key.split('-').map(Number);
  return `Hà Nội ngày ${day} tháng ${month} năm ${year}`;
}

/** Replace the template's generic validity clause only; preserve all other configured terms. */
export function quoteDocumentTerms(expiryDate: unknown, terms: readonly unknown[]): string[] {
  const expiry = parseQuoteDate(expiryDate);
  return [expiry ? `Báo giá có hiệu lực đến ngày ${formatQuoteDate(expiry)}.` : 'Hiệu lực báo giá: Chưa xác định.',
    ...terms.filter((term): term is string => typeof term === 'string' && Boolean(term.trim()) && !/^\s*(?:\d+[.)]\s*)?Báo giá(?: này)? có hiệu lực(?:\s|[.:])/iu.test(term))];
}
