import { applyHostedQuoteFilters, normalizeQuoteFilters, type QuoteQueryOptions } from '@/lib/quote-filters';
import { resolveQuoteDates } from '@/lib/quote-dates';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

const PAGE_SIZE = 50;

export const formatQuote = (quote: any) => {
  let customerName = 'Không có tên';
  if (quote.customers?.name) {
    customerName = quote.customers.name;
  } else if (quote.notes) {
    const m = quote.notes.match(/Khách hàng:\s*(.+)/);
    if (m && m[1].trim()) customerName = m[1].trim();
  }
  const extract = (pattern: RegExp) => {
    if (!quote.notes) return '';
    const m = quote.notes.match(pattern);
    return m && m[1] ? m[1].trim() : '';
  };
  let data: Record<string, unknown> = {};
  try { data = typeof quote.quote_data === 'string' ? JSON.parse(quote.quote_data) : quote.quote_data || {}; } catch { /* Legacy snapshot may be unavailable. */ }
  const snapshot = (key: string, pattern: RegExp, fallback: string) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) return String(data[key] ?? '');
    const match = quote.notes?.match(pattern);
    return match ? (match[1] || '').trim() : fallback || '';
  };
  return {
    ...quote,
    title: data.title,
    subtotal: Number(quote.subtotal ?? 0),
    vat_rate: Number(quote.vat_rate ?? 0),
    vat_amount: Number(quote.vat_amount ?? 0),
    customerName: snapshot('customerName', /(?:^|\n)Khách hàng:[ \t]*([^\n\r]*)/, customerName),
    customerEmail: snapshot('customerEmail', /(?:^|\n)Email:[ \t]*([^\n\r]*)/, quote.customers?.email),
    customerPhone: snapshot('customerPhone', /(?:^|\n)Điện thoại:[ \t]*([^\n\r]*)/, quote.customers?.phone),
    customerAddress: snapshot('customerAddress', /(?:^|\n)Địa chỉ:[ \t]*([^\n\r]*)/, quote.customers?.address),
    customerCompany: quote.customers?.company || '',
    ...resolveQuoteDates(quote),
    responsible: quote.assignees?.name || 'Chưa phân công',
    totalAmount: quote.total_amount || 0,
  };
};

export const useInfiniteQuotes = (opts?: QuoteQueryOptions) => {
  const queryClient = useQueryClient();
  const filters = normalizeQuoteFilters(opts);

  useEffect(() => {
    if (isLocalBackend()) return;
    const channel = supabase
      .channel('quotes-realtime-inf')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
        queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useInfiniteQuery({
    queryKey: ['quotes-infinite', opts?.managerId ?? 'all', filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      if (isLocalBackend()) {
        const rows = await localApi.quotes({ ...filters, managerId: opts?.managerId, limit: PAGE_SIZE, offset: from });
        return rows.map(formatQuote);
      }
      let query = supabase
        .from('quotes')
        .select(`
          id, quote_number, customer_id, manager_id, assignee_id, price_list_id,
          items, total_amount, subtotal, vat_amount, include_vat, vat_rate,
          status, notes, created_at, updated_at, tenant_id,
          customers ( name, email, phone, address, company ),
          assignees ( name )
        `)
        .order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
        .range(from, to);

      query = applyHostedQuoteFilters(query, filters, opts?.managerId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(formatQuote);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    retry: false,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
