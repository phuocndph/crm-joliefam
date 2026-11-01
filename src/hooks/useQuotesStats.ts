import { applyHostedQuoteFilters, normalizeQuoteFilters, type QuoteQueryOptions } from '@/lib/quote-filters';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

/**
 * Lightweight stats query — fetches only `status` and `total_amount`.
 * Used for stat cards alongside paginated list query.
 */
export const useQuotesStats = (opts?: QuoteQueryOptions) => {
  const filters = normalizeQuoteFilters(opts);
  return useQuery({
    queryKey: ['quotes-stats', opts?.managerId ?? 'all', filters],
    queryFn: async () => {
      if (isLocalBackend()) {
        const result = await localApi.quoteStats({ ...filters, managerId: opts?.managerId });
        return {
          total: Number(result.total ?? 0),
          sent: Number(result.sent_count ?? 0),
          approved: Number(result.approved_count ?? 0),
          totalValue: Number(result.approved_value ?? 0),
        };
      }
      const rows: Array<{ status: string; total_amount: number | null }> = [];
      const PAGE_SIZE = 1000;

      for (let from = 0; ; from += PAGE_SIZE) {
        let query = supabase
          .from('quotes')
          .select('id, status, total_amount').order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        query = applyHostedQuoteFilters(query, filters, opts?.managerId);

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      return {
        total: rows.length,
        sent: rows.filter(r => r.status === 'sent').length,
        approved: rows.filter(r => r.status === 'approved').length,
        totalValue: rows.filter(r => r.status === 'approved').reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
      };
    },
    retry: false,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
