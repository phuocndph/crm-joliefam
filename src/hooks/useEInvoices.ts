import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useEInvoices = (contractId?: string) => {
  return useQuery({
    queryKey: ["einvoices", contractId || "all"],
    queryFn: async () => {
      let query = supabase
        .from("einvoices" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (contractId) {
        query = query.eq("contract_id", contractId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
};
