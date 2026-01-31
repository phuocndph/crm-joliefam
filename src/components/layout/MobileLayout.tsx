import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Building2, LogOut, Settings, Bell, User, Key, Menu, Home, Users2, Package, ShoppingCart, FileText, CreditCard, BarChart3, Headphones, Truck, Scissors, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { cn } from "@/lib/utils";

const MobileLayout = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { role: userRole, loading: roleLoading } = useUserRole(user);

  // Safe navigation function using window.location
  const safeNavigate = useCallback((path: string) => {
    window.location.assign(path);
  }, []);

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.assign("/auth");
        return;
      }
      setUser(session.user);
      setLoading(false);
    };
    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.assign("/auth");
      } else if (session) {
        setUser(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Đăng xuất thành công",
        description: "Hẹn gặp lại bạn!"
      });
      window.location.assign("/auth");
    } catch (error: any) {
      toast({
        title: "Lỗi đăng xuất",
        description: error.message,
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
      default:
        return 'outline' as const;
    }
  };

  // Navigation items for bottom tab bar
  const bottomNavItems = [{
    icon: Home,
    label: "Dashboard",
    path: "/dashboard"
  }, {
    icon: Users2,
    label: "Khách hàng",
    path: "/customers"
  }, {
    icon: Package,
    label: "Sản phẩm",
    path: "/products"
  }, {
    icon: ShoppingCart,
    label: "Đơn hàng",
    path: "/orders"
  }, {
    icon: Menu,
    label: "Menu",
    path: "",
    isMenu: true
  }];

  // Menu items for side drawer
  const menuItems = [{
    icon: FileText,
    label: "Báo giá",
    path: "/quotes"
  }, {
    icon: CreditCard,
    label: "Dòng tiền",
    path: "/cash-flow"
  }, {
    icon: BarChart3,
    label: "Báo cáo",
    path: "/reports"
  }, {
    icon: Headphones,
    label: "Chăm sóc KH",
    path: "/customer-care"
  }, {
    icon: Truck,
    label: "Vận chuyển",
    path: "/ghn-tracking"
  }, {
    icon: Scissors,
    label: "Vải",
    path: "/fabrics"
  }, {
    icon: Users2,
    label: "Quản lý user",
    path: "/user-management"
  }, {
    icon: CreditCard,
    label: "Giao dịch",
    path: "/transactions"
  }];
  if (loading || roleLoading) {
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

                    {/* Menu Items */}
                    <div className="space-y-2">
                      {menuItems.map((menuItem, idx) => <Button key={idx} variant="ghost" className={cn("w-full justify-start h-12 px-4", isActive(menuItem.path) && "bg-sidebar-accent text-sidebar-accent-foreground")} onClick={() => {
                  safeNavigate(menuItem.path);
                  setIsMenuOpen(false);
                }}>
                          <menuItem.icon className="h-5 w-5 mr-3" />
                          {menuItem.label}
                        </Button>)}
                      
                      <div className="pt-4 border-t">
                        <Button variant="outline" className="w-full justify-start h-12 px-4" onClick={handleSignOut}>
                          <LogOut className="h-5 w-5 mr-3" />
                          Đăng xuất
                        </Button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet> : <Button key={index} variant="ghost" size="sm" className={cn("flex flex-col items-center gap-1 h-12 px-3 rounded-lg", isActive(item.path) && "bg-sidebar-accent text-sidebar-accent-foreground", "hover:bg-sidebar-accent")} onClick={() => safeNavigate(item.path)}>
                <item.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>)}
        </div>
      </nav>

      {/* Floating Action Button for Quick Actions */}
      <Button size="icon" className="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg z-40" onClick={() => {
        // Quick action menu - could expand this
        safeNavigate("/customers?new=true");
      }}>
        <Plus className="h-6 w-6" />
      </Button>
      
      <ChangePasswordDialog open={showChangePasswordDialog} onOpenChange={setShowChangePasswordDialog} />
    </div>;
};
export default MobileLayout;