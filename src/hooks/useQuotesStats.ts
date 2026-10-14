import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

/**
 * Lightweight stats query — fetches only `status` and `total_amount`.
 * Used for stat cards alongside paginated list query.
 */
export const useQuotesStats = (managerId?: string | null) => {
  return useQuery({
    queryKey: ['quotes-stats', managerId ?? 'all'],
    queryFn: async () => {
      if (isLocalBackend()) {
        const result = await localApi.quoteStats(managerId);
        return {
          total: Number(result.total ?? 0),
          sent: Number(result.sent_count ?? 0),
          approved: Number(result.approved_count ?? 0),
          totalValue: Number(result.approved_value ?? 0),
        };
      }
      const { data: aggregate, error: aggregateError } = await supabase.rpc('get_quote_stats', {
        p_manager_id: managerId && managerId !== 'all' ? managerId : null,
      });
      if (!aggregateError && aggregate && !Array.isArray(aggregate)) {
        const result = aggregate as Record<string, unknown>;
        return {
          total: Number(result.total ?? 0),
          sent: Number(result.sent ?? 0),
          approved: Number(result.approved ?? 0),
          totalValue: Number(result.total_value ?? 0),
        };
      }

      const rows: Array<{ status: string; total_amount: number | null }> = [];
      const PAGE_SIZE = 1000;

      for (let from = 0; ; from += PAGE_SIZE) {
        let query = supabase
          .from('quotes')
          .select('status, total_amount')
          .range(from, from + PAGE_SIZE - 1);
        if (managerId && managerId !== 'all') query = query.eq('manager_id', managerId);

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
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
