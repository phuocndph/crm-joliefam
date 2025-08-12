import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
export const useOrders = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('📦 Orders real-time update received:', payload.eventType, payload.new);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .subscribe((status) => {
        console.log('📦 Orders real-time subscription status:', status);
      });

    return () => {
      console.log('📦 Cleaning up orders real-time subscription');
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
      
      if (error) throw error;
      
      // Calculate total_paid for each order
      const ordersWithPayments = data.map(order => {
        const total_paid = order.order_payments?.reduce((sum: number, payment: any) => 
          sum + (payment.payment_amount || 0), 0) || 0;
        
        return {
          ...order,
          total_paid
        };
      });
      
      return ordersWithPayments;
    },
    staleTime: 5 * 60 * 1000, // 5 phút
    gcTime: 10 * 60 * 1000, // 10 phút
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