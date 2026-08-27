import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Phát hiện trùng `display_order_number` trên TOÀN BỘ DB (không lọc theo manager).
 * Dùng SECURITY DEFINER function để mọi role đều thấy được, kể cả nhân viên/manager
 * (vì trigger auto-link GHN cũng đếm trùng toàn cục, không theo manager).
 */
export const useDuplicateOrderNumbers = () => {
  return useQuery({
    queryKey: ['duplicate-order-numbers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_duplicate_display_order_numbers');
      if (error) throw error;
      return ((data || []) as Array<{ display_number: string; dup_count: number }>).map(
        r => [r.display_number, Number(r.dup_count)] as [string, number]
      );
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};