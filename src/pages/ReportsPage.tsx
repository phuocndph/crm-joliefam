import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Download, TrendingUp, TrendingDown, BarChart3, PieChart, Users, ShoppingCart, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, LineChart, Line, Pie, AreaChart, Area } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, differenceInDays, startOfDay, endOfDay } from "date-fns";
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

  // Remove duplicate customers by email/phone, keep the one with highest purchase_count
  const uniqueCustomers = customers.reduce((acc, customer) => {
    const key = `${customer.email}-${customer.phone}`;
    if (!acc[key] || acc[key].purchase_count < customer.purchase_count) {
      acc[key] = customer;
    }
    return acc;
  }, {} as Record<string, typeof customers[0]>);
  
  const deduplicatedCustomers = Object.values(uniqueCustomers);
  
  const filteredCustomers = deduplicatedCustomers.filter(c => {
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
  
  // Calculate actual paid amount - only from payments related to filtered orders
  const filteredOrderIds = new Set(filteredOrders.map(o => o.id));
  
  // Calculate payments for filtered orders (not necessarily in the same time period)
  const paymentsForFilteredOrders = orderPayments.filter(p => 
    p.order_id && filteredOrderIds.has(p.order_id)
  );
  
  const actualPaidAmountTotal = paymentsForFilteredOrders.reduce((sum, p) => 
    sum + Number(p.payment_amount || 0), 0
  );
  
  // Calculate payments that happened in the filtered time period
  const actualPaidAmountInPeriod = filteredPayments
    .filter(p => !p.order_id || filteredOrderIds.has(p.order_id))
    .reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);
  
  // Calculate remaining amount to collect for filtered orders
  const totalOrderAmount = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const remainingAmount = Math.max(0, totalOrderAmount - actualPaidAmountTotal);
  
  console.log('Revenue Calculation Debug:', {
    filteredOrders: filteredOrders.length,
    filteredPayments: filteredPayments.length,
    totalOrderAmount,
    actualPaidAmountTotal,
    actualPaidAmountInPeriod,
    remainingAmount,
    dateRange: {
      from: dateRange?.from?.toISOString(),
      to: dateRange?.to?.toISOString()
    },
    sampleOrders: filteredOrders.slice(0, 3).map(o => ({
      id: o.id,
      order_number: o.order_number,
      total_amount: o.total_amount,
      created_at: o.created_at,
      payment_status: o.payment_status
    })),
    paymentsForOrders: paymentsForFilteredOrders.map(p => ({
      id: p.id,
      order_id: p.order_id,
      payment_amount: p.payment_amount,
      payment_date: p.payment_date
    }))
  });

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
  const totalCustomers = deduplicatedCustomers.length;
  
  // Debug customer data
  console.log('Customer Debug:', {
    allCustomers: customers.length,
    filteredCustomers: filteredCustomers.length,
    dateRange,
    customerDates: customers.map(c => ({ name: c.name, created_at: c.created_at }))
  });
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
        actualPaidAmount: actualPaidAmountTotal,
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
      label: "Hôm nay",
      range: { from: startOfDay(new Date()), to: endOfDay(new Date()) }
    },
    {
      label: "Từ trước đến nay",
      range: { from: new Date(2020, 0, 1), to: endOfDay(new Date()) }
    },
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
          <Select onValueChange={(value) => {
            const selectedRange = quickDateRanges.find(range => range.label === value);
            if (selectedRange) {
              setDateRange(selectedRange.range);
            }
          }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Chọn khoảng thời gian" />
            </SelectTrigger>
            <SelectContent>
              {quickDateRanges.map((range, index) => (
                <SelectItem 
                  key={index} 
                  value={range.label}
                >
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePickerWithRange 
            date={dateRange}
            setDate={setDateRange}
            className="w-auto"
          />
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

            {/* Enhanced Charts with better visibility and data tables */}
            <div className="space-y-6">
              {/* Revenue Growth Chart with Data Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    📈 Biểu đồ doanh thu tăng trưởng 12 tháng
                  </CardTitle>
                  <CardDescription>Theo dõi xu hướng doanh thu, chi phí và lợi nhuận theo tháng</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.2} />
                            <XAxis 
                              dataKey="month" 
                              stroke="hsl(var(--foreground))" 
                              fontSize={14}
                              fontWeight="500"
                              tick={{ fill: "hsl(var(--foreground))" }}
                            />
                            <YAxis 
                              stroke="hsl(var(--foreground))" 
                              fontSize={14}
                              fontWeight="500"
                              tick={{ fill: "hsl(var(--foreground))" }}
                              tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: "hsl(var(--background))",
                                border: "2px solid hsl(var(--border))",
                                borderRadius: "12px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                fontSize: "14px",
                                fontWeight: "500"
                              }}
                              formatter={(value: number, name: string) => [
                                formatCurrency(value), 
                                name === "revenue" ? "Doanh thu" : name === "expenses" ? "Chi phí" : "Lợi nhuận"
                              ]}
                              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "600" }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="revenue" 
                              stroke="hsl(var(--primary))" 
                              strokeWidth={4}
                              dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 6 }}
                              activeDot={{ r: 8, stroke: "hsl(var(--primary))", strokeWidth: 3, fill: "white" }}
                              name="Doanh thu"
                            />
                            <Line 
                              type="monotone" 
                              dataKey="expenses" 
                              stroke="hsl(var(--destructive))" 
                              strokeWidth={3}
                              dot={{ fill: "hsl(var(--destructive))", strokeWidth: 2, r: 5 }}
                              activeDot={{ r: 7, stroke: "hsl(var(--destructive))", strokeWidth: 2, fill: "white" }}
                              name="Chi phí"
                            />
                            <Line 
                              type="monotone" 
                              dataKey="profit" 
                              stroke="#10b981" 
                              strokeWidth={3}
                              dot={{ fill: "#10b981", strokeWidth: 2, r: 5 }}
                              activeDot={{ r: 7, stroke: "#10b981", strokeWidth: 2, fill: "white" }}
                              name="Lợi nhuận"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    {/* Data Table */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                        📊 Chi tiết 6 tháng gần nhất
                      </h4>
                      <div className="max-h-80 overflow-y-auto space-y-2">
                        {monthlyData.slice(-6).map((data, index) => (
                          <div key={index} className="bg-muted/30 rounded-lg p-3 space-y-2 border">
                            <div className="font-medium text-sm text-center">{data.month}</div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">💰 Doanh thu:</span>
                                <span className="font-medium text-primary">{formatCurrency(data.revenue)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">💸 Chi phí:</span>
                                <span className="font-medium text-destructive">{formatCurrency(data.expenses)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">📈 Lợi nhuận:</span>
                                <span className="font-medium text-green-600">{formatCurrency(data.profit)}</span>
                              </div>
                              <div className="flex justify-between border-t pt-1">
                                <span className="text-muted-foreground">🛒 Đơn hàng:</span>
                                <span className="font-medium">{data.orders}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t bg-muted/20 rounded-lg p-3">
                    <div className="text-sm font-medium text-muted-foreground mb-2 w-full">Chú thích biểu đồ:</div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-primary"></div>
                      <span className="text-sm font-medium">Doanh thu (VND)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-destructive"></div>
                      <span className="text-sm font-medium">Chi phí (VND)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-green-500"></div>
                      <span className="text-sm font-medium">Lợi nhuận (VND)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Order Status Chart with Data Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      📦 Phân bổ trạng thái đơn hàng
                    </CardTitle>
                    <CardDescription>Tỷ lệ các trạng thái đơn hàng trong kỳ báo cáo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={orderStatusData}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              innerRadius={40}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name}\n${(percent * 100).toFixed(1)}%`}
                            >
                              {orderStatusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => [value, "đơn hàng"]}
                              contentStyle={{
                                backgroundColor: "hsl(var(--background))",
                                border: "2px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "14px"
                              }}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Order Status Data Table */}
                      <div className="space-y-2 bg-muted/20 rounded-lg p-3">
                        <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                          📋 Chi tiết số lượng
                        </h4>
                        {orderStatusData.map((item, index) => (
                          <div key={index} className="flex justify-between items-center p-2 bg-background rounded border">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                              <span className="text-sm font-medium">{item.name}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold">{item.value} đơn</div>
                              <div className="text-xs text-muted-foreground">
                                {((item.value / totalOrders) * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 border-t text-xs text-muted-foreground text-center">
                          Tổng: {totalOrders} đơn hàng
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Status Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      💳 Tình trạng thanh toán
                    </CardTitle>
                    <CardDescription>Phân bổ tình trạng thanh toán đơn hàng</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={paymentStatusData}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              innerRadius={40}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name}\n${(percent * 100).toFixed(1)}%`}
                            >
                              {paymentStatusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => [value, "đơn hàng"]}
                              contentStyle={{
                                backgroundColor: "hsl(var(--background))",
                                border: "2px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "14px"
                              }}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Payment Status Data Table */}
                      <div className="space-y-2 bg-muted/20 rounded-lg p-3">
                        <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                          💰 Chi tiết thanh toán
                        </h4>
                        {paymentStatusData.map((item, index) => (
                          <div key={index} className="flex justify-between items-center p-2 bg-background rounded border">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                              <span className="text-sm font-medium">{item.name}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold">{item.value} đơn</div>
                              <div className="text-xs text-muted-foreground">
                                {((item.value / totalOrders) * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 border-t text-xs text-muted-foreground text-center">
                          Tổng: {totalOrders} đơn hàng
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
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
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    💰 Doanh thu thực tế
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency((() => {
                      // Chỉ tính từ đơn hàng đã giao có doanh thu
                      const deliveredOrders = filteredOrders.filter(order => 
                        order.status === "delivered" && order.total_amount > 0
                      );
                      return deliveredOrders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
                    })())}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Từ {filteredOrders.filter(o => o.status === "delivered").length} đơn đã giao
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    🏭 Giá vốn thực tế
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency((() => {
                      // Lấy giá vốn từ tất cả đơn hàng có dữ liệu trong kỳ báo cáo
                      const ordersWithData = filteredOrders.filter(order => 
                        Number(order.total_amount) > 0
                      );
                      
                      console.log('Cost Price Debug:', {
                        totalOrders: filteredOrders.length,
                        ordersWithData: ordersWithData.length,
                        sampleOrders: ordersWithData.slice(0, 3).map(o => ({
                          id: o.id,
                          order_number: o.order_number,
                          cost_price: o.cost_price,
                          total_amount: o.total_amount,
                          status: o.status
                        }))
                      });
                      
                      // Tính tổng giá vốn từ cost_price có sẵn
                      let totalCostPriceReal = ordersWithData.reduce((sum, order) => {
                        const costPrice = Number(order.cost_price) || 0;
                        return sum + costPrice;
                      }, 0);
                      
                      console.log('Total Cost Price Real:', totalCostPriceReal);
                      
                      return totalCostPriceReal;
                    })())}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Giá vốn từ {filteredOrders.filter(o => Number(o.total_amount) > 0).length} đơn hàng
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    💵 Chi phí vận hành
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpensesAmount)}</div>
                  <p className="text-xs text-muted-foreground">
                    Tổng chi phí trong kỳ
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    📊 Lợi nhuận ròng
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${(() => {
                    const ordersWithData = filteredOrders.filter(order => 
                      Number(order.total_amount) > 0
                    );
                    
                    const revenue = ordersWithData.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
                    const totalCostPriceReal = ordersWithData.reduce((sum, order) => {
                      return sum + (Number(order.cost_price) || 0);
                    }, 0);
                    
                    const netProfitReal = revenue - totalCostPriceReal - totalExpensesAmount;
                    return netProfitReal >= 0 ? 'text-green-600' : 'text-red-600';
                  })()}`}>
                    {formatCurrency((() => {
                      const ordersWithData = filteredOrders.filter(order => 
                        Number(order.total_amount) > 0
                      );
                      
                      const revenue = ordersWithData.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
                      const totalCostPriceReal = ordersWithData.reduce((sum, order) => {
                        return sum + (Number(order.cost_price) || 0);
                      }, 0);
                      
                      return revenue - totalCostPriceReal - totalExpensesAmount;
                    })())}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Doanh thu - Giá vốn - Chi phí
                  </p>
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
            {/* Header Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    💰 Đã thu thực tế
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(actualPaidAmountTotal)}</div>
                  <p className="text-xs text-muted-foreground">
                    Từ {filteredPayments.length} giao dịch
                  </p>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                    <span className="text-xs text-green-600">
                      {totalOrderAmount > 0 ? ((actualPaidAmountTotal / totalOrderAmount) * 100).toFixed(1) : 0}% của tổng doanh thu
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    📋 Còn phải thu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(remainingAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {unpaidOrders + partialPaidOrders} đơn chưa thanh toán đủ
                  </p>
                  <div className="flex items-center mt-2">
                    <TrendingDown className="w-4 h-4 text-orange-600 mr-1" />
                    <span className="text-xs text-orange-600">
                      {totalOrderAmount > 0 ? ((remainingAmount / totalOrderAmount) * 100).toFixed(1) : 0}% còn lại
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    📊 Tỷ lệ thu tiền
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {totalOrderAmount > 0 ? ((actualPaidAmountTotal / totalOrderAmount) * 100).toFixed(1) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hiệu suất thu tiền
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${totalOrderAmount > 0 ? ((actualPaidAmountTotal / totalOrderAmount) * 100) : 0}%` }}
                    ></div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    📈 Giá trị trung bình
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {formatCurrency(filteredPayments.length > 0 ? actualPaidAmountTotal / filteredPayments.length : 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Thanh toán trung bình/giao dịch
                  </p>
                  <div className="flex items-center mt-2">
                    <BarChart3 className="w-4 h-4 text-purple-600 mr-1" />
                    <span className="text-xs text-purple-600">
                      {formatCurrency(averageOrderValue)} giá trị đơn TB
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    🏭 Tổng giá vốn
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(totalCostPrice)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Giá vốn hàng bán
                  </p>
                  <div className="flex items-center mt-2">
                    <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                    <span className="text-xs text-red-600">
                      {totalOrderAmount > 0 ? ((totalCostPrice / totalOrderAmount) * 100).toFixed(1) : 0}% của doanh thu
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Analysis Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Payment Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    📊 Xu hướng thanh toán theo tháng
                  </CardTitle>
                  <CardDescription>
                    So sánh doanh thu đặt hàng và số tiền thực thu
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={(() => {
                      return monthlyData.map(monthData => {
                        // Calculate actual payments for this month
                        const monthStart = new Date(monthData.month + " 01");
                        const monthEnd = endOfMonth(monthStart);
                        
                        const monthPayments = orderPayments.filter(p => {
                          const paymentDate = new Date(p.payment_date);
                          return paymentDate >= monthStart && paymentDate <= monthEnd;
                        });
                        
                        const actualReceived = monthPayments.reduce((sum, p) => sum + Number(p.payment_amount), 0);
                        
                        return {
                          ...monthData,
                          actualReceived,
                          outstanding: monthData.revenue - actualReceived
                        };
                      });
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => formatCurrency(value).replace('₫', '').trim()} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          formatCurrency(value), 
                          name === 'revenue' ? 'Doanh thu đặt hàng' : 
                          name === 'actualReceived' ? 'Đã thu thực tế' : 'Còn phải thu'
                        ]}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Doanh thu đặt hàng" />
                      <Bar dataKey="actualReceived" fill="hsl(var(--success))" name="Đã thu thực tế" />
                      <Bar dataKey="outstanding" fill="hsl(var(--warning))" name="Còn phải thu" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Payment Status Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    🔄 Phân tích trạng thái thanh toán
                  </CardTitle>
                  <CardDescription>
                    Tỷ lệ các đơn hàng theo trạng thái thanh toán
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={paymentStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {paymentStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Payment Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  ⏰ Timeline thanh toán chi tiết
                </CardTitle>
                <CardDescription>
                  Lịch sử các khoản thanh toán trong kỳ báo cáo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {filteredPayments.length > 0 ? (
                    filteredPayments
                      .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
                      .map((payment, index) => (
                        <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                              <span className="text-green-600 font-bold text-sm">#{index + 1}</span>
                            </div>
                            <div>
                              <div className="font-medium">
                                {payment.orders?.customers?.name || 'Khách hàng không xác định'}
                              </div>
                              <div className="text-sm text-gray-500">
                                Đơn hàng: {payment.orders?.order_number || 'N/A'} • 
                                {payment.payment_type === 'deposit' ? ' Cọc' : payment.payment_type === 'partial' ? ' Trả góp' : ' Thanh toán đủ'} • 
                                {payment.payment_method || 'Tiền mặt'}
                              </div>
                              <div className="text-xs text-gray-400">
                                {format(new Date(payment.payment_date), "dd/MM/yyyy HH:mm", { locale: vi })}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-green-600">
                              {formatCurrency(payment.payment_amount)}
                            </div>
                            {payment.installment_number && payment.installment_number > 1 && (
                              <div className="text-xs text-gray-500">
                                Kỳ {payment.installment_number}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Chưa có giao dịch thanh toán nào trong kỳ này
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Orders Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  🚨 Phân tích đơn hàng chưa thu đủ tiền
                </CardTitle>
                <CardDescription>
                  Danh sách các đơn hàng cần theo dõi thu tiền
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {(() => {
                    const unpaidOrdersList = filteredOrders.filter(order => 
                      order.payment_status === 'pending' || order.payment_status === 'partial'
                    );
                    
                    return unpaidOrdersList.length > 0 ? (
                      unpaidOrdersList
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((order) => {
                          // Calculate paid amount for this order
                          const orderPaymentsForOrder = orderPayments.filter(p => p.order_id === order.id);
                          const paidAmount = orderPaymentsForOrder.reduce((sum, p) => sum + Number(p.payment_amount), 0);
                          const outstandingAmount = Number(order.total_amount || 0) - paidAmount;
                          const paymentProgress = Number(order.total_amount) > 0 ? (paidAmount / Number(order.total_amount)) * 100 : 0;
                          
                          return (
                            <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                              <div className="flex items-center space-x-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  order.payment_status === 'pending' ? 'bg-red-100' : 'bg-yellow-100'
                                }`}>
                                  <span className={`font-bold text-sm ${
                                    order.payment_status === 'pending' ? 'text-red-600' : 'text-yellow-600'
                                  }`}>
                                    {order.payment_status === 'pending' ? '!' : '~'}
                                  </span>
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {order.customers?.name || 'Khách hàng không xác định'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    Đơn hàng: {order.order_number} • 
                                    Trạng thái: {order.status === 'delivered' ? 'Đã giao' : 'Đang xử lý'}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    Ngày đặt: {format(new Date(order.created_at), "dd/MM/yyyy", { locale: vi })}
                                  </div>
                                  <div className="w-48 bg-gray-200 rounded-full h-2 mt-2">
                                    <div 
                                      className={`h-2 rounded-full ${
                                        order.payment_status === 'pending' ? 'bg-red-500' : 'bg-yellow-500'
                                      }`}
                                      style={{ width: `${Math.max(paymentProgress, 5)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-red-600">
                                  {formatCurrency(outstandingAmount)}
                                </div>
                                <div className="text-sm text-gray-500">
                                  còn phải thu
                                </div>
                                <div className="text-xs text-gray-400">
                                  Tổng: {formatCurrency(order.total_amount || 0)}
                                </div>
                                <div className="text-xs text-green-600">
                                  Đã thu: {formatCurrency(paidAmount)}
                                </div>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        🎉 Tất cả đơn hàng đã được thanh toán đầy đủ!
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            {/* Customer Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    👥 Khách hàng mới
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{newCustomers}</div>
                  <p className="text-xs text-muted-foreground">
                    Trong kỳ báo cáo
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    🏢 Tổng khách hàng
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">{totalCustomers}</div>
                  <p className="text-xs text-muted-foreground">
                    Tích lũy
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    💰 Giá trị trung bình
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">{formatCurrency(averageOrderValue)}</div>
                  <p className="text-xs text-muted-foreground">
                    Mỗi đơn hàng
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Customer Growth Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  📈 Tăng trưởng khách hàng
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Biểu đồ thể hiện xu hướng tăng trưởng số lượng khách hàng theo thời gian
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis 
                        dataKey="month" 
                        fontSize={12}
                        stroke="hsl(var(--foreground))"
                      />
                      <YAxis 
                        fontSize={12}
                        stroke="hsl(var(--foreground))"
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          value,
                          name === "orders" ? "📦 Đơn hàng" : "✅ Hoàn thành"
                        ]}
                        labelFormatter={(label) => `📅 ${label}`}
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "14px"
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="orders" 
                        stroke="hsl(var(--primary))" 
                        fill="hsl(var(--primary))" 
                        fillOpacity={0.2}
                        name="orders"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="completed" 
                        stroke="hsl(var(--success))" 
                        fill="hsl(var(--success))" 
                        fillOpacity={0.3}
                        name="completed"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-6 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-primary rounded opacity-60"></div>
                      <span className="text-sm font-medium">📦 Tổng đơn hàng</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-success rounded opacity-60"></div>
                      <span className="text-sm font-medium">✅ Đơn hoàn thành</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  📊 Hiệu suất khách hàng theo tháng
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Bảng chi tiết thống kê đơn hàng và tỷ lệ hoàn thành theo từng tháng
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-3 font-semibold">📅 Tháng</th>
                        <th className="text-right p-3 font-semibold">📦 Tổng đơn</th>
                        <th className="text-right p-3 font-semibold">✅ Hoàn thành</th>
                        <th className="text-right p-3 font-semibold">📈 Tỷ lệ (%)</th>
                        <th className="text-right p-3 font-semibold">💰 Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.slice(-6).map((data, index) => {
                        const completionRate = data.orders > 0 ? ((data.completed / data.orders) * 100).toFixed(1) : '0';
                        return (
                          <tr key={data.month} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="p-3 font-medium">{data.month}</td>
                            <td className="text-right p-3 font-mono">{data.orders}</td>
                            <td className="text-right p-3 font-mono text-success">{data.completed}</td>
                            <td className="text-right p-3 font-mono">
                              <span className={`${Number(completionRate) >= 80 ? 'text-success' : Number(completionRate) >= 60 ? 'text-warning' : 'text-destructive'}`}>
                                {completionRate}%
                              </span>
                            </td>
                            <td className="text-right p-3 font-mono font-semibold text-primary">
                              {formatCurrency(data.revenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {monthlyData.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-4xl mb-2">👥</div>
                    <p>Không có dữ liệu khách hàng trong kỳ báo cáo này</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            {/* Top Products Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  📊 Top sản phẩm bán chạy
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Biểu đồ thể hiện doanh thu và số lượng bán của các sản phẩm hàng đầu trong kỳ báo cáo
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Chart */}
                  <ResponsiveContainer width="100%" height={450}>
                    <BarChart 
                      data={topProducts} 
                      margin={{ top: 20, right: 30, left: 40, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis 
                        dataKey="name" 
                        angle={-45} 
                        textAnchor="end" 
                        height={120}
                        fontSize={12}
                        stroke="hsl(var(--foreground))"
                        interval={0}
                      />
                      <YAxis 
                        fontSize={12}
                        stroke="hsl(var(--foreground))"
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          name === "revenue" ? formatCurrency(value) : value,
                          name === "revenue" ? "💰 Doanh thu" : "📦 Số lượng bán"
                        ]}
                        labelFormatter={(label) => `🏷️ ${label}`}
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "14px"
                        }}
                      />
                      <Bar 
                        dataKey="revenue" 
                        fill="hsl(var(--primary))" 
                        name="revenue"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-6 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-primary rounded"></div>
                      <span className="text-sm font-medium">💰 Doanh thu (VND)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">📊 Sắp xếp theo doanh thu giảm dần</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Data Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  📋 Bảng chi tiết sản phẩm bán chạy
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Thông tin chi tiết về số lượng và doanh thu của từng sản phẩm
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-3 font-semibold">🏷️ Tên sản phẩm</th>
                        <th className="text-right p-3 font-semibold">📦 Số lượng bán</th>
                        <th className="text-right p-3 font-semibold">💰 Doanh thu</th>
                        <th className="text-right p-3 font-semibold">💵 Giá trung bình</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((product: any, index) => (
                        <tr key={product.name} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "📦"}</span>
                              <span className="font-medium">{product.name}</span>
                            </div>
                          </td>
                          <td className="text-right p-3 font-mono">{product.quantity?.toLocaleString() || 0}</td>
                          <td className="text-right p-3 font-mono font-semibold text-primary">
                            {formatCurrency(product.revenue || 0)}
                          </td>
                          <td className="text-right p-3 font-mono">
                            {product.quantity > 0 ? formatCurrency((product.revenue || 0) / product.quantity) : "0"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {topProducts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-4xl mb-2">📦</div>
                    <p>Không có dữ liệu sản phẩm trong kỳ báo cáo này</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ReportsPage;