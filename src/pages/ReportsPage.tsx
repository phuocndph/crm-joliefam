import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Download, TrendingUp, TrendingDown, BarChart3, PieChart, Users, ShoppingCart, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, LineChart, Line, Pie } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";
import { DateRange } from "react-day-picker";

const ReportsPage = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch all required data
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["orders-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customers (
            id,
            name,
            customer_code
          )
        `)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*");
      
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: orderPayments = [] } = useQuery({
    queryKey: ["order-payments-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_payments")
        .select(`
          *,
          orders (
            order_number,
            total_amount,
            customers (
              name
            )
          )
        `)
        .order("payment_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Filter data by date range
  const filteredTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.date);
    if (dateRange?.from && transactionDate < dateRange.from) return false;
    if (dateRange?.to && transactionDate > dateRange.to) return false;
    return true;
  });

  const filteredOrders = orders.filter(o => {
    const orderDate = new Date(o.created_at);
    if (dateRange?.from && orderDate < dateRange.from) return false;
    if (dateRange?.to && orderDate > dateRange.to) return false;
    return true;
  });

  const filteredExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.expense_date);
    if (dateRange?.from && expenseDate < dateRange.from) return false;
    if (dateRange?.to && expenseDate > dateRange.to) return false;
    return true;
  });

  const filteredCustomers = customers.filter(c => {
    const customerDate = new Date(c.created_at);
    if (dateRange?.from && customerDate < dateRange.from) return false;
    if (dateRange?.to && customerDate > dateRange.to) return false;
    return true;
  });

  const filteredPayments = orderPayments.filter(p => {
    const paymentDate = new Date(p.payment_date);
    if (dateRange?.from && paymentDate < dateRange.from) return false;
    if (dateRange?.to && paymentDate > dateRange.to) return false;
    return true;
  });

  // Calculate comprehensive metrics
  const totalOrderRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const totalCostPrice = filteredOrders.reduce((sum, o) => sum + Number(o.cost_price || 0), 0);
  const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  
  const actualPaidAmount = filteredPayments.reduce((sum, p) => sum + Number(p.payment_amount), 0);
  
  console.log('Profit Calculation:', {
    totalRevenue: totalOrderRevenue,
    totalCostPrice,
    totalExpenses: totalExpensesAmount,
    netProfit: totalOrderRevenue - totalCostPrice - totalExpensesAmount,
    dateRange
  });

  const grossProfit = totalOrderRevenue - totalCostPrice;
  const netProfit = grossProfit - totalExpensesAmount;

  const completedOrders = filteredOrders.filter(o => o.status === "delivered").length;
  const pendingOrders = filteredOrders.filter(o => o.status === "pending").length;
  const totalOrders = filteredOrders.length;

  // Payment status calculations
  const paidOrders = filteredOrders.filter(o => o.payment_status === "paid").length;
  const partialPaidOrders = filteredOrders.filter(o => o.payment_status === "partial").length;
  const unpaidOrders = filteredOrders.filter(o => o.payment_status === "pending").length;

  // Customer metrics
  const newCustomers = filteredCustomers.length;
  const totalCustomers = customers.length;
  const averageOrderValue = totalOrders > 0 ? totalOrderRevenue / totalOrders : 0;
  const averageDailyRevenue = dateRange?.from && dateRange?.to ? 
    totalOrderRevenue / Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1) : 0;

  // Prepare comprehensive chart data
  const monthlyData = [];
  const currentDate = new Date();
  for (let i = 11; i >= 0; i--) {
    const month = subMonths(currentDate, i);
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    
    const monthOrders = orders.filter(o => {
      const oDate = new Date(o.created_at);
      return oDate >= monthStart && oDate <= monthEnd;
    });

    const monthExpenses = expenses.filter(e => {
      const eDate = new Date(e.expense_date);
      return eDate >= monthStart && eDate <= monthEnd;
    });

    const revenue = monthOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const expensesAmount = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const ordersCount = monthOrders.length;
    const completedCount = monthOrders.filter(o => o.status === "delivered").length;

    monthlyData.push({
      month: format(month, "MMM yyyy", { locale: vi }),
      revenue,
      expenses: expensesAmount,
      profit: revenue - expensesAmount,
      orders: ordersCount,
      completed: completedCount
    });
  }

  // Category and status breakdown
  const expenseCategories = filteredExpenses
    .reduce((acc, e) => {
      const category = e.category || "Khác";
      if (!acc[category]) {
        acc[category] = { name: category, value: 0, count: 0 };
      }
      acc[category].value += Number(e.amount);
      acc[category].count += 1;
      return acc;
    }, {} as Record<string, { name: string; value: number; count: number }>);

  const expenseCategoryData = Object.values(expenseCategories);

  // Order status data
  const orderStatusData = [
    { name: "Đã giao", value: completedOrders, color: "hsl(var(--success))" },
    { name: "Đang xử lý", value: pendingOrders, color: "hsl(var(--warning))" },
    { name: "Khác", value: totalOrders - completedOrders - pendingOrders, color: "hsl(var(--muted-foreground))" }
  ].filter(item => item.value > 0);

  // Payment status data
  const paymentStatusData = [
    { name: "Đã thanh toán", value: paidOrders, color: "hsl(var(--success))" },
    { name: "Chờ thanh toán", value: unpaidOrders, color: "hsl(var(--warning))" },
    { name: "Thanh toán một phần", value: partialPaidOrders, color: "hsl(var(--primary))" }
  ].filter(item => item.value > 0);

  // Top products by sales
  const productSales = filteredOrders
    .flatMap(order => {
      try {
        const itemsStr = typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []);
        return JSON.parse(itemsStr);
      } catch {
        return [];
      }
    })
    .reduce((acc: any, item: any) => {
      const key = item.name || 'Unknown';
      if (!acc[key]) {
        acc[key] = { name: key, quantity: 0, revenue: 0 };
      }
      acc[key].quantity += Number(item.quantity || 0);
      acc[key].revenue += Number(item.total || 0);
      return acc;
    }, {});

  const topProducts = Object.values(productSales)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 10);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  const exportReport = () => {
    const reportData = {
      period: `${format(dateRange?.from || new Date(), "dd/MM/yyyy")} - ${format(dateRange?.to || new Date(), "dd/MM/yyyy")}`,
      summary: {
        totalOrderRevenue,
        totalCostPrice,
        grossProfit,
        totalExpensesAmount,
        netProfit,
        actualPaidAmount,
        totalOrders,
        completedOrders,
        newCustomers,
        totalCustomers,
        averageOrderValue,
        averageDailyRevenue
      },
      paymentStatus: {
        paidOrders,
        partialPaidOrders,
        unpaidOrders
      },
      monthlyData,
      expenseCategories: expenseCategoryData,
      topProducts
    };

    const jsonContent = JSON.stringify(reportData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bao-cao-${format(new Date(), "dd-MM-yyyy")}.json`;
    link.click();
  };

  const quickDateRanges = [
    {
      label: "Tháng này",
      range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) }
    },
    {
      label: "Tháng trước", 
      range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }
    },
    {
      label: "Năm này",
      range: { from: startOfYear(new Date()), to: endOfYear(new Date()) }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Báo cáo & Thống kê</h1>
        <div className="flex items-center space-x-3">
          <Select value={`${format(dateRange?.from || new Date(), "MMM yyyy", { locale: vi })}`}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Chọn tháng" />
            </SelectTrigger>
            <SelectContent>
              {quickDateRanges.map((range, index) => (
                <SelectItem 
                  key={index} 
                  value={range.label}
                  onClick={() => setDateRange(range.range)}
                >
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportReport}>
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Tạo báo cáo
          </Button>
        </div>
      </div>

      <div id="reports-content">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Tổng quan</TabsTrigger>
            <TabsTrigger value="sales">Bán hàng</TabsTrigger>
            <TabsTrigger value="financial">Tài chính</TabsTrigger>
            <TabsTrigger value="actual-revenue">Doanh thu thực tế</TabsTrigger>
            <TabsTrigger value="customers">Khách hàng</TabsTrigger>
            <TabsTrigger value="products">Sản phẩm</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Overview Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Tổng doanh thu</p>
                      <p className="text-2xl font-bold">{formatCurrency(totalOrderRevenue)}</p>
                      <p className="text-sm text-green-600 flex items-center mt-1">
                        <TrendingUp className="w-4 h-4 mr-1" />
                        {completedOrders} đơn hoàn thành
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Tổng đơn hàng</p>
                      <p className="text-2xl font-bold">{totalOrders}</p>
                      <p className="text-sm text-blue-600 flex items-center mt-1">
                        <TrendingUp className="w-4 h-4 mr-1" />
                        {totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0}% chuyển đổi
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <ShoppingCart className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Doanh thu trung bình</p>
                      <p className="text-2xl font-bold">{formatCurrency(averageDailyRevenue)}</p>
                      <p className="text-sm text-purple-600 flex items-center mt-1">
                        <TrendingUp className="w-4 h-4 mr-1" />
                        Trung bình/ngày
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Biểu đồ doanh thu tăng trưởng</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                        <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px"
                          }}
                          formatter={(value: number) => [formatCurrency(value), ""]}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#22c55e" 
                          strokeWidth={2}
                          dot={{ fill: '#22c55e', strokeWidth: 2, r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Trạng thái thanh toán</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={paymentStatusData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {paymentStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sales" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Đơn hàng mới</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalOrders}</div>
                  <p className="text-xs text-muted-foreground">
                    {completedOrders} đã hoàn thành
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Giá trị trung bình</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(averageOrderValue)}</div>
                  <p className="text-xs text-muted-foreground">
                    Mỗi đơn hàng
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Tỷ lệ chuyển đổi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Đơn hoàn thành
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Doanh thu bán hàng</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalOrderRevenue)}</div>
                  <p className="text-xs text-muted-foreground">
                    Tổng giá trị đơn hàng
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Xu hướng bán hàng theo tháng</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="orders" fill="#3b82f6" name="Số đơn hàng" />
                    <Bar dataKey="completed" fill="#10b981" name="Đã hoàn thành" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financial" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Doanh thu gốc</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(totalOrderRevenue)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Giá vốn</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalCostPrice)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Chi phí</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpensesAmount)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Lợi nhuận ròng</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(netProfit)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Doanh thu vs Chi phí</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="revenue" fill="#10b981" name="Doanh thu" />
                      <Bar dataKey="expenses" fill="#ef4444" name="Chi phí" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Phân tích chi phí theo danh mục</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <RechartsPieChart>
                      <Pie
                        data={expenseCategoryData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {expenseCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="actual-revenue" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Đã thu thực tế</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(actualPaidAmount)}</div>
                  <p className="text-xs text-muted-foreground">
                    Từ {filteredPayments.length} giao dịch
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Còn phải thu</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(totalOrderRevenue - actualPaidAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Chưa thanh toán
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Tỷ lệ thu tiền</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {totalOrderRevenue > 0 ? ((actualPaidAmount / totalOrderRevenue) * 100).toFixed(1) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hiệu suất thu tiền
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Khách hàng mới</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{newCustomers}</div>
                  <p className="text-xs text-muted-foreground">
                    Trong kỳ báo cáo
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Tổng khách hàng</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalCustomers}</div>
                  <p className="text-xs text-muted-foreground">
                    Tích lũy
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Giá trị trung bình</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(averageOrderValue)}</div>
                  <p className="text-xs text-muted-foreground">
                    Mỗi khách hàng
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top sản phẩm bán chạy</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={topProducts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="revenue" fill="#3b82f6" name="Doanh thu" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ReportsPage;