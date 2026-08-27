import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'manager' | 'accountant' | 'employee' | null;

export const useUserRole = (user: User | null) => {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [roleReady, setRoleReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setRoleReady(false);

    const fetchUserRole = async (attempt = 0): Promise<void> => {
      console.log('🔐 [useUserRole] START - User:', user?.id || 'null', 'Email:', user?.email || 'null');
      
      if (!user) {
        console.log('🔐 [useUserRole] No user provided, setting role to null');
        if (!cancelled) {
          setRole(null);
          setLoading(false);
          setRoleReady(true);
        }
        return;
      }

      try {
        console.log('🔐 [useUserRole] Fetching role from user_roles table for user:', user.id);
        
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('🔴 [useUserRole] Error fetching role:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          });
          if (!cancelled) setRole(null);
        } else {
          console.log('✅ [useUserRole] Role fetched successfully:', data?.role);
          if (!cancelled) setRole((data?.role as UserRole) || null);
        }
      } catch (error) {
        console.error('🔴 [useUserRole] Unexpected error:', error);
        // Retry once after short delay to handle session-restore race ("TypeError: Load failed")
        if (attempt === 0 && !cancelled) {
          await new Promise((r) => setTimeout(r, 300));
          return fetchUserRole(1);
        }
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRoleReady(true);
        }
        console.log('🔐 [useUserRole] END - Loading complete');
      }
    };

    fetchUserRole();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { role, loading, roleReady };
};
