import { useState, useEffect, useCallback, useMemo } from "react";
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
    from: new Date(2020, 0, 1),
    to: endOfDay(new Date())
  });
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch all required data
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("date", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  
  const { data: orders = [] } = useQuery({
    queryKey: ["orders-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(`
          *,
          customers (
            id,
            name,
            customer_code
          )
        `).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });
  
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });
  
  const { data: products = [] } = useQuery({
    queryKey: ["products-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return data;
    }
  });
  
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const { data: orderPayments = [] } = useQuery({
    queryKey: ["order-payments-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_payments").select("*").order("payment_date", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // Filter data based on date range
  const filteredOrders = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return orders;
    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= dateRange.from! && orderDate <= dateRange.to!;
    });
  }, [orders, dateRange]);

  const filteredCustomers = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return customers;
    return customers.filter(customer => {
      const customerDate = new Date(customer.created_at);
      return customerDate >= dateRange.from! && customerDate <= dateRange.to!;
    });
  }, [customers, dateRange]);

  const filteredExpenses = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return expenses;
    return expenses.filter(expense => {
      const expenseDate = new Date(expense.expense_date);
      return expenseDate >= dateRange.from! && expenseDate <= dateRange.to!;
    });
  }, [expenses, dateRange]);

  const filteredPayments = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return orderPayments;
    return orderPayments.filter(payment => {
      const paymentDate = new Date(payment.payment_date);
      return paymentDate >= dateRange.from! && paymentDate <= dateRange.to!;
    });
  }, [orderPayments, dateRange]);

  // Deduplicated customers to avoid counting the same customer multiple times
  const deduplicatedCustomers = useMemo(() => {
    const seen = new Set();
    return customers.filter(customer => {
      if (seen.has(customer.id)) return false;
      seen.add(customer.id);
      return true;
    });
  }, [customers]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Calculate metrics
  const totalOrderRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  
  const totalCostPrice = filteredOrders.reduce((sum, order) => {
    const orderCostPrice = Number(order.cost_price) || 0;
    return sum + orderCostPrice;
  }, 0);
  
  const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Calculate actual paid amount - only from payments related to filtered orders
  const filteredOrderIds = new Set(filteredOrders.map(o => o.id));
  const paymentsForFilteredOrders = orderPayments.filter(p => p.order_id && filteredOrderIds.has(p.order_id));
  const actualPaidAmountTotal = paymentsForFilteredOrders.reduce((sum, p) => sum + Number(p.payment_amount || 0), 0);

  const totalOrderAmount = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const remainingAmount = Math.max(0, totalOrderAmount - actualPaidAmountTotal);

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

  const averageOrderValue = totalOrders > 0 ? totalOrderRevenue / totalOrders : 0;
  const averageDailyRevenue = dateRange?.from && dateRange?.to ? totalOrderRevenue / Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1) : 0;

  // Monthly data calculation - simplified
  const [monthlyData, setMonthlyData] = useState<Array<{
    month: string;
    revenue: number;
    costPrice: number;
    expenses: number;
    grossProfit: number;
    profit: number;
    orders: number;
    completed: number;
    sortKey: string;
  }>>([]);

  // Monthly data calculation using EXACT same logic as CashFlowManagement
  const calculateSimpleMonthlyData = useCallback(async () => {
    if (!filteredOrders.length && !filteredExpenses.length) {
      setMonthlyData([]);
      return;
    }

    console.log('=== DEBUG: Starting monthly data calculation (CashFlow logic) ===');
    console.log('Filtered orders:', filteredOrders.length);

    const monthlyDataMap = new Map();
    
    // Get all unique months from filtered orders and expenses
    const allDates = [
      ...filteredOrders.map(o => new Date(o.created_at)),
      ...filteredExpenses.map(e => new Date(e.expense_date))
    ];
    
    // Find the earliest date to start from
    const earliestDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date();
    const startDate = startOfMonth(earliestDate);
    const endDate = endOfMonth(new Date());
    
    // Generate data for all months from earliest to current
    let currentMonth = startDate;
    while (currentMonth <= endDate) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const monthOrders = filteredOrders.filter(o => {
        const oDate = new Date(o.created_at);
        return oDate >= monthStart && oDate <= monthEnd;
      });
      
      const monthExpenses = filteredExpenses.filter(e => {
        const eDate = new Date(e.expense_date);
        return eDate >= monthStart && eDate <= monthEnd;
      });
      
      const revenue = monthOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      
      // Calculate cost price using EXACT CashFlowManagement logic
      let totalCostPrice = 0;
      const monthKey = format(currentMonth, "MMM yyyy", { locale: vi });
      
      console.log(`\n=== DEBUG: Processing ${monthKey} ===`);
      console.log('Month orders:', monthOrders.length);
      
      for (const order of monthOrders) {
        let orderCostPrice = Number(order.cost_price) || 0;
        
        console.log(`Order ${order.order_number}: stored cost_price = ${orderCostPrice}`);
        
        // Nếu cost_price trong order bằng 0, tính từ product data (same as CashFlow)
        if (orderCostPrice === 0 && order.items) {
          try {
            const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            
            // Lấy tất cả product IDs và SKUs từ order items
            const productIds = orderItems.map((item: any) => item.originalProductId || item.id).filter((id: any) => id);
            const productSkus = orderItems.map((item: any) => item.sku).filter((sku: any) => sku);

            let productsData: any[] = [];

            // Lấy dữ liệu sản phẩm từ database
            if (productIds.length > 0) {
              const { data: idData } = await supabase
                .from('products')
                .select('id, sku, cost_price')
                .in('id', productIds);
              if (idData) productsData = idData;
            }

            if (productsData.length === 0 && productSkus.length > 0) {
              const { data: skuData } = await supabase
                .from('products')
                .select('id, sku, cost_price')
                .in('sku', productSkus);
              if (skuData) productsData = skuData;
            }

            // Tính cost price từ order items
            orderCostPrice = orderItems.reduce((sum: number, item: any) => {
              const quantity = item.quantity || 0;
              let costPrice = 0;

              // Tìm cost price từ products data
              let product = productsData.find(p => p.id === (item.originalProductId || item.id));
              if (!product && item.sku) {
                product = productsData.find(p => p.sku === item.sku);
              }
              
              if (product) {
                costPrice = Number(product.cost_price) || 0;
              }

              console.log(`Item ${item.sku || item.id}: qty=${quantity}, unit_cost=${costPrice}, total=${quantity * costPrice}`);
              return sum + (quantity * costPrice);
            }, 0);
            
            console.log(`Calculated cost_price for order ${order.order_number}: ${orderCostPrice}`);
          } catch (error) {
            console.error('Error calculating cost price for order:', order.id, error);
          }
        }
        
        totalCostPrice += orderCostPrice;
      }
      
      console.log(`Total cost price for ${monthKey}: ${totalCostPrice}`);
      
      const expensesAmount = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const ordersCount = monthOrders.length;
      const completedCount = monthOrders.filter(o => o.status === "delivered").length;
      
      const monthKeySort = format(currentMonth, "yyyy-MM");
      monthlyDataMap.set(monthKeySort, {
        month: monthKey,
        revenue,
        costPrice: totalCostPrice,
        expenses: expensesAmount,
        grossProfit: revenue - totalCostPrice,
        profit: revenue - totalCostPrice - expensesAmount,
        orders: ordersCount,
        completed: completedCount,
        sortKey: monthKeySort
      });
      
      // Move to next month
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    }
    
    // Convert to array and sort by date
    const sortedData = Array.from(monthlyDataMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    console.log('=== DEBUG: Final monthly data ===', sortedData);
    setMonthlyData(sortedData);
  }, [filteredOrders, filteredExpenses]);

  // Recalculate when filtered data changes
  useEffect(() => {
    calculateSimpleMonthlyData();
  }, [calculateSimpleMonthlyData]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-3xl font-bold">Báo cáo & Thống kê</h1>
        <div className="flex flex-col md:flex-row gap-3">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Xuất báo cáo
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="sales">Bán hàng</TabsTrigger>
          <TabsTrigger value="financial">Tài chính</TabsTrigger>
          <TabsTrigger value="customers">Khách hàng</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng doanh thu</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalOrderRevenue)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận ròng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(netProfit)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng đơn hàng</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalOrders}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Khách hàng mới</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{newCustomers}</div>
              </CardContent>
            </Card>
          </div>

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
                        <LineChart data={monthlyData} margin={{
                        top: 20,
                        right: 60,
                        left: 20,
                        bottom: 5
                      }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.2} />
                        <XAxis dataKey="month" stroke="hsl(var(--foreground))" fontSize={14} fontWeight="500" tick={{
                        fill: "hsl(var(--foreground))"
                      }} />
                        <YAxis yAxisId="currency" stroke="hsl(var(--foreground))" fontSize={14} fontWeight="500" tick={{
                        fill: "hsl(var(--foreground))"
                      }} tickFormatter={value => `${(value / 1000000).toFixed(1)}M`} />
                        <YAxis yAxisId="orders" orientation="right" stroke="hsl(var(--warning))" fontSize={14} fontWeight="500" tick={{
                        fill: "hsl(var(--warning))"
                      }} />
                        <Tooltip contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "2px solid hsl(var(--border))",
                        borderRadius: "12px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        fontSize: "14px",
                        fontWeight: "500"
                        }} formatter={(value: number, name: string) => {
                          if (name === "orders") return [value, "Tổng đơn hàng"];
                          if (name === "revenue") return [formatCurrency(value), "Doanh thu"];
                          if (name === "costPrice") return [formatCurrency(value), "Giá vốn"];
                          if (name === "expenses") return [formatCurrency(value), "Chi phí"];
                          if (name === "grossProfit") return [formatCurrency(value), "Lợi nhuận gộp"];
                          if (name === "profit") return [formatCurrency(value), "Lợi nhuận ròng"];
                          return [formatCurrency(value), name];
                        }} labelStyle={{
                        color: "hsl(var(--foreground))",
                        fontWeight: "600"
                      }} />
                         <Line yAxisId="currency" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={4} dot={{
                         fill: "hsl(var(--primary))",
                         strokeWidth: 2,
                         r: 6
                       }} activeDot={{
                         r: 8,
                         stroke: "hsl(var(--primary))",
                         strokeWidth: 3,
                         fill: "white"
                       }} name="Doanh thu" />
                         <Line yAxisId="currency" type="monotone" dataKey="costPrice" stroke="#f59e0b" strokeWidth={3} dot={{
                         fill: "#f59e0b",
                         strokeWidth: 2,
                         r: 5
                       }} activeDot={{
                         r: 7,
                         stroke: "#f59e0b",
                         strokeWidth: 2,
                         fill: "white"
                       }} name="costPrice" />
                         <Line yAxisId="currency" type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={3} dot={{
                         fill: "hsl(var(--destructive))",
                         strokeWidth: 2,
                         r: 5
                       }} activeDot={{
                         r: 7,
                         stroke: "hsl(var(--destructive))",
                         strokeWidth: 2,
                         fill: "white"
                       }} name="Chi phí" />
                         <Line yAxisId="currency" type="monotone" dataKey="grossProfit" stroke="#059669" strokeWidth={3} dot={{
                         fill: "#059669",
                         strokeWidth: 2,
                         r: 5
                       }} activeDot={{
                         r: 7,
                         stroke: "#059669",
                         strokeWidth: 2,
                         fill: "white"
                       }} name="grossProfit" />
                         <Line yAxisId="currency" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{
                         fill: "#10b981",
                         strokeWidth: 2,
                         r: 5
                       }} activeDot={{
                         r: 7,
                         stroke: "#10b981",
                         strokeWidth: 2,
                         fill: "white"
                       }} name="Lợi nhuận ròng" />
                        <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="hsl(var(--warning))" strokeWidth={3} dot={{
                        fill: "hsl(var(--warning))",
                        strokeWidth: 2,
                        r: 5
                      }} activeDot={{
                        r: 7,
                        stroke: "hsl(var(--warning))",
                        strokeWidth: 2,
                        fill: "white"
                      }} name="orders" />
                      </LineChart>
                    </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Data Table */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                      📊 Chi tiết tất cả các tháng
                    </h4>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                      {monthlyData.map((data, index) => 
                        <div key={index} className="bg-muted/30 rounded-lg p-3 space-y-2 border">
                          <div className="font-medium text-sm text-center">{data.month}</div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">💰 Doanh thu:</span>
                              <span className="font-medium text-primary">{formatCurrency(data.revenue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">🏷️ Giá vốn:</span>
                              <span className="font-medium text-orange-600">{formatCurrency(data.costPrice)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">💸 Chi phí:</span>
                              <span className="font-medium text-destructive">{formatCurrency(data.expenses)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">📊 Lợi nhuận gộp:</span>
                              <span className="font-medium text-emerald-600">{formatCurrency(data.grossProfit)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">📈 Lợi nhuận ròng:</span>
                              <span className="font-medium text-green-600">{formatCurrency(data.profit)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                              <span className="text-muted-foreground">🛒 Đơn hàng:</span>
                              <span className="font-medium">{data.orders}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportsPage;