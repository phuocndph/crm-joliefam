import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { isLocalBackend, isLocalDemoEnabled } from '@/lib/runtime-config';
import { hasStoredLocalUserSession, getLocalMe, captureLocalAuthGuard, type LocalAuthGuard } from '@/lib/local-auth';
import { listenPermissionRefresh } from '@/lib/permission-refresh';

export type UserRole = 'admin' | 'manager' | 'accountant' | 'employee' | 'team_leader' | null;

export const useUserRole = (user: User | null) => {
  const localMode = isLocalBackend();
  const userId = user?.id;
  const hasUserSession = localMode && hasStoredLocalUserSession();
  const [role, setRole] = useState<UserRole>(isLocalDemoEnabled() && !hasUserSession ? 'admin' : null);
  const [loading, setLoading] = useState(hasUserSession);
  const [roleReady, setRoleReady] = useState(localMode && !hasUserSession);
  const [revision, setRevision] = useState(0);
  const [resolvedUser, setResolvedUser] = useState<string | null>(null);
  const authorization = useRef<{userId: string; guard: LocalAuthGuard} | null>(null);
  const hardRefresh = useRef(true);
  const refreshGeneration = useRef(0);
  useEffect(() => listenPermissionRefresh(reason => {
    refreshGeneration.current++;
    if (reason === 'permissions-changed' || !localMode) {
      hardRefresh.current = true;
      authorization.current = null;
      setRole(null); setRoleReady(false); setLoading(true);
    }
    setRevision(value => value + 1);
  }), [localMode]);

  useEffect(() => {
    if (localMode) {
      let cancelled = false;
      const request = refreshGeneration.current;
      const current = () => !cancelled && request === refreshGeneration.current;
      if (hasStoredLocalUserSession()) {
        let retain = !hardRefresh.current && authorization.current?.userId === userId;
        try { authorization.current?.guard.assertCurrent(); } catch { retain = false; }
        if (!retain) { setLoading(true); setRoleReady(false); setRole(null); }
        const fetchRole = async () => {
          if (!userId) throw new Error('Chưa xác định tài khoản đăng nhập.');
          const guard = await captureLocalAuthGuard(userId);
          const me = await getLocalMe(revision > 0);
          guard.assertCurrent();
          if (me.user_id !== userId) throw new Error('Phiên đăng nhập đã thay đổi.');
          if (current()) { authorization.current = {userId, guard}; hardRefresh.current = false; setRole((me.role as UserRole) || null); setResolvedUser(userId); }
        };
        void fetchRole()
          .catch(() => { if (current()) { authorization.current = null; hardRefresh.current = true; setRole(null); setResolvedUser(userId || null); } })
          .finally(() => { if (current()) { setLoading(false); setRoleReady(true); } });
      } else {
        authorization.current = null; hardRefresh.current = true;
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
      if (!userId) {
        if (!cancelled) { setRole(null); setResolvedUser(null); setLoading(false); setRoleReady(true); }
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) { if (!cancelled) { setRole(null); setResolvedUser(userId); } }
        else if (!cancelled) { setRole((data?.role as UserRole) || null); setResolvedUser(userId); }
      } catch (error) {
        if (attempt === 0 && !cancelled) {
          await new Promise((r) => setTimeout(r, 300));
          return fetchUserRole(1);
        }
        if (!cancelled) { setRole(null); setResolvedUser(userId); }
      } finally {
        if (!cancelled) { setLoading(false); setRoleReady(true); }
      }
    };

    fetchUserRole();
    return () => { cancelled = true; };
  }, [localMode, userId, revision]);

  const identityReady = localMode && !hasUserSession || resolvedUser === (user?.id || null);
  return { role: identityReady ? role : null, loading: loading || !identityReady, roleReady: roleReady && identityReady };
};
