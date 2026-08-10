import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

const PAGE_SIZE = 50;

export const useInfiniteOrders = (opts?: { managerId?: string | null; search?: string; enabled?: boolean }) => {
  const queryClient = useQueryClient();
  const search = (opts?.search || '').trim();
  const enabled = opts?.enabled !== false;

  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['orders-infinite'] });
    const channel = supabase
      .channel(`orders-inf-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useInfiniteQuery({
    queryKey: ['orders-infinite', opts?.managerId ?? 'all', search],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let ordersQuery = supabase
        .from('orders')
        .select(`
          *,
          customers!left(name, email, phone, company, customer_code, address, addresses),
          assignees(name),
          ghn_tracking(ghn_order_code)
        `)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (opts?.managerId && opts.managerId !== 'all') {
        ordersQuery = ordersQuery.eq('manager_id', opts.managerId);
      }
      if (search) {
        const esc = search.replace(/[%,()]/g, ' ');
        ordersQuery = ordersQuery.or(
          `order_number.ilike.%${esc}%,display_order_number.ilike.%${esc}%,notes.ilike.%${esc}%`
        );
      }

      const { data: ordersData, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;

      const orderIds = (ordersData || []).map(o => o.id);
      const paymentsData: any[] = [];
      if (orderIds.length > 0) {
        const { data: payments, error: pErr } = await supabase
          .from('order_payments')
          .select('order_id, payment_amount, payment_date, payment_type')
          .in('order_id', orderIds);
        if (pErr) throw pErr;
        if (payments) paymentsData.push(...payments);
      }

      const orderPaymentMap = new Map<string, any[]>();
      paymentsData.forEach(p => {
        const arr = orderPaymentMap.get(p.order_id) || [];
        arr.push(p);
        orderPaymentMap.set(p.order_id, arr);
      });

      const fallbackQuoteIds = (ordersData || [])
        .filter(o => o.quote_id && !orderPaymentMap.has(o.id))
        .map(o => o.quote_id as string);

      const quoteDataById = new Map<string, any>();
      if (fallbackQuoteIds.length > 0) {
        const { data: qrows } = await supabase
          .from('quotes')
          .select('id, quote_data')
          .in('id', fallbackQuoteIds);
        (qrows || []).forEach((q: any) => quoteDataById.set(q.id, q.quote_data));
      }

      return (ordersData || []).map(order => {
        const orderPayments = orderPaymentMap.get(order.id) || [];
        let total_paid = orderPayments.reduce((s: number, p: any) => s + (p.payment_amount || 0), 0);
        if (total_paid === 0 && order.quote_id && quoteDataById.has(order.quote_id)) {
          const raw = quoteDataById.get(order.quote_id);
          if (raw) {
            try {
              const qd = typeof raw === 'string' ? JSON.parse(raw) : raw;
              const p1 = qd?.payment1 || 0;
              if (p1 > 0) total_paid = p1;
            } catch {}
          }
        }
        return { ...order, order_payments: orderPayments, total_paid };
      });
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};