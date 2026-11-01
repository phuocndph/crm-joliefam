import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User as AuthUser } from '@supabase/supabase-js';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Building2, Key, LogOut, Menu, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useEmployeePermissions } from '@/hooks/useEmployeePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import { cn } from '@/lib/utils';
import { isLocalBackend, isLocalDemoEnabled, localAdminUser } from '@/lib/runtime-config';
import { clearLocalSession, getLocalMe, hasStoredLocalUserSession, logoutLocal } from '@/lib/local-auth';
import {
  NAVIGATION_GROUPS,
  defaultBottomNavigationItems,
  navigationItemsByGroup,
  navigationItemsInSection,
} from '@/lib/navigation-catalog';
import { NavigationItemRow } from '@/components/navigation/NavigationItemRow';
import { MobileNavigationGroup } from '@/components/navigation/MobileNavigationGroup';
import { NavigationSearch } from '@/components/navigation/NavigationSearch';
import { NavigationProvider, useNavigation } from '@/components/navigation/NavigationContext';

const roleDisplayName = (role: string | null) => {
  switch (role) {
    case 'admin': return 'Quản trị viên';
    case 'manager': return 'Quản lý';
    case 'accountant': return 'Kế toán';
    case 'employee': return 'Nhân viên';
    case 'team_leader': return 'Tổ trưởng';
    default: return 'Chưa phân quyền';
  }
};

const roleBadgeVariant = (role: string | null) => {
  switch (role) {
    case 'admin': return 'destructive' as const;
    case 'manager': return 'default' as const;
    case 'accountant': return 'outline' as const;
    case 'employee':
    case 'team_leader': return 'secondary' as const;
    default: return 'outline' as const;
  }
};

type MobileNavigationShellProps = {
  user: AuthUser | null;
  role: string | null;
  onChangePassword: () => void;
  onSignOut: () => Promise<void>;
};

export function MobileNavigationChrome({ user, role, onChangePassword, onSignOut }: MobileNavigationShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { visibleItems, favoriteIds, visibleFavoriteItems, toggleFavorite } = useNavigation();
  const topItems = navigationItemsInSection(visibleItems, 'top');
  const accountItems = navigationItemsInSection(visibleItems, 'account');
  const bottomItems = useMemo(() => defaultBottomNavigationItems(visibleItems, favoriteIds, role), [favoriteIds, role, visibleItems]);
  const active = (path: string) => location.pathname === path;
  const closeMenu = () => setIsMenuOpen(false);

  return <>
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card px-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-2">
        <div className="rounded-lg bg-gradient-primary p-1.5"><Building2 className="h-5 w-5 text-white" /></div>
        <h1 className="truncate text-base font-bold text-foreground">CRM Joliefam</h1>
      </div>
      <div className="flex items-center gap-1">
        <NavigationSearch compact items={visibleItems} pathname={location.pathname} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} />
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onChangePassword} title="Đổi mật khẩu" aria-label="Đổi mật khẩu"><Key className="h-4 w-4" /></Button>
      </div>
    </header>


    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-card" aria-label="Điều hướng nhanh">
      <div className="flex items-center justify-around gap-1 px-1 py-2">
        <Button variant="ghost" size="sm" className={cn('flex h-12 min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1', active('/menu') && 'bg-sidebar-accent text-sidebar-accent-foreground')} onClick={() => navigate('/menu')}>
          <Building2 className="h-5 w-5" /><span className="max-w-full truncate text-xs font-medium">Trang chính</span>
        </Button>
        {bottomItems.map(item => <Button key={item.id} variant="ghost" size="sm" className={cn('flex h-12 min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1', active(item.path) && 'bg-sidebar-accent text-sidebar-accent-foreground')} onClick={() => navigate(item.path)} title={item.label}>
          <item.icon className="h-5 w-5 shrink-0" /><span className="max-w-full truncate text-xs font-medium">{item.label}</span>
        </Button>)}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="flex h-12 min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1" aria-label="Mở menu"><Menu className="h-5 w-5" /><span className="text-xs font-medium">Menu</span></Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-hidden p-4">
            <div className="flex h-full min-h-0 flex-col gap-3 pt-5">
              <SheetHeader><SheetTitle>Menu chức năng</SheetTitle></SheetHeader>
              <div className="flex items-center gap-3 rounded-lg bg-gradient-card p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary"><User className="h-5 w-5 text-white" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.user_metadata?.first_name || 'Quản trị viên'} {user?.user_metadata?.last_name || 'Người dùng'}</p><div className="flex min-w-0 items-center gap-2"><p className="truncate text-xs text-muted-foreground">{user?.email}</p><Badge variant={roleBadgeVariant(role)} className="shrink-0 text-xs">{roleDisplayName(role)}</Badge></div></div>
              </div>
              <NavigationSearch items={visibleItems} pathname={location.pathname} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onNavigate={closeMenu} enableShortcut={false} />
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {topItems.length > 0 && <section className="space-y-1"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Truy cập nhanh</p>{topItems.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} onNavigate={closeMenu} />)}</section>}
                {visibleFavoriteItems.length > 0 && <section className="space-y-1 border-y py-2"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Đã ghim</p>{visibleFavoriteItems.map(item => <NavigationItemRow key={`pin-${item.id}`} item={item} active={active(item.path)} favorite onToggleFavorite={toggleFavorite} onNavigate={closeMenu} />)}</section>}
                {NAVIGATION_GROUPS.map(group => {
                  const items = navigationItemsByGroup(visibleItems, group.id);
                  return items.length ? <MobileNavigationGroup key={group.id} group={group} items={items} pathname={location.pathname} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onNavigate={closeMenu} /> : null;
                })}
                {accountItems.length > 0 && <section className="space-y-1 border-t pt-2"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tài khoản</p>{accountItems.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} onNavigate={closeMenu} />)}</section>}
                <Button variant="outline" className="mb-1 w-full justify-start" onClick={() => void onSignOut()}><LogOut className="mr-2 h-4 w-4" />Đăng xuất</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  </>;
}

