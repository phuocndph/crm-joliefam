import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
export const useOrders = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('orders-and-payments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('📦 Orders real-time update received:', payload.eventType, payload.new);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, (payload) => {
        console.log('💰 Order payments real-time update received:', payload.eventType, payload.new);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .subscribe((status) => {
        console.log('📦 Orders and payments real-time subscription status:', status);
      });

    return () => {
      console.log('📦 Cleaning up orders and payments real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['orders', opts?.managerId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          customers:customer_id (name, email, phone, company, customer_code),
          assignees:assignee_id (name),
          order_payments (payment_amount, payment_date, payment_type)
        `)
        .order('created_at', { ascending: false });
      
      if (opts?.managerId && opts.managerId !== 'all') {
        query = query.eq('manager_id', opts.managerId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Error fetching orders:', error);
        throw error;
      }
      
      console.log(`📊 Fetched ${data?.length || 0} orders with payments data`);
      
      // Calculate total_paid for each order
      const ordersWithPayments = data.map(order => {
        const total_paid = order.order_payments?.reduce((sum: number, payment: any) => 
          sum + (payment.payment_amount || 0), 0) || 0;
        
        console.log(`💰 Order ${order.order_number}: ${order.order_payments?.length || 0} payments, total: ${total_paid}`);
        
        return {
          ...order,
          total_paid
        };
      });
      
      return ordersWithPayments;
    },
    staleTime: 30 * 1000, // 30 seconds for fresher data
    gcTime: 2 * 60 * 1000, // 2 minutes
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