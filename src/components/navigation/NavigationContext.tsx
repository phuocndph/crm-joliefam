import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PermissionType } from '@/hooks/useEmployeePermissions';
import { useNavigationFavorites } from '@/hooks/useNavigationFavorites';
import { hasLocalUserSession } from '@/lib/local-auth';
import { isLocalBackend } from '@/lib/runtime-config';
import { visibleNavigationItems, type NavigationItem } from '@/lib/navigation-catalog';

type NavigationContextValue = ReturnType<typeof useNavigationFavorites> & {
  visibleItems: readonly NavigationItem[];
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

type Props = {
  actorId: string | null | undefined;
  role: string | null;
  hasPermission: (permission: PermissionType) => boolean;
  accessResolved: boolean;
  children: ReactNode;
};

/** Shares one visibility and pin state between every navigation surface in a layout. */
export function NavigationProvider({ actorId, role, hasPermission, accessResolved, children }: Props) {
  const localBackend = isLocalBackend();
  // Stored local tokens can be stale. Only a validated in-memory session unlocks
  // self-service, production exception, and integration-only entries.
  const hasLocalSession = localBackend && hasLocalUserSession();
  const visibleItems = useMemo(() => visibleNavigationItems({
    actorId,
    role,
    isLocalBackend: localBackend,
    hasLocalSession,
    hasPermission,
  }), [actorId, hasLocalSession, hasPermission, localBackend, role]);
  const favorites = useNavigationFavorites({
    actorId,
    isLocalBackend: localBackend,
    visibleItems,
    accessResolved,
  });
  const value = useMemo(() => ({ ...favorites, visibleItems }), [favorites, visibleItems]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be rendered inside NavigationProvider.');
  return value;
}
