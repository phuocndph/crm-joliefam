import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MobileDashboard from "@/components/mobile/MobileDashboard";
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
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Clock
} from "lucide-react";

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalQuotes: number;
  totalProducts: number;
  pendingOrders: number;
  approvedQuotes: number;
  monthlyRevenue: number;
  monthlyOrders: number;
  monthlyCustomers: number;
}

const Dashboard = () => {
  const isMobile = useIsMobile();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalQuotes: 0,
    totalProducts: 0,
    pendingOrders: 0,
    approvedQuotes: 0,
    monthlyRevenue: 0,
    monthlyOrders: 0,
    monthlyCustomers: 0,
  });
  const navigate = useNavigate();
  const { role: userRole, loading: roleLoading } = useUserRole(user);

  // All hooks must be called before any conditional returns!

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

  useEffect(() => {
    if (user && !roleLoading) {
      loadDashboardStats();
    }
  }, [user, userRole, roleLoading]);

  const loadDashboardStats = async () => {
    try {
      // Get current month start
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      // Load all stats in parallel — request only fields we use, and count-only for products.
      const [
        ordersResponse,
        customersResponse,
        quotesResponse,
        productsCountResponse,
      ] = await Promise.all([
        supabase.from('orders').select('total_amount, status, created_at'),
        supabase.from('customers').select('email, phone, purchase_count, created_at'),
        supabase.from('quotes').select('total_amount, status, created_at'),
        supabase.from('products').select('id', { count: 'exact', head: true }),
      ]);

      const orders = ordersResponse.data || [];
      const customers = customersResponse.data || [];
      const quotes = quotesResponse.data || [];
      const productsCount = productsCountResponse.count ?? 0;

      // Remove duplicate customers by email/phone, keep the one with highest purchase_count
      const uniqueCustomers = customers.reduce((acc, customer) => {
        const key = `${customer.email}-${customer.phone}`;
        if (!acc[key] || acc[key].purchase_count < customer.purchase_count) {
          acc[key] = customer;
        }
        return acc;
      }, {} as Record<string, typeof customers[0]>);
      
      const deduplicatedCustomers = Object.values(uniqueCustomers);

      // Calculate total revenue from completed orders
      const totalRevenue = orders
        .filter(order => order.status === 'delivered')
        .reduce((sum, order) => sum + (order.total_amount || 0), 0);

      // Calculate monthly revenue
      const monthlyRevenue = orders
        .filter(order => 
          order.status === 'delivered' && 
          new Date(order.created_at) >= currentMonth
        )
        .reduce((sum, order) => sum + (order.total_amount || 0), 0);

      // Calculate monthly orders and customers
      const monthlyOrders = orders.filter(order => 
        new Date(order.created_at) >= currentMonth
      ).length;

      const monthlyCustomers = deduplicatedCustomers.filter(customer => 
        new Date(customer.created_at) >= currentMonth
      ).length;

      setStats({
        totalRevenue,
        totalOrders: orders.length,
        totalCustomers: deduplicatedCustomers.length,
        totalQuotes: quotes.length,
        totalProducts: productsCount,
        pendingOrders: orders.filter(order => order.status === 'pending').length,
        approvedQuotes: quotes.filter(quote => quote.status === 'approved').length,
        monthlyRevenue,
        monthlyOrders,
        monthlyCustomers,
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-pulse text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  // Main KPI Cards
  const mainStats = [
    {
      title: "Tổng doanh thu",
      value: stats.totalRevenue.toLocaleString("vi-VN"),
      unit: "VNĐ",
      change: stats.monthlyRevenue > 0 ? `+${((stats.monthlyRevenue / Math.max(stats.totalRevenue - stats.monthlyRevenue, 1)) * 100).toFixed(1)}%` : "0%",
      changeType: stats.monthlyRevenue > 0 ? "positive" : "neutral",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-100",
      description: "từ đơn hàng hoàn thành",
      link: "/transactions"
    },
    {
      title: "Đơn hàng",
      value: stats.totalOrders.toString(),
      unit: "đơn",
      change: stats.monthlyOrders > 0 ? `+${stats.monthlyOrders}` : "0",
      changeType: stats.monthlyOrders > 0 ? "positive" : "neutral",
      icon: ShoppingCart,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      description: "đơn mới tháng này",
      link: "/orders"
    },
    {
      title: "Khách hàng",
      value: stats.totalCustomers.toString(),
      unit: "khách",
      change: stats.monthlyCustomers > 0 ? `+${stats.monthlyCustomers}` : "0",
      changeType: stats.monthlyCustomers > 0 ? "positive" : "neutral",
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      description: "khách mới tháng này",
      link: "/customers"
    },
    {
      title: "Báo giá",
      value: stats.totalQuotes.toString(),
      unit: "báo giá",
      change: stats.approvedQuotes > 0 ? `${stats.approvedQuotes} được duyệt` : "0 được duyệt",
      changeType: stats.approvedQuotes > 0 ? "positive" : "neutral",
      icon: FileText,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      description: "tổng số báo giá",
      link: "/quotes"
    },
  ];

  // Quick Action Cards
  const quickActions = [
    {
      title: "Đơn hàng chờ xử lý",
      value: stats.pendingOrders.toString(),
      description: "cần được xử lý",
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
      action: "Xem đơn hàng",
      link: "/orders"
    },
    {
      title: "Sản phẩm",
      value: stats.totalProducts.toString(),
      description: "trong kho",
      icon: Package,
      color: "text-indigo-600",
      bgColor: "bg-indigo-100",
      action: "Quản lý sản phẩm",
      link: "/products"
    },
    {
      title: "Báo cáo",
      value: "Xem chi tiết",
      description: "phân tích dữ liệu",
      icon: BarChart3,
      color: "text-cyan-600",
      bgColor: "bg-cyan-100",
      action: "Xem báo cáo",
      link: "/reports"
    },
    {
      title: "Dòng tiền",
      value: "Quản lý",
      description: "thu chi tài chính",
      icon: CreditCard,
      color: "text-pink-600",
      bgColor: "bg-pink-100",
      action: "Xem dòng tiền",
      link: "/cash-flow"
    },
  ];

  // Return mobile version if on mobile device
  if (isMobile) {
    return <MobileDashboard />;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Chào mừng trở lại! 👋
        </h1>
        <p className="text-muted-foreground">
          Đây là tổng quan về hoạt động kinh doanh của bạn. Vai trò hiện tại: <span className="font-semibold capitalize">{userRole}</span>
        </p>
      </div>

      {/* Main KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {mainStats.map((stat, index) => (
          <Card key={index} className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(stat.link)}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <div className="flex items-baseline space-x-1">
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <span className="text-sm text-muted-foreground">{stat.unit}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className={`text-xs font-medium ${
                      stat.changeType === 'positive' ? 'text-green-600' : 
                      stat.changeType === 'negative' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {stat.changeType === 'positive' && <ArrowUpRight className="w-3 h-3 inline mr-1" />}
                      {stat.changeType === 'negative' && <ArrowDownRight className="w-3 h-3 inline mr-1" />}
                      {stat.change}
                    </span>
                    <span className="text-xs text-muted-foreground">{stat.description}</span>
                  </div>
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Thao tác nhanh</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-lg ${action.bgColor}`}>
                    <action.icon className={`h-5 w-5 ${action.color}`} />
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{action.value}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => navigate(action.link)}
                  >
                    {action.action}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* System Workflow Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Quy trình hoạt động
          </CardTitle>
          <CardDescription>
            Hệ thống liên kết các module với nhau để tối ưu quy trình kinh doanh
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-blue-600">1. Sản phẩm → Báo giá</h4>
              <p className="text-sm text-muted-foreground">
                Tạo báo giá từ danh sách sản phẩm có sẵn với bảng giá tương ứng
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-green-600">2. Báo giá → Đơn hàng</h4>
              <p className="text-sm text-muted-foreground">
                Khi duyệt báo giá, hệ thống tự động tạo đơn hàng và cập nhật thông tin khách hàng
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-purple-600">3. Đơn hàng → Giao dịch</h4>
              <p className="text-sm text-muted-foreground">
                Đơn hàng hoàn thành sẽ tự động tạo giao dịch thu nhập và cập nhật báo cáo
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;