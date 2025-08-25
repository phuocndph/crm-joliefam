import React from "react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MobileCard from "./MobileCard";
import { 
  Users, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart,
  FileText,
  Package,
  Clock,
  BarChart3,
  CreditCard,
  Activity,
  Plus,
  ArrowUpRight
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

const MobileDashboard: React.FC = () => {
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

      // Load all stats in parallel
      const [
        ordersResponse,
        customersResponse,
        quotesResponse,
        productsResponse,
        transactionsResponse
      ] = await Promise.all([
        supabase.from('orders').select('total_amount, status, created_at'),
        supabase.from('customers').select('*'),
        supabase.from('quotes').select('total_amount, status, created_at'),
        supabase.from('products').select('id'),
        supabase.from('transactions').select('amount, type, created_at')
      ]);

      const orders = ordersResponse.data || [];
      const customers = customersResponse.data || [];
      const quotes = quotesResponse.data || [];
      const products = productsResponse.data || [];

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
        totalProducts: products.length,
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

  const quickActions = [
    {
      icon: Plus,
      label: "Thêm khách hàng",
      description: "Tạo thông tin khách hàng mới",
      action: () => navigate("/customers?new=true")
    },
    {
      icon: FileText,
      label: "Tạo báo giá",
      description: "Lập báo giá cho khách hàng",
      action: () => navigate("/quotes?new=true")
    },
    {
      icon: ShoppingCart,
      label: "Thêm đơn hàng",
      description: "Tạo đơn hàng mới",
      action: () => navigate("/orders?new=true")
    },
    {
      icon: BarChart3,
      label: "Xem báo cáo",
      description: "Phân tích doanh số",
      action: () => navigate("/reports")
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          Chào mừng! 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Tổng quan hoạt động kinh doanh · <span className="font-medium capitalize">{userRole}</span>
        </p>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 gap-3">
        <MobileCard
          title="Doanh thu"
          value={{
            amount: (stats.totalRevenue / 1000000).toFixed(1),
            unit: "M"
          }}
          subtitle={`+${((stats.monthlyRevenue / Math.max(stats.totalRevenue - stats.monthlyRevenue, 1)) * 100).toFixed(0)}% tháng này`}
          onClick={() => navigate("/transactions")}
        />
        
        <MobileCard
          title="Đơn hàng"
          value={{
            amount: stats.totalOrders.toString(),
            unit: "đơn"
          }}
          subtitle={`+${stats.monthlyOrders} mới`}
          onClick={() => navigate("/orders")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MobileCard
          title="Khách hàng"
          value={{
            amount: stats.totalCustomers.toString(),
            unit: "KH"
          }}
          subtitle={`+${stats.monthlyCustomers} mới`}
          onClick={() => navigate("/customers")}
        />
        
        <MobileCard
          title="Báo giá"
          value={{
            amount: stats.totalQuotes.toString(),
            unit: "BG"
          }}
          subtitle={`${stats.approvedQuotes} được duyệt`}
          onClick={() => navigate("/quotes")}
        />
      </div>

      {/* Priority Actions */}
      {stats.pendingOrders > 0 && (
        <MobileCard
          title="Đơn hàng chờ xử lý"
          subtitle={`${stats.pendingOrders} đơn cần được xử lý`}
          status={{
            label: "Ưu tiên",
            variant: "destructive"
          }}
          actions={[
            {
              label: "Xem ngay",
              onClick: () => navigate("/orders?status=pending"),
              variant: "default"
            }
          ]}
        />
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Thao tác nhanh</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action, index) => (
            <Card 
              key={index} 
              className="cursor-pointer hover:shadow-md active:scale-95 transition-all duration-200"
              onClick={action.action}
            >
              <CardContent className="p-4 text-center">
                <div className="mx-auto w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mb-3">
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-medium text-sm mb-1">{action.label}</h3>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Hoạt động gần đây
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Sản phẩm trong kho</span>
            <span className="font-medium">{stats.totalProducts}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Đơn hàng hoàn thành</span>
            <span className="font-medium text-green-600">
              {stats.totalOrders - stats.pendingOrders}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Tỷ lệ chuyển đổi</span>
            <span className="font-medium">
              {stats.totalQuotes > 0 ? ((stats.totalOrders / stats.totalQuotes) * 100).toFixed(1) : 0}%
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MobileDashboard;
