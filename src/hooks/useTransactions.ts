import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

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
  const queryClient = useQueryClient();

  // Set up real-time synchronization
  useEffect(() => {
    console.log('🔧 Setting up real-time transaction synchronization...');
    
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['transactions'] });
    // Only INSERT/DELETE — UPDATE just invalidates cache anyway, no need to receive full payload
    const channel = supabase
      .channel('transactions-sync-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, invalidate)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'transactions' }, invalidate)
      .subscribe();

    return () => {
      console.log('🧹 Cleaning up transactions real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['transactions', managerId],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('id, amount, date, type, description, category, payment_type, order_id, installment_number, total_installments, remaining_amount, created_at, updated_at, manager_id, tenant_id');

      if (managerId) {
        query = query.eq('manager_id', managerId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Transaction[];
    },
    staleTime: 60 * 1000, // Always fetch fresh data
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};
