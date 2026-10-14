import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

const PAGE_SIZE = 50;

const formatQuote = (quote: any) => {
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
  return {
    ...quote,
    customerName,
    customerEmail: quote.customers?.email || extract(/Email:\s*([^\n\r]+)/),
    customerPhone: quote.customers?.phone || extract(/Điện thoại:\s*([^\n\r]+)/),
    customerAddress: quote.customers?.address || extract(/Địa chỉ:\s*([^\n\r]+)/),
    customerCompany: quote.customers?.company || '',
    quoteDate: quote.created_at,
    expiryDate: (() => {
      const raw = extract(/Ngày hết hạn:\s*([^\n\r]+)/);
      if (!raw) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) {
        const d = new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]), 12, 0, 0);
        return !isNaN(d.getTime()) ? d.toISOString() : raw;
      }
      const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) {
        const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]), 12, 0, 0);
        return !isNaN(d.getTime()) ? d.toISOString() : raw;
      }
      return raw;
    })(),
    responsible: quote.assignees?.name || 'Chưa phân công',
    totalAmount: quote.total_amount || 0,
  };
};

export const useInfiniteQuotes = (opts?: { managerId?: string | null; search?: string }) => {
  const queryClient = useQueryClient();
  const search = (opts?.search || '').trim();

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
    queryKey: ['quotes-infinite', opts?.managerId ?? 'all', search],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      if (isLocalBackend()) {
        const rows = await localApi.quotes({ search, managerId: opts?.managerId, limit: PAGE_SIZE, offset: from });
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
        .order('created_at', { ascending: false })
        .range(from, to);

      if (opts?.managerId && opts.managerId !== 'all') {
        query = query.eq('manager_id', opts.managerId);
      }
      if (search) {
        const esc = search.replace(/[%,()]/g, ' ');
        query = query.or(`quote_number.ilike.%${esc}%,notes.ilike.%${esc}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(formatQuote);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
