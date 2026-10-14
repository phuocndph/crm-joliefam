import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import { isLocalBackend, isLocalDemoEnabled, localAdminUser } from '@/lib/runtime-config';
import { hasStoredLocalUserSession, getLocalMe } from '@/lib/local-auth';

/** Tạo object User giả lập cho chế độ local từ thông tin tài khoản thật. */
const localUserFromMe = (me: { user_id: string; email: string; first_name: string | null; last_name: string | null }): User => ({
  id: me.user_id,
  email: me.email,
  user_metadata: { first_name: me.first_name ?? '', last_name: me.last_name ?? '' },
} as unknown as User);

/**
 * Khôi phục phiên trước khi query dữ liệu.
 * Local: nếu có phiên người dùng (đăng nhập email/mật khẩu) trả về user thật;
 * nếu không dùng tài khoản dịch vụ local-admin như trước để UI admin chạy.
 */
export const useAuthReady = () => {
  const localMode = isLocalBackend();
  const [user, setUser] = useState<User | null>(isLocalDemoEnabled() && !hasStoredLocalUserSession() ? localAdminUser as unknown as User : null);
  const [isReady, setIsReady] = useState(localMode ? !hasStoredLocalUserSession() : false);

  useEffect(() => {
    if (localMode) {
      let cancelled = false;
      if (hasStoredLocalUserSession()) {
        getLocalMe()
          .then((me) => { if (!cancelled) setUser(localUserFromMe(me)); })
          .catch(() => { if (!cancelled) setUser(null); })
          .finally(() => { if (!cancelled) setIsReady(true); });
      } else {
        setUser(isLocalDemoEnabled() ? localAdminUser as unknown as User : null);
        setIsReady(true);
      }
      return () => { cancelled = true; };
    }
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setIsReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [localMode]);

  return { user, isReady };
};
