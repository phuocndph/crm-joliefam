import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// Fabric Types hooks
export const useFabricTypes = () => {
  return useQuery({
    queryKey: ['fabric-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fabric_types')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
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

// Fabric Variants hooks
export const useFabricVariants = () => {
  return useQuery({
    queryKey: ['fabric-variants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fabric_variants')
        .select(`
          *,
          fabric_types (name, description)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
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
  });
};

// Fabric Inventory hooks
export const useFabricInventory = () => {
  return useQuery({
    queryKey: ['fabric-inventory'],
    queryFn: async () => {
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
      
      if (error) throw error;
      return data;
    },
  });
};

export const useUpdateInventory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      fabric_variant_id, 
      warehouse_id, 
      current_stock,
      reserved_stock = 0,
      minimum_stock = 0,
      maximum_stock = 0
    }: {
      fabric_variant_id: string;
      warehouse_id: string;
      current_stock: number;
      reserved_stock?: number;
      minimum_stock?: number;
      maximum_stock?: number;
    }) => {
      const { data, error } = await supabase
        .from('fabric_inventory')
        .upsert({
          fabric_variant_id,
          warehouse_id,
          current_stock,
          reserved_stock,
          minimum_stock,
          maximum_stock,
          last_updated: new Date().toISOString()
        })
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
      unit_price?: number;
      total_amount?: number;
      reference_number?: string;
      supplier_name?: string;
      recipient_name?: string;
      notes?: string;
      transaction_date?: string;
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

// Fabric Transfers hooks
export const useFabricTransfers = () => {
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
  });
};

export const useCreateFabricUsage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      order_number: string;
      fabric_variant_id: string;
      warehouse_id: string;
      quantity_used: number;
      customer_name: string;
      customer_code?: string;
      usage_date?: string;
      notes?: string;
    }) => {
      const { data: result, error } = await supabase
        .from('fabric_usage')
        .insert({
          ...data,
          order_id: crypto.randomUUID()
        })
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