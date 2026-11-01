import { quoteFilterBounds, type QuoteFilters } from '../../server/quote-filters';
export * from '../../server/quote-filters';

interface QuoteFilterBuilder {
  eq(column: string, value: string): this;
  is(column: string, value: null): this;
  gte(column: string, value: string): this;
  lt(column: string, value: string): this;
  or(filters: string): this;
}
/** Both hosted list and stats use this membership before pagination. RLS remains authoritative. */
export function applyHostedQuoteFilters<T extends QuoteFilterBuilder>(query: T, filters: QuoteFilters, managerId?: string | null): T {
  if (managerId && managerId !== 'all') query = query.eq('manager_id', managerId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.assigneeId === '__unassigned__') query = query.is('assignee_id', null);
  else if (filters.assigneeId) query = query.eq('assignee_id', filters.assigneeId);
  const bounds = quoteFilterBounds(filters);
  if (bounds.from) query = query.gte('created_at', bounds.from);
  if (bounds.to) query = query.lt('created_at', bounds.to);
  if (filters.search) {
    const pattern = JSON.stringify(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    query = query.or(['quote_number', 'notes', 'quote_data->>customerName', 'quote_data->>customerPhone', 'quote_data->>customerEmail', 'quote_data->>customerAddress'].map(field => `${field}.ilike.${pattern}`).join(','));
  }
  return query;
}

export function quoteReadError(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error && error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.';
  return error instanceof Error ? error.message : 'Không thể tải dữ liệu. Vui lòng thử lại.';
}
