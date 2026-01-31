import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building2,
  LogOut,
  Settings,
  Bell,
  User,
  Key
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";

const MainLayout = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const { role: userRole, loading: roleLoading } = useUserRole(user);

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Use window.location for navigation safety during HMR/context loss
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
        description: "Hẹn gặp lại bạn!",
      });
      // Use window.location for navigation safety
      window.location.assign("/auth");
    } catch (error: any) {
      toast({
        title: "Lỗi đăng xuất",
        description: error.message,
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
      default: return 'Chưa phân quyền';
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin': return 'destructive' as const;
      case 'manager': return 'default' as const;
      case 'accountant': return 'outline' as const;
      case 'employee': return 'secondary' as const;
      default: return 'outline' as const;
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar */}
        <AppSidebar />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-16 border-b bg-card shadow-soft flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-sidebar-accent" />
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-primary rounded-lg">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">CRM Pro</h1>
                  <p className="text-xs text-muted-foreground">Hệ thống quản lý khách hàng</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="hover:bg-sidebar-accent">
                <Bell className="h-5 w-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="hover:bg-sidebar-accent"
                onClick={() => setShowChangePasswordDialog(true)}
                title="Đổi mật khẩu"
              >
                <Key className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="hover:bg-sidebar-accent">
                <Settings className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center gap-3 pl-4 border-l">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-right">
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
                
                <Button variant="outline" size="sm" onClick={handleSignOut} className="ml-2">
                  <LogOut className="h-4 w-4 mr-2" />
                  Đăng xuất
                </Button>
              </div>
            </div>
          </header>
          
          {/* Page Content */}
          <main className="flex-1 p-6 bg-gradient-card">
            <Outlet />
          </main>
        </div>
      </div>
      
      <ChangePasswordDialog 
        open={showChangePasswordDialog} 
        onOpenChange={setShowChangePasswordDialog}
      />
    </SidebarProvider>
  );
};

export default MainLayout;