import { useState, useEffect } from "react";
import { useQueryClient } from '@tanstack/react-query';
import type { User as AuthUser } from "@supabase/supabase-js";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, LogOut, User, Key } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { isLocalBackend, isLocalDemoEnabled, localAdminUser } from "@/lib/runtime-config";
import { clearLocalSession, getLocalMe, hasStoredLocalUserSession, logoutLocal } from "@/lib/local-auth";
import { NavigationSearch } from "@/components/navigation/NavigationSearch";
import { NavigationProvider, useNavigation } from "@/components/navigation/NavigationContext";

function DesktopNavigationSearch({ pathname }: { pathname: string }) {
  const { visibleItems, favoriteIds, toggleFavorite } = useNavigation();
  return <NavigationSearch items={visibleItems} pathname={pathname} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} responsiveCompact />;
}

const MainLayout = () => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
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
          .then((me) => { if (!cancelled) setUser({
            ...localAdminUser,
            id: me.user_id,
            email: me.email,
            user_metadata: { first_name: me.first_name ?? '', last_name: me.last_name ?? '' },
          } as unknown as AuthUser); })
          .catch(() => { if (!cancelled) { setUser(null); navigate("/auth", { replace: true }); } })
          .finally(() => { if (!cancelled) setLoading(false); });
      }
      return () => { cancelled = true; };
    }
    // Get current user
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      setLoading(false);
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        navigate("/auth");
      } else if (session) {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    if (isLocalBackend()) {
      // Đăng xuất được cả tài khoản người dùng và tài khoản quản trị demo.
      // Phiên quản trị loopback chỉ nằm trong bộ nhớ nên cần xóa riêng.
      await logoutLocal();
      queryClient.clear();
      clearLocalSession();
      toast({ title: "Đăng xuất thành công", description: "Bạn đã thoát khỏi hệ thống local." });
      navigate("/auth", { replace: true });
      return;
    }
    try {
      await supabase.auth.signOut();
      toast({
        title: "Đăng xuất thành công",
        description: "Hẹn gặp lại bạn!",
      });
      navigate("/auth");
    } catch (error: unknown) {
      toast({
        title: "Lỗi đăng xuất",
        description: error instanceof Error ? error.message : "Không thể đăng xuất.",
        variant: "destructive",
      });
    }
  };

  const getRoleDisplayName = (role: string | null) => {
    switch (role) {
      case 'admin': return 'Quản trị viên';
      case 'manager': return 'Quản lý';
      case 'accountant': return 'Kế toán';
      case 'employee': return 'Nhân viên';
      case 'team_leader': return 'Tổ trưởng';
      default: return 'Chưa phân quyền';
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin': return 'destructive' as const;
      case 'manager': return 'default' as const;
      case 'accountant': return 'outline' as const;
      case 'employee': return 'secondary' as const;
      case 'team_leader': return 'secondary' as const;
      default: return 'outline' as const;
    }
  };

  if (loading || roleLoading || permissionsLoading) return <NavigationProvider actorId={user?.id} role={userRole} hasPermission={hasPermission} accessResolved={permissionDataResolved}>
    <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Đang tải quyền truy cập...</div></div>
  </NavigationProvider>;

  return (
    <NavigationProvider actorId={user?.id} role={userRole} hasPermission={hasPermission} accessResolved={permissionDataResolved}>
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar */}
        <AppSidebar />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          {/* Header */}
          <header className="h-16 min-w-0 border-b bg-card shadow-soft flex items-center justify-between gap-2 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <SidebarTrigger className="hover:bg-sidebar-accent" />
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-primary rounded-lg">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div className="hidden min-w-0 sm:block">
                  <h1 className="text-xl font-bold text-foreground">CRM Pro</h1>
                  <p className="text-xs text-muted-foreground">Hệ thống quản lý khách hàng</p>
                </div>
              </div>
            </div>
            
            <div className="flex shrink-0 items-center gap-1 sm:gap-2 xl:gap-4">
              <div className="hidden md:block lg:w-56 xl:w-72"><DesktopNavigationSearch pathname={location.pathname} /></div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="hover:bg-sidebar-accent"
                onClick={() => setShowChangePasswordDialog(true)}
                title="Đổi mật khẩu"
              >
                <Key className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center gap-2 border-l pl-2 xl:gap-3 xl:pl-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="hidden text-right xl:block">
                    <p className="text-sm font-medium text-foreground">
                      {user?.user_metadata?.first_name || "Admin"} {user?.user_metadata?.last_name || "User"}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      <Badge variant={getRoleBadgeVariant(userRole)} className="text-xs">
                        {getRoleDisplayName(userRole)}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <Button variant="outline" size="sm" onClick={handleSignOut} className="ml-1 px-2 xl:ml-2 xl:px-3" aria-label="Đăng xuất">
                  <LogOut className="h-4 w-4 xl:mr-2" />
                  <span className="hidden xl:inline">Đăng xuất</span>
                </Button>
              </div>
            </div>
          </header>
          
          {/* Page Content */}
          <main className="min-w-0 flex-1 overflow-x-hidden bg-gradient-card p-3 sm:p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      
      <ChangePasswordDialog 
        open={showChangePasswordDialog} 
        onOpenChange={setShowChangePasswordDialog}
      />
    </SidebarProvider>
    </NavigationProvider>
  );
};

export default MainLayout;
