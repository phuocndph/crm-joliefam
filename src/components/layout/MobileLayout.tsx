import { useState, useEffect } from "react";
import { useQueryClient } from '@tanstack/react-query';
import type { User as AuthUser } from "@supabase/supabase-js";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions, type PermissionType } from "@/hooks/useEmployeePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Building2, LogOut, Settings, Bell, User, Key, Menu, Home, Users2, Package, ShoppingCart, FileText, CreditCard, BarChart3, Headphones, Truck, Scissors, Plus, FileSignature, Receipt, Wallet, BookOpen, Bot, Globe, Building, CircleDollarSign, Boxes, Factory, CalendarCheck2, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { cn } from "@/lib/utils";
import { isLocalBackend, isLocalDemoEnabled, localAdminUser } from "@/lib/runtime-config";
import { clearLocalSession, getLocalMe, hasStoredLocalUserSession, logoutLocal } from "@/lib/local-auth";

type MobileNavItem = { icon: LucideIcon; label: string; path: string; perm?: PermissionType; perms?: PermissionType[]; isMenu?: boolean; selfOnly?: boolean; accountOnly?: boolean; integrationAdmin?: boolean };

const MobileLayout = () => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [localWorkerId, setLocalWorkerId] = useState<string | null>(null);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    role: userRole,
    loading: roleLoading
  } = useUserRole(user);
  const { hasPermission, loading: permLoading } = useEmployeePermissions(user, userRole);
  useEffect(() => {
    if (isLocalBackend()) {
      let cancelled = false;
      if (!hasStoredLocalUserSession()) {
        setUser(isLocalDemoEnabled() ? localAdminUser as unknown as AuthUser : null);
        if (!isLocalDemoEnabled()) navigate('/auth', { replace: true });
        setLoading(false);
      } else {
        void getLocalMe()
          .then((me) => { if (cancelled) return; setLocalWorkerId(me.worker_id); setUser({
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
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      setLoading(false);
    };
    getUser();

    // Listen for auth changes
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
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
        description: "Hẹn gặp lại bạn!"
      });
      navigate("/auth");
    } catch (error: unknown) {
      toast({
        title: "Lỗi đăng xuất",
        description: error instanceof Error ? error.message : "Không thể đăng xuất.",
        variant: "destructive"
      });
    }
  };
  const getRoleDisplayName = (role: string | null) => {
    switch (role) {
      case 'admin':
        return 'Quản trị viên';
      case 'manager':
        return 'Quản lý';
      case 'accountant':
        return 'Kế toán';
      case 'employee':
        return 'Nhân viên';
      case 'team_leader':
        return 'Tổ trưởng';
      default:
        return 'Chưa phân quyền';
    }
  };
  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin':
        return 'destructive' as const;
      case 'manager':
        return 'default' as const;
      case 'accountant':
        return 'outline' as const;
      case 'employee':
        return 'secondary' as const;
      case 'team_leader':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  const isPrivileged = userRole === 'admin' || userRole === 'manager';
  const canSee = (item: MobileNavItem) => {
    if (item.integrationAdmin) return isLocalBackend() && hasStoredLocalUserSession() && userRole === 'admin' && user?.id !== 'local-admin';
    if (item.accountOnly) return isLocalBackend() && hasStoredLocalUserSession();
    if (item.selfOnly) return Boolean(localWorkerId);
    if (item.perms) return item.perms.some((permission) => hasPermission(permission));
    if (!item.perm) return isPrivileged;
    return hasPermission(item.perm);
  };

  // Navigation items for bottom tab bar (filtered by permission)
  const allBottomNav: MobileNavItem[] = [
    { icon: Users2, label: "Khách hàng", path: "/customers", perm: "customers" },
    { icon: Package, label: "Sản phẩm", path: "/products", perm: "products" },
    { icon: ShoppingCart, label: "Đơn hàng", path: "/orders", perm: "orders" },
    { icon: FileText, label: "Báo giá", path: "/quotes", perm: "quotes" },
    { icon: Wallet, label: "Giao dịch", path: "/transactions", perm: "transactions" },
  ];
  const bottomNavItems: MobileNavItem[] = [
    { icon: Home, label: "Trang chính", path: "/menu" },
    ...allBottomNav.filter(canSee).slice(0, 3),
    { icon: Menu, label: "Menu", path: "", isMenu: true },
  ];

  // Menu items for side drawer - grouped by category
  const menuGroups = [
    {
      title: "Kinh doanh",
      items: [
        { icon: Home, label: "Tổng quan", path: "/dashboard", perm: "dashboard" as PermissionType },
        { icon: Users2, label: "Khách hàng", path: "/customers", perm: "customers" as PermissionType },
        { icon: Package, label: "Sản phẩm", path: "/products", perm: "products" as PermissionType },
        { icon: ShoppingCart, label: "Đơn hàng", path: "/orders", perm: "orders" as PermissionType },
        { icon: FileText, label: "Báo giá", path: "/quotes", perm: "quotes" as PermissionType },
        { icon: Headphones, label: "Chăm sóc KH", path: "/customer-care", perm: "customer_care" as PermissionType },
      ],
    },
    {
      title: "Tài chính",
      items: [
        { icon: CreditCard, label: "Dòng tiền", path: "/cash-flow", perm: "cash_flow" as PermissionType },
        { icon: Wallet, label: "Giao dịch", path: "/transactions", perm: "transactions" as PermissionType },
        { icon: FileSignature, label: "Hợp đồng", path: "/contracts", perm: "contracts" as PermissionType },
        { icon: Receipt, label: "Hóa đơn điện tử", path: "/einvoices", perm: "contracts" as PermissionType },
        { icon: CircleDollarSign, label: "Chi phí & Giá thành", path: "/cost-management", perms: ["cost_transactions", "cost_categories", "cost_centers", "cost_objects", "transaction_types", "cost_audit"] as PermissionType[] },
      ],
    },
    {
      title: "Vận hành",
      items: [
        { icon: Truck, label: "Vận chuyển GHN", path: "/ghn-tracking", perm: "ghn_tracking" as PermissionType },
        { icon: Building, label: "Đơn vị vận chuyển", path: "/shipping-companies", perm: "shipping_companies" as PermissionType },
        { icon: Scissors, label: "Vải", path: "/fabrics", perm: "fabric_management" as PermissionType },
        { icon: Boxes, label: "Kho & vật tư", path: "/inventory-management", perm: "inventory_view" as PermissionType },
        { icon: Factory, label: "Lệnh sản xuất", path: "/production-orders", perm: "production_view" as PermissionType },
        { icon: CalendarCheck2, label: "Chấm công xưởng", path: "/production-attendance", perm: "production_view" as PermissionType },
        { icon: CalendarCheck2, label: "Công & thu nhập của tôi", path: "/my-attendance", selfOnly: true },
        { icon: User, label: "Hồ sơ của tôi", path: "/my-profile", accountOnly: true },
        { icon: WalletCards, label: "Thiết lập tiền lương", path: "/payroll-settings", perm: "payroll_view" as PermissionType },
        { icon: BarChart3, label: "Báo cáo", path: "/reports", perm: "reports" as PermissionType },
      ],
    },
    {
      title: "Hệ thống",
      items: [
        { icon: Globe, label: 'API & kết nối Agent', path: '/integration-access', integrationAdmin: true },
        { icon: Users2, label: "Quản lý người dùng", path: "/user-management", perm: "user_management" as PermissionType },
        { icon: User, label: "Duyệt hồ sơ nhân sự", path: "/profile-review", perm: "user_management" as PermissionType },
        { icon: BookOpen, label: "Tri thức", path: "/knowledge-base", perm: "knowledge_base" as PermissionType },
        { icon: Bot, label: "Cài đặt AI", path: "/ai-settings" },
        { icon: Globe, label: "Thu thập dữ liệu web", path: "/web-scraper" },
      ],
    },
  ]
    .map(g => ({ ...g, items: g.items.filter(canSee) }))
    .filter(g => g.items.length > 0);
  if (loading || roleLoading || permLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>;
  }
  const isActive = (path: string) => location.pathname === path;
  return <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="h-14 border-b bg-card shadow-soft flex items-center justify-between sticky top-0 z-40 px-[15px] mx-0 py-[5px] my-[20px]">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-gradient-primary rounded-lg">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">CRM Joliefam</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Bell className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowChangePasswordDialog(true)}>
            <Key className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20 min-h-[calc(100vh-3.5rem)]">
        <div className="p-4">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50">
        <div className="flex items-center justify-around px-2 py-2">
          {bottomNavItems.map((item, index) => item.isMenu ? <Sheet key={index} open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className={cn("flex flex-col items-center gap-1 h-12 px-3 rounded-lg", "hover:bg-sidebar-accent")}>
                    <item.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh]">
                  <div className="mt-6 space-y-4">
                    {/* User Info */}
                    <div className="flex items-center gap-3 p-4 bg-gradient-card rounded-lg">
                      <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {user?.user_metadata?.first_name || "Quản trị viên"} {user?.user_metadata?.last_name || "Người dùng"}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{user?.email}</p>
                          <Badge variant={getRoleBadgeVariant(userRole)} className="text-xs">
                            {getRoleDisplayName(userRole)}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items - Grouped & scrollable */}
                    <div className="space-y-4 overflow-y-auto max-h-[calc(80vh-10rem)] pr-1">
                      {menuGroups.map((group, gi) => (
                        <div key={gi} className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
                            {group.title}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {group.items.map((menuItem, idx) => (
                              <Button
                                key={idx}
                                variant="ghost"
                                className={cn(
                                  "justify-start h-11 px-3 text-sm",
                                  isActive(menuItem.path) && "bg-sidebar-accent text-sidebar-accent-foreground"
                                )}
                                onClick={() => {
                                  navigate(menuItem.path);
                                  setIsMenuOpen(false);
                                }}
                              >
                                <menuItem.icon className="h-4 w-4 mr-2 shrink-0" />
                                <span className="truncate">{menuItem.label}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="pt-4 border-t">
                        <Button variant="outline" className="w-full justify-start h-12 px-4" onClick={handleSignOut}>
                          <LogOut className="h-5 w-5 mr-3" />
                          Đăng xuất
                        </Button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet> : <Button key={index} variant="ghost" size="sm" className={cn("flex flex-col items-center gap-1 h-12 px-3 rounded-lg", isActive(item.path) && "bg-sidebar-accent text-sidebar-accent-foreground", "hover:bg-sidebar-accent")} onClick={() => navigate(item.path)}>
                <item.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>)}
        </div>
      </nav>

      <ChangePasswordDialog open={showChangePasswordDialog} onOpenChange={setShowChangePasswordDialog} />
    </div>;
};
export default MobileLayout;
