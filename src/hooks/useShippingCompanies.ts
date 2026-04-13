import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ShippingCompany {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  areas: string[];
  contact_person: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useShippingCompanies = () => {
  const [companies, setCompanies] = useState<ShippingCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shipping_companies')
        .select('*')
        .order('name');

      if (error) throw error;
      setCompanies((data || []) as ShippingCompany[]);
    } catch (error: any) {
      console.error('Error fetching shipping companies:', error);
      toast({ title: 'Lỗi', description: 'Không thể tải danh sách nhà xe', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const createCompany = async (company: Omit<ShippingCompany, 'id' | 'created_at' | 'updated_at'>) => {
    const { error } = await supabase.from('shipping_companies').insert(company as any);
    if (error) throw error;
    await fetchCompanies();
  };

  const updateCompany = async (id: string, company: Partial<ShippingCompany>) => {
    const { error } = await supabase.from('shipping_companies').update(company as any).eq('id', id);
    if (error) throw error;
    await fetchCompanies();
  };

  const deleteCompany = async (id: string) => {
    const { error } = await supabase.from('shipping_companies').delete().eq('id', id);
    if (error) throw error;
    await fetchCompanies();
  };

  return { companies, loading, fetchCompanies, createCompany, updateCompany, deleteCompany };
};
