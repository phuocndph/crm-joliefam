import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserStats } from "@/hooks/useUserStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart,
  UserPlus,
  FileText,
  BarChart3,
  Calendar,
  Package,
  CreditCard
} from "lucide-react";

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { role: userRole, loading: roleLoading } = useUserRole(user);
  const { stats: userStats, loading: statsLoading } = useUserStats(userRole);

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

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  // CRM Pro KPI Stats
  const crmStats = [
    {
      title: "Tổng doanh thu",
      value: "2,450,000",
      unit: "VNĐ",
      change: "+12.5%",
      changeType: "positive",
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
      description: "so với tháng trước"
    },
    {
      title: "Đơn hàng",
      value: "156",
      unit: "đơn",
      change: "+8.2%",
      changeType: "positive",
      icon: ShoppingCart,
      color: "text-success",
      bgColor: "bg-success/10",
      description: "tăng trưởng tháng này"
    },
    {
      title: "Khách hàng",
      value: "89",
      unit: "khách",
      change: "+15",
      changeType: "positive",
      icon: Users,
      color: "text-accent",
      bgColor: "bg-accent/10",
      description: "khách hàng mới"
    },
    {
      title: "Báo giá",
      value: "23",
      unit: "báo giá",
      change: "+5",
      changeType: "positive",
      icon: FileText,
      color: "text-warning",
      bgColor: "bg-warning/10",
      description: "báo giá đã tạo"
    }
  ];

  const quickActions = [
    {
      title: "Thêm khách hàng",
      description: "Tạo hồ sơ khách hàng mới",
      icon: UserPlus,
      color: "bg-gradient-primary",
      action: () => navigate("/customers")
    },
    {
      title: "Tạo báo giá",
      description: "Soạn báo giá cho khách hàng",
      icon: FileText,
      color: "bg-gradient-accent",
      action: () => navigate("/quotes")
    },
    {
      title: "Quản lý sản phẩm",
      description: "Cập nhật kho hàng",
      icon: Package,
      color: "bg-success",
      action: () => navigate("/products")
    },
    {
      title: "Xem báo cáo",
      description: "Phân tích doanh số",
      icon: BarChart3,
      color: "bg-secondary border border-primary/20",
      textColor: "text-primary",
      action: () => navigate("/reports")
    }
  ];

  const systemActions = [
    {
      title: "Quản lý nhân viên",
      description: "Phân quyền và quản lý users",
      icon: Users,
      color: "bg-destructive",
      action: () => navigate("/user-management"),
      roles: ['admin', 'manager']
    },
    {
      title: "Dòng tiền",
      description: "Theo dõi thu chi",
      icon: TrendingUp,
      color: "bg-success",
      action: () => navigate("/cash-flow"),
      roles: ['admin', 'manager']
    },
    {
      title: "Giao dịch",
      description: "Lịch sử thanh toán",
      icon: CreditCard,
      color: "bg-accent",
      action: () => navigate("/transactions"),
      roles: ['admin', 'manager', 'employee']
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          CRM Pro Dashboard
        </h1>
        <p className="text-muted-foreground">
          Chào mừng trở lại, {user?.user_metadata?.first_name || "Admin"}! Tổng quan hoạt động kinh doanh hôm nay.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {crmStats.map((stat, index) => (
          <Card key={index} className="shadow-brand hover:shadow-crisp transition-all duration-300 border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2.5 rounded-xl ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-foreground">
                  {stat.value}
                </span>
                <span className="text-sm text-muted-foreground font-medium">
                  {stat.unit}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {stat.change && (
                  <span className={stat.changeType === 'positive' ? 'text-success font-medium' : 'text-destructive font-medium'}>
                    {stat.change}{' '}
                  </span>
                )}
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Thao tác nhanh</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Card 
              key={index} 
              className="cursor-pointer hover:shadow-accent transition-all duration-300 hover:scale-105 border-0 overflow-hidden"
              onClick={action.action}
            >
              <CardContent className="p-6 text-center">
                <div className={`w-14 h-14 ${action.color} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                  <action.icon className={`h-6 w-6 ${action.textColor || 'text-white'}`} />
                </div>
                <h4 className="font-semibold text-foreground mb-2">{action.title}</h4>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* System Management */}
      {userRole && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">Quản lý hệ thống</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {systemActions
              .filter(action => action.roles.includes(userRole))
              .map((action, index) => (
                <Card 
                  key={index} 
                  className="cursor-pointer hover:shadow-crisp transition-all duration-300 hover:scale-105 border-0"
                  onClick={action.action}
                >
                  <CardContent className="p-6 text-center">
                    <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
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

      {/* Recent Activity & Revenue Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Hoạt động gần đây</CardTitle>
            <CardDescription>Các thao tác mới nhất trong hệ thống CRM</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { action: "Khách hàng ABC Corp đã đặt đơn hàng mới", time: "2 phút trước", icon: ShoppingCart, color: "bg-success/10 text-success" },
                { action: "Báo giá #QT001 đã được gửi cho khách hàng", time: "15 phút trước", icon: FileText, color: "bg-primary/10 text-primary" },
                { action: "Sản phẩm laptop Dell được cập nhật", time: "1 giờ trước", icon: Package, color: "bg-accent/10 text-accent" },
                { action: "Thanh toán đơn hàng #001 hoàn tất", time: "2 giờ trước", icon: CreditCard, color: "bg-warning/10 text-warning" }
              ].map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-white/50 hover:bg-white/80 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activity.color}`}>
                    <activity.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {activity.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Doanh thu tuần này</CardTitle>
            <CardDescription>Biểu đồ tăng trưởng doanh số</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-foreground mb-1">2,450,000 VNĐ</div>
                <div className="text-sm text-muted-foreground">
                  <span className="text-success font-medium">+12.5%</span> so với tuần trước
                </div>
              </div>
              
              <div className="space-y-3">
                {[
                  { day: "T2", amount: "320,000", progress: 65 },
                  { day: "T3", amount: "450,000", progress: 90 },
                  { day: "T4", amount: "380,000", progress: 75 },
                  { day: "T5", amount: "520,000", progress: 100 },
                  { day: "T6", amount: "420,000", progress: 85 },
                  { day: "T7", amount: "230,000", progress: 45 },
                  { day: "CN", amount: "130,000", progress: 25 }
                ].map((day, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-8 text-xs font-medium text-muted-foreground">{day.day}</div>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div 
                        className="bg-gradient-primary h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${day.progress}%` }}
                      />
                    </div>
                    <div className="text-xs font-medium text-foreground w-16 text-right">{day.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;