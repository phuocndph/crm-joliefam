import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lightweight stats over ALL orders (not just paginated rows).
 * Selects only the columns needed for dashboard counters.
 */
export const useOrdersStats = (managerId?: string | null) => {
  return useQuery({
    queryKey: ['orders-stats', managerId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select('id, status, total_amount, created_at, delivery_date, display_order_number');
      if (managerId && managerId !== 'all') q = q.eq('manager_id', managerId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];

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
      const completedCount = rows.filter(o => o.status === 'delivered').length;
      const overdueCount = rows.filter(o => {
        if (['delivered', 'shipped', 'cancelled'].includes(o.status as string)) return false;
        const dd = o.delivery_date
          ? new Date(o.delivery_date as string).getTime()
          : new Date(o.created_at as string).getTime() + 6 * 86400000;
        return dd < now;
      }).length;
      const totalReceivable = rows.reduce((s, o) => {
        const paid = paidByOrder.get(o.id) || 0;
        return s + Math.max(0, (Number(o.total_amount) || 0) - paid);
      }, 0);
      const totalValue = rows
        .filter(o => o.status === 'delivered')
        .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

      // Detect duplicate display_order_number
      const dupCounts = new Map<string, number>();
      rows.forEach(o => {
        const num = (o.display_order_number as string) || '';
        if (!num || !/^\d+$/.test(num)) return;
        dupCounts.set(num, (dupCounts.get(num) || 0) + 1);
      });
      const duplicateOrderNumbers = Array.from(dupCounts.entries()).filter(([, c]) => c > 1);

      return {
        total: rows.length,
        pendingCount,
        processingCount,
        completedCount,
        overdueCount,
        totalReceivable,
        totalValue,
        duplicateOrderNumbers,
      };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};