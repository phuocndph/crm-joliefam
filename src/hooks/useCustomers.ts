import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

export const useCustomers = () => {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.customers();
      console.log('🔍 Fetching customers...');
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_code, name, email, phone, address, phones, addresses, company, notes, tags, auto_tags, purchase_count, last_purchase_date, total_spent, current_status, last_care_date, assignee_id, manager_id, tenant_id, created_at, updated_at')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error fetching customers:', error);
        throw error;
      }
      console.log(`✅ Customers fetched: ${data?.length || 0}`);
      return data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Set up real-time synchronization
  useEffect(() => {
    if (isLocalBackend()) return;
    console.log('🔧 Setting up real-time customer synchronization...');
    
    // Invalidate silently for all row changes; the follow-up query fetches only selected columns.
    const channel = supabase
      .channel('customers-sync-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'customers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      })
      .subscribe();

    return () => {
      console.log('🧹 Cleaning up real-time customer subscription...');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
};

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (customerData: any) => {
      if (isLocalBackend()) return localApi.createCustomer(customerData);
      const { data, error } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

export const useUpdateCustomer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      if (isLocalBackend()) return localApi.updateCustomer(id, data);
      const { data: updatedData, error } = await supabase
        .from('customers')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return updatedData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

export const useDeleteCustomer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (isLocalBackend()) { await localApi.archiveCustomer(id); return; }
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};
