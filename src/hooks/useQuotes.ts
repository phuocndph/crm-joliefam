import { resolveQuoteDates } from '@/lib/quote-dates';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';
import { formatQuote } from './useInfiniteQuotes';

export const useQuotes = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLocalBackend()) return;
    // Keep edits/status changes from other sessions visible without shipping row payloads.
    const channel = supabase
      .channel('quotes-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      })
      .subscribe();

    return () => {
      console.log('📝 Cleaning up quotes real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery<any[]>({
    queryKey: ['quotes', opts?.managerId ?? 'all'],
    queryFn: async () => {
      console.log('🔍 Fetching quotes with manager filter:', opts?.managerId);
      if (isLocalBackend()) {
        const rows = await localApi.quotes({ managerId: opts?.managerId, limit: 200 });
        return rows.map(formatQuote);
      }
      
      // Egress optimization: exclude heavy `quote_data` JSONB from list query.
      // Fetch it on-demand via fetchQuoteData() when approving/duplicating/previewing.
      let query = supabase
        .from('quotes')
        .select(`
          id, quote_number, customer_id, manager_id, assignee_id, price_list_id,
          items, total_amount, subtotal, vat_amount, include_vat, vat_rate,
          status, notes, created_at, updated_at, tenant_id,
          customers ( name, email, phone, address, company ),
          assignees ( name )
        `)
        .order('created_at', { ascending: false });

      if (opts?.managerId && opts.managerId !== 'all') {
        query = query.eq('manager_id', opts.managerId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching quotes:', error);
        throw error;
      }

      console.log(`📊 Fetched ${data?.length || 0} quotes`);

      // Format quotes with extracted customer info
      const formattedQuotes = data?.map(quote => {
        const customer = Array.isArray(quote.customers) ? quote.customers[0] : quote.customers;
        const assignee = Array.isArray(quote.assignees) ? quote.assignees[0] : quote.assignees;
        let customerName = 'Không có tên';
        if (customer?.name) {
          customerName = customer.name;
        } else if (quote.notes) {
          const customerMatch = quote.notes.match(/Khách hàng:\s*(.+)/);
          if (customerMatch && customerMatch[1].trim()) {
            customerName = customerMatch[1].trim();
          }
        }

        const extractFromNotes = (pattern: RegExp) => {
          if (!quote.notes) return '';
          const match = quote.notes.match(pattern);
          return match && match[1] ? match[1].trim() : '';
        };

        return {
          ...quote,
          customerName,
          customerEmail: customer?.email || extractFromNotes(/Email:\s*([^\n\r]+)/),
          customerPhone: customer?.phone || extractFromNotes(/Điện thoại:\s*([^\n\r]+)/),
          customerAddress: customer?.address || extractFromNotes(/Địa chỉ:\s*([^\n\r]+)/),
          customerCompany: customer?.company || '',
          ...resolveQuoteDates(quote),
          responsible: assignee?.name || 'Chưa phân công',
          totalAmount: quote.total_amount || 0
        };
      }) || [];

      return formattedQuotes;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
};

export const useUpdateQuote = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      if (isLocalBackend()) return localApi.updateQuote(id, data);
      const { data: updatedData, error } = await supabase
        .from('quotes')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return updatedData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useDeleteQuote = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (quoteId: string) => {
      if (isLocalBackend()) {
        await localApi.deleteQuote(quoteId);
        return;
      }
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
    },
  });
};

/**
 * Fetch the heavy `quote_data` JSONB for a single quote on-demand.
 * Used when approving, duplicating, or previewing — keeps list queries light.
 */
export const fetchQuoteData = async (quoteId: string): Promise<string | null> => {
  if (isLocalBackend()) {
    const result = await localApi.quoteData(quoteId);
    return result.quote_data == null ? null : JSON.stringify(result.quote_data);
  }
  const { data, error } = await supabase
    .from('quotes')
    .select('quote_data')
    .eq('id', quoteId)
    .single();
  if (error) {
    console.error('❌ Error fetching quote_data:', error);
    return null;
  }
  return (data?.quote_data as string | null) ?? null;
};
