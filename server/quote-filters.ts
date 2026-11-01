/** Shared normalized quote membership; owner scope is supplied only by the authorization layer. */
export interface QuoteFilters { search: string; status: string; assigneeId: string; dateFrom: string; dateTo: string }
export interface QuoteQueryOptions extends Partial<QuoteFilters> { managerId?: string | null }
const invalid = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };
export function normalizeQuoteFilters(input: Partial<Record<keyof QuoteFilters, unknown>> = {}): QuoteFilters {
  const text = (key: keyof QuoteFilters) => {
    const value = input[key];
    if (value != null && typeof value !== 'string') return invalid('Bộ lọc báo giá không hợp lệ.');
    return String(value ?? '').trim().normalize('NFC');
  };
  const search = text('search').toLocaleLowerCase('vi'), status = text('status'), assigneeId = text('assigneeId');
  if (status && !['draft', 'sent', 'approved', 'rejected', 'expired'].includes(status)) invalid('Trạng thái lọc không hợp lệ.');
  const date = (key: 'dateFrom' | 'dateTo') => {
    const value = text(key);
    if (!value) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return invalid('Ngày lọc phải có định dạng YYYY-MM-DD hợp lệ.');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid('Ngày lọc không hợp lệ.');
    return value;
  };
  const dateFrom = date('dateFrom'), dateTo = date('dateTo');
  if (dateFrom && dateTo && dateFrom > dateTo) invalid('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return { search, status, assigneeId, dateFrom, dateTo };
}
export function quoteFilterBounds(filters: QuoteFilters) {
  return { from: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00+07:00`).toISOString() : '',
    to: filters.dateTo ? new Date(Date.parse(`${filters.dateTo}T00:00:00+07:00`) + 86400000).toISOString() : '' };
}
export function quoteFilterSql(filters: QuoteFilters, owner: string) {
  const values: unknown[] = [filters.search, owner];
  const where = ["($1='' or strpos(lower(concat_ws(' ',q.quote_number,q.notes,q.quote_data->>'customerName',q.quote_data->>'customerPhone',q.quote_data->>'customerEmail',q.quote_data->>'customerAddress')),$1)>0)", "($2='' or q.manager_id=$2)"];
  const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
  if (filters.status) add('q.status=?', filters.status);
  if (filters.assigneeId === '__unassigned__') where.push('q.assignee_id is null');
  else if (filters.assigneeId) add('q.assignee_id=?', filters.assigneeId);
  const bounds = quoteFilterBounds(filters);
  if (bounds.from) add('q.created_at>=?::timestamptz', bounds.from);
  if (bounds.to) add('q.created_at<?::timestamptz', bounds.to);
  return { where: where.join(' and '), values };
}
