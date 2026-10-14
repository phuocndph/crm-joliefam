import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { isLocalBackend, isLocalDemoEnabled } from '@/lib/runtime-config';
import { hasStoredLocalUserSession, getLocalMe } from '@/lib/local-auth';

export type UserRole = 'admin' | 'manager' | 'accountant' | 'employee' | 'team_leader' | null;

export const useUserRole = (user: User | null) => {
  const localMode = isLocalBackend();
  const hasUserSession = localMode && hasStoredLocalUserSession();
  const [role, setRole] = useState<UserRole>(isLocalDemoEnabled() && !hasUserSession ? 'admin' : null);
  const [loading, setLoading] = useState(hasUserSession);
  const [roleReady, setRoleReady] = useState(localMode && !hasUserSession);

  useEffect(() => {
    if (localMode) {
      let cancelled = false;
      if (hasStoredLocalUserSession()) {
        setLoading(true);
        setRoleReady(false);
        getLocalMe()
          .then((me) => { if (!cancelled) setRole((me.role as UserRole) || null); })
          .catch(() => { if (!cancelled) setRole(null); })
          .finally(() => { if (!cancelled) { setLoading(false); setRoleReady(true); } });
      } else {
        setRole(isLocalDemoEnabled() ? 'admin' : null);
        setLoading(false);
        setRoleReady(true);
      }
      return () => { cancelled = true; };
    }
    let cancelled = false;

    setLoading(true);
    setRoleReady(false);

    const fetchUserRole = async (attempt = 0): Promise<void> => {
      if (!user) {
        if (!cancelled) { setRole(null); setLoading(false); setRoleReady(true); }
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) { if (!cancelled) setRole(null); }
        else if (!cancelled) setRole((data?.role as UserRole) || null);
      } catch (error) {
        if (attempt === 0 && !cancelled) {
          await new Promise((r) => setTimeout(r, 300));
          return fetchUserRole(1);
        }
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) { setLoading(false); setRoleReady(true); }
      }
    };

    fetchUserRole();
    return () => { cancelled = true; };
  }, [localMode, user]);

  return { role, loading, roleReady };
};
