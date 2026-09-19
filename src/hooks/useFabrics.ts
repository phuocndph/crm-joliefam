import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';

// Real-time subscription hook for fabric data
const useFabricRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('🔧 Setting up real-time fabric synchronization...');
    
    const channel = supabase
      .channel('fabrics-sync-' + Date.now())
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fabric_types' },
        () => {
          console.log('🔄 Real-time fabric_types change');
          queryClient.invalidateQueries({ queryKey: ['fabric-types'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fabric_variants' },
        () => {
          console.log('🔄 Real-time fabric_variants change');
          queryClient.invalidateQueries({ queryKey: ['fabric-variants'] });
          queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fabric_widths' },
        () => {
          console.log('🔄 Real-time fabric_widths change');
          queryClient.invalidateQueries({ queryKey: ['fabric-widths'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fabric_inventory' },
        () => {
          console.log('🔄 Real-time fabric_inventory change');
          queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fabric_transactions' },
        () => {
          console.log('🔄 Real-time fabric_transactions change');
          queryClient.invalidateQueries({ queryKey: ['fabric-transactions'] });
          queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fabric_transfers' },
        () => {
          console.log('🔄 Real-time fabric_transfers change');
          queryClient.invalidateQueries({ queryKey: ['fabric-transfers'] });
          queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fabric_usage' },
        () => {
          console.log('🔄 Real-time fabric_usage change');
          queryClient.invalidateQueries({ queryKey: ['fabric-usage'] });
          queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warehouses' },
        () => {
          console.log('🔄 Real-time warehouses change');
          queryClient.invalidateQueries({ queryKey: ['warehouses'] });
        }
      )
      .subscribe((status) => {
        console.log('📡 Fabrics real-time status:', status);
      });

    return () => {
      console.log('🧹 Cleaning up fabrics real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};

// Fabric Types hooks
export const useFabricTypes = () => {
  const queryClient = useQueryClient();
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-types'],
    queryFn: async () => {
      console.log('📊 [useFabricTypes] Fetching fabric types...');
      const { data, error } = await supabase
        .from('fabric_types')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('🔴 [useFabricTypes] Error:', error);
        throw error;
      }
      console.log('✅ [useFabricTypes] Fetched', data?.length || 0, 'fabric types');
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useCreateFabricType = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { data: result, error } = await supabase
        .from('fabric_types')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-types'] });
      toast({ title: "Thành công", description: "Đã tạo loại vải mới" });
    },
  });
};

export const useUpdateFabricType = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; name: string; description?: string }) => {
      const { id, ...updateData } = data;
      const { data: result, error } = await supabase
        .from('fabric_types')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-types'] });
      toast({ title: "Thành công", description: "Đã cập nhật loại vải" });
    },
  });
};

export const useDeleteFabricType = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fabric_types')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-types'] });
      toast({ title: "Thành công", description: "Đã xóa loại vải" });
    },
  });
};

