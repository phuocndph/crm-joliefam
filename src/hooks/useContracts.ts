import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

export const useContracts = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLocalBackend()) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contracts'] });
    const channel = supabase
      .channel('contracts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contracts' }, invalidate)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contracts' }, invalidate)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ['contracts', opts?.managerId ?? 'all'],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.contracts({ managerId: opts?.managerId });
      let query = supabase
        .from('contracts' as any)
        .select(`*, customers (name, email, phone, address, company)`)
        .order('created_at', { ascending: false });

      if (opts?.managerId && opts.managerId !== 'all') {
        query = query.eq('manager_id', opts.managerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
};

export const useCreateContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contract: any) => {
      if (isLocalBackend()) return localApi.createContract(contract);
      const { data, error } = await supabase
        .from('contracts' as any)
        .insert(contract)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
};

export const useUpdateContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      if (isLocalBackend()) return localApi.updateContract(id, updates);
      const { data, error } = await supabase
        .from('contracts' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
};

export const useDeleteContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isLocalBackend()) { await localApi.deleteContract(id); return; }
      const { error } = await supabase
        .from('contracts' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
};

export const generateContractNumber = () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `HD-${dateStr}-${rand}`;
};
