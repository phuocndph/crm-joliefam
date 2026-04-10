import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
export const useOrders = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Use unique channel name to prevent conflicts across multiple tabs
    const channelName = `orders-payments-quotes-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('📦 Orders real-time update received:', payload.eventType, payload.new);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, (payload) => {
        console.log('💰 Order payments real-time update received:', payload.eventType, payload.new);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, (payload) => {
        console.log('📝 Quotes real-time update received:', payload.eventType, payload.new);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
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
      
      // First, get all orders
      let ordersQuery = supabase
        .from('orders')
        .select(`
          *,
          customers!left(name, email, phone, company, customer_code, address, addresses),
          assignees(name),
          quotes(quote_data),
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
        const { data: payments, error: paymentsError } = await supabase
          .from('order_payments')
          .select('order_id, payment_amount, payment_date, payment_type')
          .in('order_id', orderIds);
        
        if (paymentsError) {
          console.error('❌ Error fetching payments:', paymentsError);
        } else {
          paymentsData = payments || [];
          console.log(`💰 Fetched ${paymentsData.length} payments for ${orderIds.length} orders`);
        }
      }
      
      // Calculate total_paid for each order
      const ordersWithPayments = ordersData?.map(order => {
        const orderPayments = paymentsData.filter(payment => payment.order_id === order.id);
        let total_paid = orderPayments.reduce((sum: number, payment: any) => 
          sum + (payment.payment_amount || 0), 0);
        
        // If no order payments but has quote data with payment1, use that
        if (total_paid === 0 && order.quotes && order.quotes.quote_data) {
          try {
            const quoteDataStr = typeof order.quotes.quote_data === 'string' 
              ? order.quotes.quote_data 
              : JSON.stringify(order.quotes.quote_data);
            const quoteData = JSON.parse(quoteDataStr);
            const payment1 = quoteData.payment1 || 0;
            if (payment1 > 0) {
              total_paid = payment1;
              console.log(`💰 Order ${order.order_number}: Using quote payment ${payment1} (no order payments found)`);
            }
          } catch (error) {
            console.error('Error parsing quote_data:', error);
          }
        }
        
        console.log(`💰 Order ${order.order_number}: ${orderPayments.length} payments, total: ${total_paid}`);
        
        return {
          ...order,
          order_payments: orderPayments,
          total_paid
        };
      }) || [];
      
      return ordersWithPayments;
    },
    staleTime: 0, // Always fetch fresh data after invalidation
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useUpdateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
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