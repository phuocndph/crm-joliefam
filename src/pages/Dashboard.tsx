import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  TrendingUp, 
  DollarSign, 
  Activity,
  Building2,
  LogOut,
  Settings,
  UserPlus,
  FileText,
  BarChart3,
  Calendar,
  Bell,
  Shield
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { role: userRole, loading: roleLoading } = useUserRole(user);

  useEffect(() => {
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
    try {
      await supabase.auth.signOut();
      toast({
        title: "Đăng xuất thành công",
        description: "Hẹn gặp lại bạn!",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Lỗi đăng xuất",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  const stats = [
    {
      title: "Tổng khách hàng",
      value: "2,345",
      change: "+12%",
      changeType: "positive",
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "Doanh thu tháng",
      value: "₫125.4M",
      change: "+8%",
      changeType: "positive",
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10"
    },
    {
      title: "Tỷ lệ chuyển đổi",
      value: "23.5%",
      change: "+3%",
      changeType: "positive",
      icon: TrendingUp,
      color: "text-accent",
      bgColor: "bg-accent/10"
    },
    {
      title: "Hoạt động hôm nay",
      value: "157",
      change: "-2%",
      changeType: "negative",
      icon: Activity,
      color: "text-warning",
      bgColor: "bg-warning/10"
    }
  ];

  const quickActions = [
    {
      title: "Thêm khách hàng",
      description: "Tạo hồ sơ khách hàng mới",
      icon: UserPlus,
      color: "bg-primary",
      action: () => navigate("/customers/new")
    },
    {
      title: "Tạo báo cáo",
      description: "Xuất báo cáo doanh số",
      icon: FileText,
      color: "bg-success",
      action: () => navigate("/reports")
    },
    {
      title: "Xem thống kê",
      description: "Phân tích dữ liệu kinh doanh",
      icon: BarChart3,
      color: "bg-accent",
      action: () => navigate("/analytics")
    },
    {
      title: "Lịch hẹn",
      description: "Quản lý cuộc hẹn",
      icon: Calendar,
      color: "bg-warning",
      action: () => navigate("/appointments")
    }
  ];

  const adminActions = [
    {
      title: "Quản lý người dùng",
      description: "Quản lý tài khoản và phân quyền",
      icon: Shield,
      color: "bg-purple-500",
      action: () => navigate("/user-management"),
      roles: ['admin', 'manager']
    }
  ];

  const getRoleDisplayName = (role: string | null) => {
    switch (role) {
      case 'admin': return 'Quản trị viên';
      case 'manager': return 'Quản lý';
      case 'employee': return 'Nhân viên';
      default: return 'Chưa phân quyền';
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin': return 'destructive' as const;
      case 'manager': return 'default' as const;
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
    <div className="min-h-screen bg-gradient-card">
      {/* Header */}
      <header className="bg-white shadow-soft border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Building2 className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">CRM Enterprise</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {user?.user_metadata?.first_name || "Admin"} {user?.user_metadata?.last_name || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  <Badge variant={getRoleBadgeVariant(userRole)} className="mt-1">
                    {getRoleDisplayName(userRole)}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Đăng xuất
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Chào mừng trở lại, {user?.user_metadata?.first_name || "Admin"}!
          </h2>
          <p className="text-muted-foreground">
            Đây là tổng quan về hoạt động kinh doanh của bạn hôm nay.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="shadow-soft hover:shadow-crisp transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground mb-1">
                  {stat.value}
                </div>
                <p className={`text-xs ${
                  stat.changeType === 'positive' ? 'text-success' : 'text-destructive'
                }`}>
                  {stat.change} so với tháng trước
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-foreground mb-4">Thao tác nhanh</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Card 
                key={index} 
                className="cursor-pointer hover:shadow-crisp transition-all duration-300 hover:scale-105"
                onClick={action.action}
              >
                <CardContent className="p-6 text-center">
                  <div className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center mx-auto mb-4`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <h4 className="font-semibold text-foreground mb-2">{action.title}</h4>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Admin Actions */}
        {(userRole === 'admin' || userRole === 'manager') && (
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-foreground mb-4">Quản lý hệ thống</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {adminActions
                .filter(action => action.roles.includes(userRole))
                .map((action, index) => (
                  <Card 
                    key={index} 
                    className="cursor-pointer hover:shadow-crisp transition-all duration-300 hover:scale-105"
                    onClick={action.action}
                  >
                    <CardContent className="p-6 text-center">
                      <div className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center mx-auto mb-4`}>
                        <action.icon className="h-6 w-6 text-white" />
                      </div>
                      <h4 className="font-semibold text-foreground mb-2">{action.title}</h4>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* Recent Activity & Upcoming */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Hoạt động gần đây</CardTitle>
              <CardDescription>Các thao tác mới nhất trong hệ thống</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4].map((_, index) => (
                  <div key={index} className="flex items-center space-x-4 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Khách hàng mới được thêm vào hệ thống
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {index + 1} giờ trước
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Lịch hẹn sắp tới</CardTitle>
              <CardDescription>Các cuộc hẹn trong tuần này</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4].map((_, index) => (
                  <div key={index} className="flex items-center space-x-4 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Họp với khách hàng ABC Company
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ngày {index + 20}/01/2024 - 14:00
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;