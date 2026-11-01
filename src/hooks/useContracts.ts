import { canonicalContract, normalizedContractDates, validateContract } from "@/lib/contract-calculation";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';
import type { PaymentRequestSource } from '@/lib/payment-request';

export const useContracts = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();
  const { user, isReady } = useAuthReady();

  useEffect(() => {
    if (isLocalBackend()) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contracts'] });
    const channel = supabase
      .channel('contracts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contracts' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contracts' }, invalidate)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contracts' }, invalidate)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ['contracts', user?.id, opts?.managerId ?? 'all'],
    enabled: isReady && Boolean(user),
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
      validateContract(contract);
      contract = normalizedContractDates({ ...contract, ...canonicalContract(contract) });
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
      updates = normalizedContractDates(updates);
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

/** A payment request describes agreed contract terms, independently of cash receipts. */
export const usePaymentRequestContract = (id?: string, open = true) => {
  const { user, isReady } = useAuthReady();
  return useQuery({
    queryKey: ['payment-request-contract', user?.id, id], enabled: open && isReady && Boolean(user && id),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Record<string, unknown>> => {
      if (isLocalBackend()) {
        const contract = (await localApi.contracts()).find(row => row.id === id);
        if (!contract) throw new Error('Không tìm thấy hợp đồng hoặc không có quyền đọc.');
        return contract;
      }
      const { data, error } = await supabase.from('contracts').select('*, customers (name, email, phone, address, company)').eq('id', id!).single();
      if (error) throw error;
      if (!data) throw new Error('Không tìm thấy hợp đồng hoặc không có quyền đọc.');
      return data as unknown as Record<string, unknown>;
    },
  });
};

export const useContractPaymentSummary = (id?: string, open = true) => {
  const { user, isReady } = useAuthReady();
  return useQuery({
    queryKey: ['contract-payments', user?.id, id], enabled: open && isReady && Boolean(user && id),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PaymentRequestSource> => {
      if (isLocalBackend()) {
        const contracts = await localApi.contracts();
        const contract = contracts.find(row => row.id === id);
        if (!contract) throw new Error('Không tìm thấy hợp đồng hoặc không có quyền đọc.');
        const summary = await localApi.contractPaymentSummary(id!);
        return { ...summary, contract };
      }
      const { data: contract, error: contractError } = await supabase.from('contracts').select('*').eq('id', id!).single();
      if (contractError) throw contractError;
      if (!contract) throw new Error('Không tìm thấy hợp đồng hoặc không có quyền đọc.');
      const rpcClient = supabase as unknown as { rpc(name: 'contract_payment_summary', args: { p_contract_id: string }): Promise<{ data: { known: boolean; paid: number | null; remaining: number | null; reason: string }; error: Error | null }> };
      const { data, error } = await rpcClient.rpc('contract_payment_summary', { p_contract_id: id! });
      if (error) throw error;
      if (!data) throw new Error('Không tải được chứng từ thu của hợp đồng.');
      return { ...data, contract: contract as unknown as Record<string, unknown> };
    },
  });
};