const MobileLayout = () => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const navigate = useNavigate();
  const { role: userRole, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permissionsLoading, permissionDataResolved } = useEmployeePermissions(user, userRole);

  useEffect(() => {
    if (isLocalBackend()) {
      let cancelled = false;
      if (!hasStoredLocalUserSession()) {
        setUser(isLocalDemoEnabled() ? localAdminUser as unknown as AuthUser : null);
        if (!isLocalDemoEnabled()) navigate('/auth', { replace: true });
        setLoading(false);
      } else {
        void getLocalMe()
          .then(me => { if (!cancelled) setUser({ ...localAdminUser, id: me.user_id, email: me.email, user_metadata: { first_name: me.first_name ?? '', last_name: me.last_name ?? '' } } as unknown as AuthUser); })
          .catch(() => { if (!cancelled) { setUser(null); navigate('/auth', { replace: true }); } })
          .finally(() => { if (!cancelled) setLoading(false); });
      }
      return () => { cancelled = true; };
    }
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/auth'); return; }
      setUser(session.user);
      setLoading(false);
    };
    void getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) navigate('/auth');
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    if (isLocalBackend()) {
      await logoutLocal();
      queryClient.clear();
      clearLocalSession();
      toast({ title: 'Đăng xuất thành công', description: 'Bạn đã thoát khỏi hệ thống local.' });
      navigate('/auth', { replace: true });
      return;
    }
    try {
      await supabase.auth.signOut();
      toast({ title: 'Đăng xuất thành công', description: 'Hẹn gặp lại bạn!' });
      navigate('/auth');
    } catch (error: unknown) {
      toast({ title: 'Lỗi đăng xuất', description: error instanceof Error ? error.message : 'Không thể đăng xuất.', variant: 'destructive' });
    }
  };

  if (loading || roleLoading || permissionsLoading) return <NavigationProvider actorId={user?.id} role={userRole} hasPermission={hasPermission} accessResolved={permissionDataResolved}>
    <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Đang tải quyền truy cập...</div></div>
  </NavigationProvider>;

  return <NavigationProvider actorId={user?.id} role={userRole} hasPermission={hasPermission} accessResolved={permissionDataResolved}>
    <MobileNavigationChrome user={user} role={userRole} onChangePassword={() => setShowChangePasswordDialog(true)} onSignOut={handleSignOut} />
    <main className="min-h-[calc(100vh-3.5rem)] pb-20"><div className="p-4"><Outlet /></div></main>
    <ChangePasswordDialog open={showChangePasswordDialog} onOpenChange={setShowChangePasswordDialog} />
  </NavigationProvider>;
};

export default MobileLayout;
