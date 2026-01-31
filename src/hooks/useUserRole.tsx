import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'manager' | 'accountant' | 'employee' | null;

export const useUserRole = (user: User | null) => {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      console.log('🔐 [useUserRole] START - User:', user?.id || 'null', 'Email:', user?.email || 'null');
      
      if (!user) {
        console.log('🔐 [useUserRole] No user provided, setting role to null');
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        console.log('🔐 [useUserRole] Fetching role from user_roles table for user:', user.id);
        
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('🔴 [useUserRole] Error fetching role:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          });
          setRole(null);
        } else {
          console.log('✅ [useUserRole] Role fetched successfully:', data?.role);
          setRole(data?.role || null);
        }
      } catch (error) {
        console.error('🔴 [useUserRole] Unexpected error:', error);
        setRole(null);
      } finally {
        setLoading(false);
        console.log('🔐 [useUserRole] END - Loading complete');
      }
    };

    fetchUserRole();
  }, [user]);

  return { role, loading };
};