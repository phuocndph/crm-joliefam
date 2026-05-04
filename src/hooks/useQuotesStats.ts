import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lightweight stats query — fetches only `status` and `total_amount`.
 * Used for stat cards alongside paginated list query.
 */
export const useQuotesStats = (managerId?: string | null) => {
  return useQuery({
    queryKey: ['quotes-stats', managerId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('quotes').select('status, total_amount');
      if (managerId && managerId !== 'all') q = q.eq('manager_id', managerId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      return {
        total: rows.length,
        sent: rows.filter(r => r.status === 'sent').length,
        approved: rows.filter(r => r.status === 'approved').length,
        totalValue: rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
      };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};