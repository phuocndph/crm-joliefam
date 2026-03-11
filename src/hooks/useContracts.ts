import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export const useContracts = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('contracts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ['contracts', opts?.managerId ?? 'all'],
    queryFn: async () => {
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
