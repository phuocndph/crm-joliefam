import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { captureLocalAuthGuard, getLocalMe, getLocalUserSession, type LocalAuthGuard } from '@/lib/local-auth';
import { isLocalBackend } from '@/lib/runtime-config';
import { LocalCreateGHNOrderDialog } from './LocalCreateGHNOrderDialog';
import type { CreateGHNOrderDialogProps } from './CreateGHNOrderDialog';

type Draft = Pick<CreateGHNOrderDialogProps, 'order' | 'remainingAmount'>;
const Context = createContext<((draft?: Draft) => Promise<void>) | null>(null);
export const LOCAL_GHN_CREATED_EVENT = 'crm-local-ghn-created';

/** Lives above responsive layouts. Drafts stay in memory, never in browser storage. */
export function LocalGhnCreateHostProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const guard = useRef<LocalAuthGuard | null>(null);
  const generation = useRef(0), currentPath = useRef(pathname);
  currentPath.current = pathname;
  const clear = useCallback(() => { generation.current++; guard.current = null; setDraft(null); }, []);
  const show = useCallback(async (next: Draft = {}) => {
    if (!isLocalBackend() || currentPath.current !== '/orders') return;
    const token = ++generation.current;
    const auth = await captureLocalAuthGuard(getLocalUserSession()?.actor || 'local-admin');
    await getLocalMe();
    if (token !== generation.current || currentPath.current !== '/orders') return;
    auth.assertCurrent(); guard.current = auth; setDraft(next);
  }, []);
  useLayoutEffect(() => { if (pathname !== '/orders') clear(); }, [pathname, clear]);
  useLayoutEffect(() => {
    if (!draft) return;
    const check = () => { try { guard.current?.assertCurrent(); } catch { clear(); } };
    const timer = window.setInterval(check, 500);
    window.addEventListener('storage', check); window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', check); window.removeEventListener('focus', check); };
  }, [draft, clear]);
  return <Context.Provider value={show}>{children}{isLocalBackend() && draft && guard.current && <LocalCreateGHNOrderDialog {...draft} authGuard={guard.current} open onOpenChange={value => { if (!value) clear(); }} onSuccess={() => {
    try { guard.current?.assertCurrent(); window.dispatchEvent(new Event(LOCAL_GHN_CREATED_EVENT)); } catch { clear(); }
  }} />}</Context.Provider>;
}
export const useLocalGhnCreateHost = () => useContext(Context);
