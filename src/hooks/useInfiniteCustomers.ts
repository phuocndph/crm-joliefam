import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

const PAGE_SIZE = 50;

export const useInfiniteCustomers = (opts?: { search?: string }) => {
  const queryClient = useQueryClient();
  const search = (opts?.search || '').trim();

  useEffect(() => {
    const channel = supabase
      .channel('customers-inf-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['customers-infinite'] });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'customers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['customers-infinite'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useInfiniteQuery({
    queryKey: ['customers-infinite', search],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from('customers')
        .select('id, customer_code, name, email, phone, address, company, notes, tags, auto_tags, purchase_count, last_purchase_date, total_spent, current_status, last_care_date, assignee_id, manager_id, tenant_id, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (search) {
        const esc = search.replace(/[%,()]/g, ' ');
        query = query.or(
          `name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%,customer_code.ilike.%${esc}%,company.ilike.%${esc}%`
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
