import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import type { Transaction } from './useTransactions';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

const PAGE_SIZE = 50;

export const useInfiniteTransactions = (opts?: { managerId?: string | null; search?: string }) => {
  const queryClient = useQueryClient();
  const search = (opts?.search || '').trim();

  useEffect(() => {
    if (isLocalBackend()) return;
    const channel = supabase
      .channel('transactions-inf-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['transactions-infinite'] });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['transactions-infinite'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useInfiniteQuery({
    queryKey: ['transactions-infinite', opts?.managerId ?? 'all', search],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      if (isLocalBackend()) {
        const rows = await localApi.transactions({ managerId: opts?.managerId, search });
        return rows.slice(from, from + PAGE_SIZE) as unknown as Transaction[];
      }
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from('transactions')
        .select('id, amount, date, type, description, category, payment_type, order_id, installment_number, total_installments, remaining_amount, created_at, updated_at, manager_id, tenant_id')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (opts?.managerId) query = query.eq('manager_id', opts.managerId);
      if (search) {
        const esc = search.replace(/[%,()]/g, ' ');
        query = query.or(`description.ilike.%${esc}%,category.ilike.%${esc}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Transaction[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
