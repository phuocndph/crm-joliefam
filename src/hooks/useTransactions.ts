import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Transaction {
  id: string;
  amount: number;
  date: string;
  type: string;
  description: string;
  category: string;
  payment_type: string;
  order_id?: string;
  installment_number?: number;
  total_installments?: number;
  remaining_amount?: number;
  created_at: string;
  updated_at: string;
  manager_id?: string;
  tenant_id: string;
}

export const useTransactions = (managerId?: string | null) => {
  return useQuery({
    queryKey: ['transactions', managerId],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*');

      // Filter by manager_id if provided
      if (managerId) {
        query = query.eq('manager_id', managerId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Transaction[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};