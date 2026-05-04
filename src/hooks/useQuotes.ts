import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export const useQuotes = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Egress optimization: only listen to INSERT/DELETE (UPDATE just invalidates cache)
    const channel = supabase
      .channel('quotes-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      })
      .subscribe();

    return () => {
      console.log('📝 Cleaning up quotes real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['quotes', opts?.managerId ?? 'all'],
    queryFn: async () => {
      console.log('🔍 Fetching quotes with manager filter:', opts?.managerId);
      
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
        let customerName = 'Không có tên';
        if (quote.customers?.name) {
          customerName = quote.customers.name;
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
          customerEmail: quote.customers?.email || extractFromNotes(/Email:\s*([^\n\r]+)/),
          customerPhone: quote.customers?.phone || extractFromNotes(/Điện thoại:\s*([^\n\r]+)/),
          customerAddress: quote.customers?.address || extractFromNotes(/Địa chỉ:\s*([^\n\r]+)/),
          customerCompany: quote.customers?.company || '',
          quoteDate: quote.created_at,
          expiryDate: (() => {
            const raw = extractFromNotes(/Ngày hết hạn:\s*([^\n\r]+)/);
            if (!raw) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            // Support dd/MM/yyyy
            const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmy) {
              const d = new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]), 12, 0, 0);
              return !isNaN(d.getTime()) ? d.toISOString() : raw;
            }
            // Support yyyy-MM-dd (legacy)
            const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (iso) {
              const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]), 12, 0, 0);
              return !isNaN(d.getTime()) ? d.toISOString() : raw;
            }
            return raw;
          })(),
          responsible: quote.assignees?.name || 'Chưa phân công',
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
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useDeleteQuote = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
};

/**
 * Fetch the heavy `quote_data` JSONB for a single quote on-demand.
 * Used when approving, duplicating, or previewing — keeps list queries light.
 */
export const fetchQuoteData = async (quoteId: string): Promise<string | null> => {
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
