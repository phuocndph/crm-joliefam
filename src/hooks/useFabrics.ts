import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

let fabricRealtimeChannel: any = null;
let fabricRealtimeSubscribers = 0;
let fabricInvalidationTimer: ReturnType<typeof setTimeout> | undefined;

const scheduleFabricInvalidation = (queryKeys: string[][], queryClient: ReturnType<typeof useQueryClient>) => {
  if (fabricInvalidationTimer) clearTimeout(fabricInvalidationTimer);
  fabricInvalidationTimer = setTimeout(() => {
    queryKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    fabricInvalidationTimer = undefined;
  }, 500);
};

// Real-time subscription hook for fabric data
const useFabricRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLocalBackend()) return;
    fabricRealtimeSubscribers += 1;
    if (fabricRealtimeChannel) {
      return () => {
        fabricRealtimeSubscribers = Math.max(0, fabricRealtimeSubscribers - 1);
        if (fabricRealtimeSubscribers === 0 && fabricRealtimeChannel) {
          if (fabricInvalidationTimer) clearTimeout(fabricInvalidationTimer);
          supabase.removeChannel(fabricRealtimeChannel);
          fabricRealtimeChannel = null;
        }
      };
    }
    console.log('🔧 Setting up real-time fabric synchronization...');
    
    const channel = supabase
      .channel('fabrics-sync-' + Date.now())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabric_types' },
        () => {
          console.log('🔄 Real-time fabric_types change');
          scheduleFabricInvalidation([['fabric-types'], ['fabric-usage'], ['fabric-inventory']], queryClient);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabric_variants' },
        () => {
          console.log('🔄 Real-time fabric_variants change');
          scheduleFabricInvalidation([['fabric-variants'], ['fabric-inventory'], ['fabric-usage']], queryClient);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabric_widths' },
        () => {
          console.log('🔄 Real-time fabric_widths change');
          scheduleFabricInvalidation([['fabric-widths']], queryClient);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabric_inventory' },
        () => {
          console.log('🔄 Real-time fabric_inventory change');
          scheduleFabricInvalidation([['fabric-inventory']], queryClient);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabric_transactions' },
        () => {
          console.log('🔄 Real-time fabric_transactions change');
          scheduleFabricInvalidation([['fabric-transactions'], ['fabric-cost-history'], ['fabric-inventory']], queryClient);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabric_transfers' },
        () => {
          console.log('🔄 Real-time fabric_transfers change');
          scheduleFabricInvalidation([['fabric-transfers'], ['fabric-inventory']], queryClient);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fabric_usage' },
        () => {
          console.log('🔄 Real-time fabric_usage change');
          scheduleFabricInvalidation([['fabric-usage'], ['fabric-inventory']], queryClient);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouses' },
        () => {
          console.log('🔄 Real-time warehouses change');
          scheduleFabricInvalidation([['warehouses'], ['fabric-usage'], ['fabric-inventory']], queryClient);
        }
      )
      .subscribe((status) => {
        console.log('📡 Fabrics real-time status:', status);
      });
    fabricRealtimeChannel = channel;

    return () => {
      fabricRealtimeSubscribers = Math.max(0, fabricRealtimeSubscribers - 1);
      if (fabricRealtimeSubscribers > 0) return;
      if (fabricInvalidationTimer) clearTimeout(fabricInvalidationTimer);
      console.log('🧹 Cleaning up fabrics real-time subscription');
      supabase.removeChannel(channel);
      fabricRealtimeChannel = null;
    };
  }, [queryClient]);
};

// Fabric Types hooks
export const useFabricTypes = () => {
  const queryClient = useQueryClient();
  useFabricRealtime();

  return useQuery<any[]>({
    queryKey: ['fabric-types'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricTypes() as Promise<any[]>;
      console.log('📊 [useFabricTypes] Fetching fabric types...');
      const { data, error } = await supabase
        .from('fabric_types')
        .select('id, name, description, created_at, updated_at, manager_id, tenant_id')
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
      if (isLocalBackend()) return localApi.createFabricType(data);
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
      if (isLocalBackend()) return localApi.updateFabricType(id, updateData);
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
      if (isLocalBackend()) return localApi.deleteFabricType(id);
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

  return useQuery<any[]>({
    queryKey: ['fabric-variants'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricVariants() as Promise<any[]>;
      console.log('📊 [useFabricVariants] Fetching fabric variants...');
      const { data, error } = await supabase
        .from('fabric_variants')
        .select(`
          id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price, created_at, updated_at, manager_id, tenant_id,
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
      if (isLocalBackend()) return localApi.createFabricVariant(data);
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

  return useQuery<any[]>({
    queryKey: ['fabric-widths'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricWidths() as Promise<any[]>;
      const { data, error } = await supabase
        .from('fabric_widths')
        .select('id, width_code, description, created_at, updated_at, manager_id, tenant_id')
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
      if (isLocalBackend()) return localApi.createFabricWidth(newWidth);
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

  return useQuery<any[]>({
    queryKey: ['warehouses'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricWarehouses() as Promise<any[]>;
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name, address, warehouse_type, is_active, created_at, updated_at, manager_id, tenant_id')
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

  return useQuery<any[]>({
    queryKey: ['fabric-inventory'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricInventory() as Promise<any[]>;
      console.log('📊 [useFabricInventory] Fetching fabric inventory...');
      const { data, error } = await supabase
        .from('fabric_inventory')
        .select(`
          id, fabric_variant_id, warehouse_id, current_stock, packages_count, reserved_stock, minimum_stock, maximum_stock, last_updated, created_at, updated_at, manager_id, tenant_id,
          fabric_variants (
            id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price,
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
      if (isLocalBackend()) return localApi.updateFabricInventory({ fabric_variant_id, warehouse_id, current_stock, packages_count, reserved_stock, minimum_stock, maximum_stock });
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

  return useQuery<any[]>({
    queryKey: ['fabric-transactions'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricTransactions() as Promise<any[]>;
      const { data, error } = await supabase
        .from('fabric_transactions')
        .select(`
          id, fabric_variant_id, warehouse_id, transaction_type, quantity, packages_count, unit_price, total_amount, reference_number, supplier_name, recipient_name, notes, transaction_date, created_at, updated_at, manager_id, tenant_id,
          fabric_variants (
            id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price,
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
      if (isLocalBackend()) return localApi.createFabricTransaction(data);
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
      if (isLocalBackend()) return localApi.updateFabricTransaction(id, updateData);
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

  return useQuery<any[]>({
    queryKey: ['fabric-transfers'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricTransfers() as Promise<any[]>;
      const { data, error } = await supabase
        .from('fabric_transfers')
        .select(`
          id, fabric_variant_id, from_warehouse_id, to_warehouse_id, quantity, transfer_date, status, notes, approved_by, received_by, created_at, updated_at, manager_id, tenant_id,
          fabric_variants (
            id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price,
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
      if (isLocalBackend()) return localApi.createFabricTransfer(data);
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
      if (isLocalBackend()) return localApi.updateFabricTransferStatus(id, { status, approved_by, received_by });
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

  return useQuery<any[]>({
    queryKey: ['fabric-usage'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.fabricUsage() as Promise<any[]>;
      const pageSize = 1000;
      const rows: any[] = [];
      for (let offset = 0; ; offset += pageSize) {
        let response: { data: any[] | null; error: any } = await supabase
          .from('fabric_usage')
          .select(`
            id, order_id, order_number, order_group, order_type, fabric_variant_id, warehouse_id, quantity_used, unit, usage_date, notes, customer_name, customer_code, fabric_width, created_at, updated_at, tenant_id, manager_id,
            fabric_variants (
              id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price,
              fabric_types (name)
            ),
            warehouses (name, warehouse_type)
          `)
          .order('usage_date', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (response.error && (response.error.code === '42703' || response.error.message?.includes('order_group'))) {
          response = await supabase
            .from('fabric_usage')
            .select(`id, order_id, order_number, order_type, fabric_variant_id, warehouse_id, quantity_used, unit, usage_date, notes, customer_name, customer_code, fabric_width, created_at, updated_at, tenant_id, manager_id, fabric_variants (id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price, fabric_types (name)), warehouses (name, warehouse_type)`)
            .order('usage_date', { ascending: false })
            .range(offset, offset + pageSize - 1);
        }
        const { data, error } = response;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return rows;
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

// Cost history is kept separate from the inventory query so reports can value
// usage using the latest known price at the time of the transaction.
export const useFabricCostHistory = () => {
  useFabricRealtime();

  return useQuery<any[]>({
    queryKey: ['fabric-cost-history'],
    queryFn: async () => {
      if (isLocalBackend()) {
        const transactions = await localApi.fabricTransactions();
        return transactions
          .filter((row) => ['inbound', 'adjustment', 'transfer_in'].includes(String(row.transaction_type)) && Number(row.unit_price || 0) > 0)
          .sort((a, b) => `${String(a.transaction_date || '')}${String(a.created_at || '')}`.localeCompare(`${String(b.transaction_date || '')}${String(b.created_at || '')}`))
          .map((row) => ({
            id: String(row.id),
            fabric_variant_id: String(row.fabric_variant_id),
            transaction_type: String(row.transaction_type),
            quantity: Number(row.quantity || 0),
            unit_price: row.unit_price == null ? null : Number(row.unit_price),
            total_amount: row.total_amount == null ? null : Number(row.total_amount),
            transaction_date: String(row.transaction_date || ''),
            created_at: String(row.created_at || ''),
          }));
      }
      const pageSize = 1000;
      const rows: Array<{
        id: string;
        fabric_variant_id: string;
        transaction_type: string;
        quantity: number;
        unit_price: number | null;
        total_amount: number | null;
        transaction_date: string;
        created_at: string;
      }> = [];

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('fabric_transactions')
          .select('id, fabric_variant_id, transaction_type, quantity, unit_price, total_amount, transaction_date, created_at')
          .in('transaction_type', ['inbound', 'adjustment', 'transfer_in'])
          .gt('unit_price', 0)
          .order('transaction_date', { ascending: true })
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return rows;
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
      if (isLocalBackend()) return localApi.fabricUsage(orderId) as Promise<any[]>;
      
        let response: { data: any[] | null; error: any } = await supabase
        .from('fabric_usage')
        .select(`
          id, order_id, order_number, order_group, order_type, fabric_variant_id, warehouse_id, quantity_used, unit, usage_date, notes, customer_name, customer_code, fabric_width, created_at, updated_at, tenant_id, manager_id,
          fabric_variants (
            id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price,
            fabric_types (name),
            fabric_widths (width_code)
          ),
          warehouses (name)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (response.error && (response.error.code === '42703' || response.error.message?.includes('order_group'))) {
        response = await supabase
          .from('fabric_usage')
          .select(`id, order_id, order_number, order_type, fabric_variant_id, warehouse_id, quantity_used, unit, usage_date, notes, customer_name, customer_code, fabric_width, created_at, updated_at, tenant_id, manager_id, fabric_variants (id, fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price, fabric_types (name), fabric_widths (width_code)), warehouses (name)`)
          .eq('order_id', orderId)
          .order('created_at', { ascending: false });
      }
      const { data, error } = response;
      
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
      warehouse_id: string;
      items: Array<{ fabric_variant_id: string; quantity_used: number }>;
      customer_name?: string;
      customer_code?: string;
      order_group?: 'don_phuoc' | 'don_hoan' | 'unclassified';
      order_type?: string;
      usage_date?: string;
      notes?: string;
    }) => {
      console.log('[RPC] record_fabric_usage_batch START', data);
      if (isLocalBackend()) return localApi.createFabricUsageBatch(data);
      
      let { data: result, error } = await supabase.rpc('record_fabric_usage_batch', {
        p_order_id: data.order_id,
        p_order_number: data.order_number,
        p_warehouse_id: data.warehouse_id,
        p_items: data.items,
        p_customer_name: data.customer_name || null,
        p_customer_code: data.customer_code || null,
        p_order_type: data.order_type || null,
        p_order_group: data.order_group || 'unclassified',
        p_usage_date: data.usage_date || new Date().toISOString().split('T')[0],
        p_notes: data.notes || null
      });

      if (error && (error.code === '42883' || error.message?.includes('record_fabric_usage_batch'))) {
        // Compatibility path until the additive migration is applied remotely.
        result = null;
        error = null;
        for (const item of data.items) {
          const legacy = await supabase.rpc('record_fabric_usage_and_transaction', {
            p_order_id: data.order_id,
            p_order_number: data.order_number,
            p_fabric_variant_id: item.fabric_variant_id,
            p_warehouse_id: data.warehouse_id,
            p_quantity_used: item.quantity_used,
            p_customer_name: data.customer_name || null,
            p_customer_code: data.order_group || null,
            p_order_type: data.order_type || null,
            p_usage_date: data.usage_date || new Date().toISOString().split('T')[0],
            p_notes: data.notes || null,
          });
          if (legacy.error) throw legacy.error;
          result = legacy.data;
        }
      }
      if (error) {
        console.error('[RPC] record_fabric_usage_batch ERROR:', error);
        throw error;
      }

      // Check if the RPC returned an error in the result
      if (result && typeof result === 'object' && 'success' in result) {
        const rpcResult = result as { success: boolean; error?: string; error_code?: string; hint?: string };
        if (!rpcResult.success) {
          console.error('[RPC] record_fabric_usage_batch FAILED:', rpcResult);
          const errorMessage = rpcResult.error || 'Unknown error';
          const errorWithDetails = new Error(errorMessage) as Error & { code?: string; hint?: string };
          errorWithDetails.code = rpcResult.error_code;
          errorWithDetails.hint = rpcResult.hint;
          throw errorWithDetails;
        }
      }

      console.log('[RPC] record_fabric_usage_batch SUCCESS:', result);
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
      notes?: string;
      usage_date?: string;
      order_number?: string;
      customer_name?: string;
      customer_code?: string;
      order_type?: string;
      fabric_width?: string;
      order_group?: 'don_phuoc' | 'don_hoan' | 'unclassified';
    }) => {
      if (isLocalBackend()) {
        return localApi.createFabricUsageBatch({
          ...data,
          items: [{ fabric_variant_id: data.fabric_variant_id, quantity_used: data.quantity_used }],
        });
      }
      let { data: result, error } = await supabase.rpc('record_fabric_usage_batch', {
        p_order_id: data.order_id,
        p_order_number: data.order_number || '',
        p_warehouse_id: data.warehouse_id,
        p_items: [{ fabric_variant_id: data.fabric_variant_id, quantity_used: data.quantity_used }],
        p_customer_name: data.customer_name || null,
        p_customer_code: data.customer_code || null,
        p_order_type: data.order_type || null,
        p_order_group: data.order_group || 'unclassified',
        p_usage_date: data.usage_date || new Date().toISOString().split('T')[0],
        p_notes: data.notes || null,
      });
      
      if (error && (error.code === '42883' || error.message?.includes('record_fabric_usage_batch'))) {
        const legacy = await supabase.rpc('record_fabric_usage_and_transaction', {
          p_order_id: data.order_id,
          p_order_number: data.order_number || '',
          p_fabric_variant_id: data.fabric_variant_id,
          p_warehouse_id: data.warehouse_id,
          p_quantity_used: data.quantity_used,
          p_customer_name: data.customer_name || null,
          p_customer_code: data.customer_code || data.order_group || null,
          p_order_type: data.order_type || null,
          p_fabric_width: data.fabric_width || null,
          p_usage_date: data.usage_date || new Date().toISOString().split('T')[0],
          p_notes: data.notes || null,
        });
        result = legacy.data;
        error = legacy.error;
      }
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
      order_group?: 'don_phuoc' | 'don_hoan' | 'unclassified';
    }) => {
      const { id, ...updateData } = data;
      if (isLocalBackend()) return localApi.updateFabricUsage(id, updateData);
      let { data: result, error } = await supabase.rpc('update_fabric_usage_and_transaction', {
        p_usage_id: id,
        p_order_number: updateData.order_number || null,
        p_fabric_variant_id: updateData.fabric_variant_id || null,
        p_warehouse_id: updateData.warehouse_id || null,
        p_quantity_used: updateData.quantity_used || null,
        p_customer_name: updateData.customer_name || null,
        p_customer_code: updateData.customer_code || null,
        p_order_type: updateData.order_type || null,
        p_order_group: updateData.order_group || null,
        p_fabric_width: updateData.fabric_width || null,
        p_usage_date: updateData.usage_date || null,
        p_notes: updateData.notes || null,
      });
      
      if (error && (error.code === '42883' || error.message?.includes('update_fabric_usage_and_transaction'))) {
        const legacy = await supabase.from('fabric_usage').update(updateData).eq('id', id).select().single();
        result = legacy.data;
        error = legacy.error;
      }
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
      if (isLocalBackend()) {
        await localApi.deleteFabricUsage(id);
        return;
      }
      let { data: result, error } = await supabase.rpc('delete_fabric_usage_and_transaction', { p_usage_id: id });
      
      if (error && (error.code === '42883' || error.message?.includes('delete_fabric_usage_and_transaction'))) {
        const legacy = await supabase.from('fabric_usage').delete().eq('id', id);
        result = { success: !legacy.error };
        error = legacy.error;
      }
      if (error) throw error;
      if (result && typeof result === 'object' && 'success' in result && !(result as { success: boolean }).success) {
        throw new Error((result as { error?: string }).error || 'Could not delete fabric usage');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-usage'] });
      queryClient.invalidateQueries({ queryKey: ['fabric-inventory'] });
      toast({ title: "Thành công", description: "Đã xóa ghi nhận sử dụng vải" });
    },
  });
};
