import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useOrders = (managerId?: string | null) => {
  return useQuery({
    queryKey: ['orders', managerId],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          customers (name, email, phone, company, customer_code),
          assignees (name),
          order_payments (payment_amount, payment_date, payment_type),
          manager_profile:profiles!manager_id (first_name, last_name)
        `);

      // Only filter by manager_id for accountants who need to see specific manager's data
      // For managers and employees, RLS will automatically filter the data
      if (managerId && managerId !== 'all') {
        query = query.eq('manager_id', managerId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
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