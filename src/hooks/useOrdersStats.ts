import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lightweight stats over ALL orders (not just paginated rows).
 * Selects only the columns needed for dashboard counters.
 */
export const useOrdersStats = (managerId?: string | null, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['orders-stats', managerId ?? 'all'],
    enabled,
    queryFn: async () => {
      const { data: aggregate, error: aggregateError } = await supabase.rpc('get_order_stats', {
        p_manager_id: managerId && managerId !== 'all' ? managerId : null,
      });
      const aggregateStats = aggregate as Record<string, unknown> | null;
      if (!aggregateError && aggregateStats && !Array.isArray(aggregateStats)) {
        return {
          total: Number(aggregateStats.total ?? 0),
          pendingCount: Number(aggregateStats.pending_count ?? 0),
          processingCount: Number(aggregateStats.processing_count ?? 0),
          completedCount: Number(aggregateStats.completed_count ?? 0),
          overdueCount: Number(aggregateStats.overdue_count ?? 0),
          totalReceivable: Number(aggregateStats.total_receivable ?? 0),
          totalValue: Number(aggregateStats.total_value ?? 0),
        };
      }

      const rows: Array<{ id: string; status: string; total_amount: number | null; created_at: string; delivery_date: string | null }> = [];
      const PAGE_SIZE = 1000;

      for (let from = 0; ; from += PAGE_SIZE) {
        let query = supabase
          .from('orders')
          .select('id, status, total_amount, created_at, delivery_date')
          .range(from, from + PAGE_SIZE - 1);
        if (managerId && managerId !== 'all') query = query.eq('manager_id', managerId);

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }

      // Receivable requires payments — fetch in one go for these orders only
      const ids = rows.map(r => r.id);
      const paidByOrder = new Map<string, number>();
      if (ids.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data: pays } = await supabase
            .from('order_payments')
            .select('order_id, payment_amount')
            .in('order_id', ids.slice(i, i + CHUNK));
          (pays || []).forEach(p => {
            paidByOrder.set(
              p.order_id as string,
              (paidByOrder.get(p.order_id as string) || 0) + Number(p.payment_amount || 0)
            );
          });
        }
      }

      const now = Date.now();
      const pendingCount = rows.filter(o => o.status === 'pending').length;
      const processingCount = rows.filter(o => o.status === 'processing').length;
      const completedCount = rows.filter(o => ['delivered', 'self_delivered'].includes(o.status)).length;
      const overdueCount = rows.filter(o => {
        if (['delivered', 'self_delivered', 'shipped', 'cancelled', 'returned'].includes(o.status as string)) return false;
        const dd = o.delivery_date
          ? new Date(o.delivery_date as string).getTime()
          : new Date(o.created_at as string).getTime() + 6 * 86400000;
        return dd < now;
      }).length;
      const totalReceivable = rows
        .filter(o => !['cancelled', 'returned'].includes(o.status))
        .reduce((s, o) => {
        const paid = paidByOrder.get(o.id) || 0;
        return s + Math.max(0, (Number(o.total_amount) || 0) - paid);
      }, 0);
      const totalValue = rows
        .filter(o => ['delivered', 'self_delivered'].includes(o.status))
        .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

      return {
        total: rows.length,
        pendingCount,
        processingCount,
        completedCount,
        overdueCount,
        totalReceivable,
        totalValue,
      };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
