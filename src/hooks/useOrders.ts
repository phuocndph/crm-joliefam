import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';
export const useOrders = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLocalBackend()) return;
    // Use unique channel name to prevent conflicts across multiple tabs
    const channelName = `orders-payments-quotes-${Date.now()}`;
    // Invalidate silently for all row changes; the follow-up query fetches only selected columns.
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['orders'] });
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, invalidate)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, invalidate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_payments' }, invalidate)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'order_payments' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_payments' }, invalidate)
      .subscribe((status) => {
        console.log(`📦 ${channelName} subscription status:`, status);
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Orders realtime subscription failed, will retry on next mount');
        }
      });

    return () => {
      console.log(`📦 Cleaning up ${channelName} subscription`);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['orders', opts?.managerId ?? 'all'],
    queryFn: async () => {
      console.log('🔍 Fetching orders with manager filter:', opts?.managerId);
      if (isLocalBackend()) return localApi.orders({ managerId: opts?.managerId, limit: 200 });
      
      // First, get all orders
      // Egress optimization: removed heavy `quotes(quote_data)` join from list query.
      // quote_data is only needed as a fallback for orders without order_payments,
      // which is fetched lazily below for those rare cases.
      let ordersQuery = supabase
        .from('orders')
        .select(`
          *,
          customers!left(name, email, phone, company, customer_code, address, addresses),
          assignees(name),
          ghn_tracking(ghn_order_code)
        `)
        .order('created_at', { ascending: false });
      
      if (opts?.managerId && opts.managerId !== 'all') {
        ordersQuery = ordersQuery.eq('manager_id', opts.managerId);
      }
      
      const { data: ordersData, error: ordersError } = await ordersQuery;
      
      if (ordersError) {
        console.error('❌ Error fetching orders:', ordersError);
        throw ordersError;
      }
      
      console.log(`📊 Fetched ${ordersData?.length || 0} orders:`, ordersData?.map(o => o.order_number));
      
      // Then get payments for all orders
      const orderIds = ordersData?.map(order => order.id) || [];
      let paymentsData: any[] = [];
      
      if (orderIds.length > 0) {
        // Chunk to avoid PostgREST URL length limits when there are many orders
        const CHUNK_SIZE = 200;
        for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
          const chunk = orderIds.slice(i, i + CHUNK_SIZE);
          const { data: payments, error: paymentsError } = await supabase
            .from('order_payments')
            .select('order_id, payment_amount, payment_date, payment_type')
            .in('order_id', chunk);
          
          if (paymentsError) {
            console.error('❌ Error fetching payments chunk:', paymentsError);
            throw paymentsError;
          }
          if (payments) paymentsData.push(...payments);
        }
        console.log(`💰 Fetched ${paymentsData.length} payments for ${orderIds.length} orders (in ${Math.ceil(orderIds.length / CHUNK_SIZE)} chunk(s))`);
      }
      
      // Lazy-fetch quote_data ONLY for orders missing order_payments but linked to a quote
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
        const CHUNK_SIZE = 200;
        for (let i = 0; i < fallbackQuoteIds.length; i += CHUNK_SIZE) {
          const chunk = fallbackQuoteIds.slice(i, i + CHUNK_SIZE);
          const { data: qrows } = await supabase
            .from('quotes')
            .select('id, quote_data')
            .in('id', chunk);
          (qrows || []).forEach((q: any) => quoteDataById.set(q.id, q.quote_data));
        }
      }

      // Calculate total_paid for each order
      const ordersWithPayments = ordersData?.map(order => {
        const orderPayments = orderPaymentMap.get(order.id) || [];
        let total_paid = orderPayments.reduce((sum: number, payment: any) =>
          sum + (payment.payment_amount || 0), 0);

        // Fallback to quote.payment1 if no order_payments
        if (total_paid === 0 && order.quote_id && quoteDataById.has(order.quote_id)) {
          const raw = quoteDataById.get(order.quote_id);
          if (raw) {
            try {
              const quoteData = typeof raw === 'string' ? JSON.parse(raw) : raw;
              const payment1 = quoteData?.payment1 || 0;
              if (payment1 > 0) total_paid = payment1;
            } catch (e) {
              console.error('Error parsing quote_data:', e);
            }
          }
        }

        return {
          ...order,
          order_payments: orderPayments,
          total_paid
        };
      }) || [];
      
      return ordersWithPayments;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useUpdateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      if (isLocalBackend()) return localApi.updateOrder(id, data);
      const { data: updatedData, error } = await supabase
        .from('orders')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return updatedData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};