// Fabric Variants hooks
export const useFabricVariants = () => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-variants'],
    queryFn: async () => {
      console.log('📊 [useFabricVariants] Fetching fabric variants...');
      const { data, error } = await supabase
        .from('fabric_variants')
        .select(`
          *,
          fabric_types (name, description)
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('🔴 [useFabricVariants] Error:', error);
        throw error;
      }
      console.log('✅ [useFabricVariants] Fetched', data?.length || 0, 'fabric variants');
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useCreateFabricVariant = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      fabric_type_id: string;
      variant_name: string;
      width_code?: string;
      weight?: string;
      color?: string;
      origin?: string;
      unit?: string;
      cost_price?: number;
      selling_price?: number;
    }) => {
      const { data: result, error } = await supabase
        .from('fabric_variants')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-variants'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã tạo biến thể vải mới" });
    },
  });
};

// Fabric Widths hooks
export const useFabricWidths = () => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-widths'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fabric_widths')
        .select('*')
        .order('width_code');
      
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useCreateFabricWidth = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newWidth: { width_code: string; description?: string }) => {
      const { data, error } = await supabase
        .from('fabric_widths')
        .insert([newWidth])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-widths'] });
    },
  });
};

// Warehouses hooks
export const useWarehouses = () => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('warehouse_type', { ascending: false }); // main first
      
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

// Fabric Inventory hooks
export const useFabricInventory = () => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-inventory'],
    queryFn: async () => {
      console.log('📊 [useFabricInventory] Fetching fabric inventory...');
      const { data, error } = await supabase
        .from('fabric_inventory')
        .select(`
          *,
          fabric_variants (
            *,
            fabric_types (name, description)
          ),
          warehouses (name, warehouse_type)
        `)
        .order('last_updated', { ascending: false });
      
      if (error) {
        console.error('🔴 [useFabricInventory] Error:', error);
        throw error;
      }
      console.log('✅ [useFabricInventory] Fetched', data?.length || 0, 'inventory records');
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useUpdateInventory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      fabric_variant_id, 
      warehouse_id, 
      current_stock,
      packages_count = 0,
      reserved_stock = 0,
      minimum_stock = 0,
      maximum_stock = 0
    }: {
      fabric_variant_id: string;
      warehouse_id: string;
      current_stock: number;
      packages_count?: number;
      reserved_stock?: number;
      minimum_stock?: number;
      maximum_stock?: number;
    }) => {
      // First, check if record already exists
      const { data: existingRecord } = await supabase
        .from('fabric_inventory')
        .select('id')
        .eq('fabric_variant_id', fabric_variant_id)
        .eq('warehouse_id', warehouse_id)
        .single();

      const upsertData = {
        fabric_variant_id,
        warehouse_id,
        current_stock,
        packages_count,
        reserved_stock,
        minimum_stock,
        maximum_stock,
        last_updated: new Date().toISOString(),
        ...(existingRecord?.id && { id: existingRecord.id })
      };

      const { data, error } = await supabase
        .from('fabric_inventory')
        .upsert(upsertData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã cập nhật tồn kho" });
    },
  });
};

// Fabric Transactions hooks
export const useFabricTransactions = () => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fabric_transactions')
        .select(`
          *,
          fabric_variants (
            *,
            fabric_types (name)
          ),
          warehouses (name)
        `)
        .order('transaction_date', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

const FABRIC_TX_PAGE_SIZE = 100;

// Paginated fabric transactions (no 100-record cap — load more on demand)
export const useInfiniteFabricTransactions = (fabricTypeId?: string) => {
  useFabricRealtime();

  return useInfiniteQuery({
    queryKey: ['fabric-transactions', 'infinite', fabricTypeId ?? 'all'],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * FABRIC_TX_PAGE_SIZE;
      const to = from + FABRIC_TX_PAGE_SIZE - 1;
      let query = supabase
        .from('fabric_transactions')
        .select(`
          *,
          fabric_variants${fabricTypeId ? '!inner' : ''} (
            *,
            fabric_types (name)
          ),
          warehouses (name)
        `)
        .order('transaction_date', { ascending: false })
        .range(from, to);

      if (fabricTypeId) {
        query = query.eq('fabric_variants.fabric_type_id', fabricTypeId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FABRIC_TX_PAGE_SIZE ? undefined : allPages.length,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useCreateTransaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      fabric_variant_id: string;
      warehouse_id: string;
      transaction_type: 'inbound' | 'outbound' | 'transfer_in' | 'transfer_out' | 'adjustment';
      quantity: number;
      packages_count?: number;
      unit_price?: number;
      total_amount?: number;
      reference_number?: string;
      supplier_name?: string;
      recipient_name?: string;
      notes?: string;
      transaction_date?: string;
      manager_id?: string | null;
    }) => {
      const { data: result, error } = await supabase
        .from('fabric_transactions')
        .insert({
          ...data,
          total_amount: data.total_amount || (data.unit_price || 0) * data.quantity
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã tạo giao dịch vải" });
    },
  });
};

export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      id: string;
      fabric_variant_id: string;
      warehouse_id: string;
      transaction_type: 'inbound' | 'outbound' | 'transfer_in' | 'transfer_out' | 'adjustment';
      quantity: number;
      packages_count?: number;
      unit_price?: number;
      total_amount?: number;
      reference_number?: string;
      supplier_name?: string;
      recipient_name?: string;
      notes?: string;
      transaction_date?: string;
    }) => {
      const { id, ...updateData } = data;
      const { data: result, error } = await supabase
        .from('fabric_transactions')
        .update({
          ...updateData,
          total_amount: updateData.total_amount || (updateData.unit_price || 0) * updateData.quantity
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã cập nhật giao dịch vải" });
    },
  });
};

// Fabric Transfers hooks
export const useFabricTransfers = () => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fabric_transfers')
        .select(`
          *,
          fabric_variants (
            *,
            fabric_types (name)
          ),
          from_warehouse:warehouses!fabric_transfers_from_warehouse_id_fkey (name),
          to_warehouse:warehouses!fabric_transfers_to_warehouse_id_fkey (name)
        `)
        .order('transfer_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useCreateTransfer = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      fabric_variant_id: string;
      from_warehouse_id: string;
      to_warehouse_id: string;
      quantity: number;
      notes?: string;
      transfer_date?: string;
    }) => {
      const { data: result, error } = await supabase
        .from('fabric_transfers')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-transfers'] });
      toast({ title: "Thành công", description: "Đã tạo yêu cầu chuyển kho" });
    },
  });
};

export const useUpdateTransferStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      approved_by, 
      received_by 
    }: {
      id: string;
      status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
      approved_by?: string;
      received_by?: string;
    }) => {
      const { data, error } = await supabase
        .from('fabric_transfers')
        .update({ status, approved_by, received_by })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã cập nhật trạng thái chuyển kho" });
    },
  });
};

// Fabric Usage hooks
export const useFabricUsage = () => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fabric_usage')
        .select(`
          *,
          fabric_variants (
            *,
            fabric_types (name)
          ),
          warehouses (name, warehouse_type)
        `)
        .order('usage_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useFabricUsageByOrder = (orderId?: string) => {
  useFabricRealtime();

  return useQuery({
    queryKey: ['fabric-usage', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      
      const { data, error } = await supabase
        .from('fabric_usage')
        .select(`
          *,
          fabric_variants (
            *,
            fabric_types (name),
            fabric_widths (width_code)
          ),
          warehouses (name)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

// New atomic RPC mutation for recording fabric usage + transaction together
export const useRecordFabricUsageAtomic = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      order_id: string;
      order_number: string;
      fabric_variant_id: string;
      warehouse_id: string;
      quantity_used: number;
      customer_name?: string;
      customer_code?: string;
      order_type?: string;
      fabric_width?: string;
      usage_date?: string;
      notes?: string;
    }) => {
      console.log('🔧 [RPC] record_fabric_usage_and_transaction START', data);
      
      const { data: result, error } = await supabase.rpc('record_fabric_usage_and_transaction', {
        p_order_id: data.order_id,
        p_order_number: data.order_number,
        p_fabric_variant_id: data.fabric_variant_id,
        p_warehouse_id: data.warehouse_id,
        p_quantity_used: data.quantity_used,
        p_customer_name: data.customer_name || null,
        p_customer_code: data.customer_code || null,
        p_order_type: data.order_type || null,
        p_fabric_width: data.fabric_width || null,
        p_usage_date: data.usage_date || new Date().toISOString().split('T')[0],
        p_notes: data.notes || null
      });

      if (error) {
        console.error('🔴 [RPC] record_fabric_usage_and_transaction ERROR:', error);
        throw error;
      }

      // Check if the RPC returned an error in the result
      if (result && typeof result === 'object' && 'success' in result) {
        const rpcResult = result as { success: boolean; error?: string; error_code?: string; hint?: string };
        if (!rpcResult.success) {
          console.error('🔴 [RPC] record_fabric_usage_and_transaction FAILED:', rpcResult);
          const errorMessage = rpcResult.error || 'Unknown error';
          const errorWithDetails = new Error(errorMessage) as Error & { code?: string; hint?: string };
          errorWithDetails.code = rpcResult.error_code;
          errorWithDetails.hint = rpcResult.hint;
          throw errorWithDetails;
        }
      }

      console.log('✅ [RPC] record_fabric_usage_and_transaction SUCCESS:', result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-usage'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-transactions'] });
      toast({ title: "Thành công", description: "Đã ghi nhận sử dụng vải" });
    },
    onError: (error: Error & { code?: string; hint?: string }) => {
      console.error('🔴 [Mutation] useRecordFabricUsageAtomic ERROR:', error);
      // Don't show toast here - let the component handle it for detailed display
    },
  });
};

export const useCreateFabricUsage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      order_id: string;
      fabric_variant_id: string;
      warehouse_id: string;
      quantity_used: number;
      unit?: string;
      notes?: string;
      usage_date?: string;
      order_number?: string;
      customer_name?: string;
      customer_code?: string;
      order_type?: string;
      fabric_width?: string;
    }) => {
      const { data: result, error } = await supabase
        .from('fabric_usage')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-usage'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã ghi nhận sử dụng vải" });
    },
  });
};

export const useUpdateFabricUsage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      id: string;
      order_id?: string;
      fabric_variant_id?: string;
      warehouse_id?: string;
      quantity_used?: number;
      unit?: string;
      notes?: string;
      usage_date?: string;
      order_number?: string;
      customer_name?: string;
      customer_code?: string;
      order_type?: string;
      fabric_width?: string;
    }) => {
      const { id, ...updateData } = data;
      const { data: result, error } = await supabase
        .from('fabric_usage')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-usage'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã cập nhật sử dụng vải" });
    },
  });
};

export const useDeleteFabricUsage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fabric_usage')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-usage'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã xóa ghi nhận sử dụng vải" });
    },
  });
};
