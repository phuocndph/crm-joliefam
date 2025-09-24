import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

export const useCustomers = () => {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      console.log('🔍 Fetching customers...');
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error fetching customers:', error);
        throw error;
      }
      console.log(`✅ Customers fetched: ${data?.length || 0}`);
      return data;
    },
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  // Set up real-time synchronization
  useEffect(() => {
    console.log('🔧 Setting up real-time customer synchronization...');
    
    const channel = supabase
      .channel('customers-sync-' + Date.now()) // Unique channel name
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'customers'
        },
        (payload) => {
          console.log('🔄 Real-time customer change detected:', payload.eventType, payload);
          
          // Force refetch immediately with background refetch
          queryClient.refetchQueries({ 
            queryKey: ['customers'],
            type: 'active'
          });
          
          // Also invalidate to ensure fresh data
          queryClient.invalidateQueries({ queryKey: ['customers'] });
          
          // Show synchronization notifications
          if (payload.eventType === 'INSERT') {
            toast.success('🔄 Khách hàng mới đã được đồng bộ từ tài khoản khác');
          } else if (payload.eventType === 'UPDATE') {
            toast.info('🔄 Thông tin khách hàng đã được đồng bộ cập nhật');
          } else if (payload.eventType === 'DELETE') {
            toast.warning('🔄 Khách hàng đã được xóa và đồng bộ');
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Real-time subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time customer synchronization ACTIVE');
          toast.success('✅ Đồng bộ thời gian thực đã được kích hoạt');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error');
          toast.error('❌ Lỗi kết nối đồng bộ thời gian thực');
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Real-time subscription timed out');
          toast.error('⏰ Kết nối đồng bộ bị timeout');
        }
      });

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