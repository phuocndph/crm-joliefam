import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export const useQuotes = (opts?: { managerId?: string | null }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('quotes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, (payload) => {
        console.log('📝 Quotes real-time update received:', payload.eventType, payload.new);
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      })
      .subscribe((status) => {
        console.log('📝 Quotes real-time subscription status:', status);
      });

    return () => {
      console.log('📝 Cleaning up quotes real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['quotes', opts?.managerId ?? 'all'],
    queryFn: async () => {
      console.log('🔍 Fetching quotes with manager filter:', opts?.managerId);
      
      let query = supabase
        .from('quotes')
        .select(`
          *,
          customers (
            name,
            email,
            phone,
            address,
            company
          ),
          assignees (
            name
          )
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
          expiryDate: extractFromNotes(/Ngày hết hạn:\s*(.+)/) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          responsible: quote.assignees?.name || 'Chưa phân công',
          totalAmount: quote.total_amount || 0
        };
      }) || [];

      return formattedQuotes;
    },
    staleTime: 0,
    gcTime: 2 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
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
