import { useState, useCallback, useMemo } from "react";
import ReportOverviewDetails from "@/components/reports/ReportOverviewDetails";
import ReportSalesDetails from "@/components/reports/ReportSalesDetails";
import ReportFinancialDetails from "@/components/reports/ReportFinancialDetails";
import ReportCustomerDetails from "@/components/reports/ReportCustomerDetails";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Download, TrendingUp, TrendingDown, BarChart3, PieChart, Users, ShoppingCart, Plus, DollarSign, Package, CheckCircle, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  // Fetch all required data with optimized caching
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["transactions-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("date", {
        ascending: true
      });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
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
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["customers-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
  
  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: orderPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["order-payments-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_payments").select("*").order("payment_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Batch fetch all products data needed for cost calculations
  const getAllProductIdentifiers = useCallback(() => {
    const productIds = new Set<string>();
    const productSkus = new Set<string>();
    
    orders.forEach(order => {
      if (order.items) {
        try {
          const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
          orderItems.forEach((item: any) => {
            if (item.originalProductId || item.id) {
              productIds.add(item.originalProductId || item.id);
            }
            if (item.sku) {
              productSkus.add(item.sku);
            }
          });
        } catch (error) {
          console.error('Error parsing order items:', error);
        }
      }
    });
    
    return { productIds: Array.from(productIds), productSkus: Array.from(productSkus) };
  }, [orders]);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products-batch-reports', getAllProductIdentifiers()],
    queryFn: async () => {
      const { productIds, productSkus } = getAllProductIdentifiers();
      
      if (productIds.length === 0 && productSkus.length === 0) {
        return [];
      }

      let allProducts: any[] = [];

      // Fetch by IDs
      if (productIds.length > 0) {
        const { data: idData } = await supabase
          .from('products')
          .select('id, sku, cost_price')
          .in('id', productIds);
        if (idData) allProducts = [...allProducts, ...idData];
      }

      // Fetch by SKUs for any missing products
      if (productSkus.length > 0) {
        const remainingSkus = productSkus.filter(sku => {
          return !allProducts.some(p => p.sku === sku);
        });
        
        if (remainingSkus.length > 0) {
          const { data: skuData } = await supabase
            .from('products')
            .select('id, sku, cost_price')
            .in('sku', remainingSkus);
          if (skuData) allProducts = [...allProducts, ...skuData];
        }
      }

      return allProducts;
    },
    enabled: orders.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Create products lookup map for fast access
  const productsMap = useMemo(() => {
    const map = new Map<string, any>();
    products.forEach(product => {
      map.set(product.id, product);
      if (product.sku) {
        map.set(product.sku, product);
      }
    });
    return map;
  }, [products]);

  // Check if data is still loading
  const isLoading = ordersLoading || expensesLoading || productsLoading || customersLoading || paymentsLoading;

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

  // Helper function to calculate order cost price synchronously
  const calculateOrderCostPrice = useCallback((order: any) => {
    let orderCostPrice = Number(order.cost_price) || 0;
    
    // If order cost_price is 0, calculate from items using cached products data
    if (orderCostPrice === 0 && order.items && productsMap.size > 0) {
      try {
        const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        
        orderCostPrice = orderItems.reduce((sum: number, item: any) => {
          const quantity = item.quantity || 0;
          let costPrice = 0;

          // Find cost price from products map
          let product = productsMap.get(item.originalProductId || item.id);
          if (!product && item.sku) {
            product = productsMap.get(item.sku);
          }
          
          if (product) {
            costPrice = Number(product.cost_price) || 0;
          }

          return sum + (quantity * costPrice);
        }, 0);
      } catch (error) {
        console.error('Error calculating cost price for order:', order.id, error);
      }
    }
    
    return orderCostPrice;
  }, [productsMap]);

  // Calculate comparison metrics with previous period
  const comparisonData = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return null;

    const daysDiff = differenceInDays(dateRange.to, dateRange.from);
    const previousFrom = new Date(dateRange.from);
    previousFrom.setDate(previousFrom.getDate() - daysDiff - 1);
    const previousTo = new Date(dateRange.from);
    previousTo.setDate(previousTo.getDate() - 1);

    const previousOrders = orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= previousFrom && orderDate <= previousTo;
    });

    const previousRevenue = previousOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const previousOrderCount = previousOrders.length;
    const previousCompletedOrders = previousOrders.filter(o => o.status === "delivered").length;

    return {
      previousRevenue,
      previousOrderCount,
      previousCompletedOrders,
    };
  }, [orders, dateRange]);

  // Optimized metrics calculation using useMemo
  const metricsData = useMemo(() => {
    const totalOrderRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    
    // Calculate total cost price synchronously
    const totalCostPrice = filteredOrders.reduce((sum, order) => {
      return sum + calculateOrderCostPrice(order);
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

    // Calculate comparison percentages
    const revenueChange = comparisonData?.previousRevenue ? 
      ((totalOrderRevenue - comparisonData.previousRevenue) / comparisonData.previousRevenue) * 100 : 0;
    const orderCountChange = comparisonData?.previousOrderCount ? 
      ((totalOrders - comparisonData.previousOrderCount) / comparisonData.previousOrderCount) * 100 : 0;
    const completedOrdersChange = comparisonData?.previousCompletedOrders ? 
      ((completedOrders - comparisonData.previousCompletedOrders) / comparisonData.previousCompletedOrders) * 100 : 0;

    return {
      totalOrderRevenue,
      totalCostPrice,
      totalExpensesAmount,
      actualPaidAmountTotal,
      remainingAmount,
      grossProfit,
      netProfit,
      completedOrders,
      pendingOrders,
      totalOrders,
      paidOrders,
      partialPaidOrders,
      unpaidOrders,
      newCustomers,
      totalCustomers,
      averageOrderValue,
      averageDailyRevenue,
      revenueChange,
      orderCountChange,
      completedOrdersChange,
    };
  }, [filteredOrders, filteredExpenses, filteredCustomers, deduplicatedCustomers, orderPayments, dateRange, calculateOrderCostPrice, comparisonData]);

  // Optimized monthly data calculation
  const monthlyData = useMemo(() => {
    if (!filteredOrders.length && !filteredExpenses.length) {
      return [];
    }

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
      
      // Calculate cost price synchronously using cached products data
      const totalCostPrice = monthOrders.reduce((sum, order) => {
        return sum + calculateOrderCostPrice(order);
      }, 0);
      
      const expensesAmount = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const ordersCount = monthOrders.length;
      const completedCount = monthOrders.filter(o => o.status === "delivered").length;
      
      const monthKey = format(currentMonth, "MMM yyyy", { locale: vi });
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
    return Array.from(monthlyDataMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredOrders, filteredExpenses, calculateOrderCostPrice]);

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
          {isLoading ? (
            // Skeleton loading
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-2" />
                    <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tổng doanh thu</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(metricsData.totalOrderRevenue)}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    {metricsData.revenueChange >= 0 ? (
                      <>
                        <ArrowUpRight className="h-3 w-3 text-green-600" />
                        <span className="text-green-600 font-medium">+{metricsData.revenueChange.toFixed(1)}%</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="h-3 w-3 text-red-600" />
                        <span className="text-red-600 font-medium">{metricsData.revenueChange.toFixed(1)}%</span>
                      </>
                    )}
                    <span className="text-muted-foreground">so với kỳ trước</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Đơn hoàn thành</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{metricsData.completedOrders}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span className="text-muted-foreground">
                      {metricsData.totalOrders > 0 ? Math.round((metricsData.completedOrders / metricsData.totalOrders) * 100) : 0}% lệ hoàn thành
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Đơn đang xử lý</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{metricsData.pendingOrders}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span className="text-muted-foreground">
                      {metricsData.totalOrders > 0 ? Math.round((metricsData.pendingOrders / metricsData.totalOrders) * 100) : 0}% đang xử lý
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Giá trị TB/đơn</CardTitle>
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-purple-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{formatCurrency(metricsData.averageOrderValue)}</div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span className="text-muted-foreground">Trung bình mỗi đơn</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Additional Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng đơn hàng</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metricsData.totalOrders}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  {metricsData.orderCountChange >= 0 ? (
                    <>
                      <ArrowUpRight className="h-3 w-3 text-green-600" />
                      <span className="text-green-600 font-medium">+{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="h-3 w-3 text-red-600" />
                      <span className="text-red-600 font-medium">{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  )}
                  <span className="text-muted-foreground">so với kỳ trước</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Giá vốn</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatCurrency(metricsData.totalCostPrice)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.totalCostPrice / metricsData.totalOrderRevenue) * 100) : 0}% của doanh thu
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận gộp</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(metricsData.grossProfit)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.grossProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận ròng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${metricsData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(metricsData.netProfit)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.netProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
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
                {isLoading || monthlyData.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="text-muted-foreground mb-2">
                        {isLoading ? "Đang tải dữ liệu..." : "Không có dữ liệu trong khoảng thời gian đã chọn"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-80 w-full mb-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyData} margin={{ top: 20, right: 30, left: 50, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis 
                            dataKey="month" 
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis yAxisId="currency" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}
                            formatter={(value, name) => {
                              if (name === "revenue") return [formatCurrency(Number(value)), "Doanh thu"];
                              if (name === "costPrice") return [formatCurrency(Number(value)), "Giá vốn"];
                              if (name === "expenses") return [formatCurrency(Number(value)), "Chi phí"];
                              if (name === "grossProfit") return [formatCurrency(Number(value)), "Lợi nhuận gộp"];
                              if (name === "profit") return [formatCurrency(Number(value)), "Lợi nhuận ròng"];
                              return [formatCurrency(Number(value)), name];
                            }} labelStyle={{
                              color: '#374151',
                              fontWeight: 'bold'
                            }} />
                          <Line yAxisId="currency" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{
                            fill: "#3b82f6",
                            strokeWidth: 2,
                            r: 5
                          }} activeDot={{
                            r: 8,
                            stroke: "#3b82f6",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Doanh thu" />
                          <Line yAxisId="currency" type="monotone" dataKey="costPrice" stroke="#f59e0b" strokeWidth={2} dot={{
                            fill: "#f59e0b",
                            strokeWidth: 2,
                            r: 4
                          }} activeDot={{
                            r: 6,
                            stroke: "#f59e0b",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Giá vốn" />
                          <Line yAxisId="currency" type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{
                            fill: "#ef4444",
                            strokeWidth: 2,
                            r: 4
                          }} activeDot={{
                            r: 6,
                            stroke: "#ef4444",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Chi phí" />
                          <Line yAxisId="currency" type="monotone" dataKey="grossProfit" stroke="#059669" strokeWidth={3} dot={{
                            fill: "#059669",
                            strokeWidth: 2,
                            r: 5
                          }} activeDot={{
                            r: 8,
                            stroke: "#059669",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="grossProfit" />
                          <Line yAxisId="currency" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{
                            fill: "#10b981",
                            strokeWidth: 2,
                            r: 5
                          }} activeDot={{
                            r: 8,
                            stroke: "#10b981",
                            strokeWidth: 2,
                            fill: "white"
                          }} name="Lợi nhuận ròng" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Data Table */}
                    <div className="border rounded-lg">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-t-lg border-b">
                        <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                          📊 Chi tiết tất cả các tháng
                        </h3>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-white">
                            <TableRow>
                              <TableHead className="font-semibold">Tháng</TableHead>
                              <TableHead className="font-semibold text-right">💰 Doanh thu</TableHead>
                              <TableHead className="font-semibold text-right">🏷️ Giá vốn</TableHead>
                              <TableHead className="font-semibold text-right">💳 Chi phí</TableHead>
                              <TableHead className="font-semibold text-right">📊 Lợi nhuận gộp</TableHead>
                              <TableHead className="font-semibold text-right">📈 Lợi nhuận ròng</TableHead>
                              <TableHead className="font-semibold text-right">📦 Đơn hàng</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monthlyData.map((data, index) => (
                              <TableRow key={index} className="hover:bg-gray-50">
                                <TableCell className="font-medium">{data.month}</TableCell>
                                <TableCell className="text-right font-semibold text-blue-600">
                                  {formatCurrency(data.revenue)}
                                </TableCell>
                                <TableCell className="text-right font-medium text-orange-600">
                                  {formatCurrency(data.costPrice)}
                                </TableCell>
                                <TableCell className="text-right font-medium text-red-600">
                                  {formatCurrency(data.expenses)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-emerald-600">
                                  {formatCurrency(data.grossProfit)}
                                </TableCell>
                                <TableCell className={`text-right font-bold ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(data.profit)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{data.orders}</span>
                                    <span className="text-xs text-gray-500">({data.completed} hoàn thành)</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed sections */}
          <ReportOverviewDetails filteredOrders={filteredOrders} formatCurrency={formatCurrency} />
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tổng đơn hàng</CardTitle>
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metricsData.totalOrders}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  {metricsData.orderCountChange >= 0 ? (
                    <>
                      <ArrowUpRight className="h-3 w-3 text-green-600" />
                      <span className="text-green-600 font-medium">+{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="h-3 w-3 text-red-600" />
                      <span className="text-red-600 font-medium">{metricsData.orderCountChange.toFixed(1)}%</span>
                    </>
                  )}
                  <span className="text-muted-foreground">so với kỳ trước</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Đơn hoàn thành</CardTitle>
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{metricsData.completedOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrders > 0 ? Math.round((metricsData.completedOrders / metricsData.totalOrders) * 100) : 0}% tỷ lệ hoàn thành
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Đơn đang xử lý</CardTitle>
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">{metricsData.pendingOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metricsData.totalOrders > 0 ? Math.round((metricsData.pendingOrders / metricsData.totalOrders) * 100) : 0}% đang xử lý
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Giá trị TB/đơn</CardTitle>
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Package className="h-5 w-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{formatCurrency(metricsData.averageOrderValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Trung bình mỗi đơn</p>
              </CardContent>
            </Card>
          </div>

          {/* Orders Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Thống kê đơn hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {metricsData.totalOrders > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={[
                        { name: "Hoàn thành", value: metricsData.completedOrders, fill: "#10b981" },
                        { name: "Đang xử lý", value: metricsData.pendingOrders, fill: "#f59e0b" },
                        { name: "Khác", value: Math.max(0, metricsData.totalOrders - metricsData.completedOrders - metricsData.pendingOrders), fill: "#6b7280" }
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {[
                        { name: "Hoàn thành", value: metricsData.completedOrders, fill: "#10b981" },
                        { name: "Đang xử lý", value: metricsData.pendingOrders, fill: "#f59e0b" },
                        { name: "Khác", value: Math.max(0, metricsData.totalOrders - metricsData.completedOrders - metricsData.pendingOrders), fill: "#6b7280" }
                      ].filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, 'Đơn hàng']} />
                  </RechartsPieChart>
                </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Chưa có dữ liệu đơn hàng
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Detailed sales sections */}
          <ReportSalesDetails filteredOrders={filteredOrders} monthlyData={monthlyData} formatCurrency={formatCurrency} />
        </TabsContent>

        <TabsContent value="financial" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng doanh thu</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(metricsData.totalOrderRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(metricsData.averageDailyRevenue)}/ngày
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Chi phí</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(metricsData.totalExpensesAmount)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận gộp</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(metricsData.grossProfit)}</div>
                <p className="text-xs text-muted-foreground">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.grossProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lợi nhuận ròng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${metricsData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(metricsData.netProfit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {metricsData.totalOrderRevenue > 0 ? Math.round((metricsData.netProfit / metricsData.totalOrderRevenue) * 100) : 0}% tỷ suất
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Financial Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Doanh thu vs Chi phí</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: "Doanh thu", value: metricsData.totalOrderRevenue, fill: "#10b981" },
                      { name: "Giá vốn", value: metricsData.totalCostPrice, fill: "#f59e0b" },
                      { name: "Chi phí", value: metricsData.totalExpensesAmount, fill: "#ef4444" }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                       <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cơ cấu tài chính</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Doanh thu", value: metricsData.totalOrderRevenue, fill: "#10b981" },
                          { name: "Giá vốn", value: metricsData.totalCostPrice, fill: "#f59e0b" },
                          { name: "Chi phí", value: metricsData.totalExpensesAmount, fill: "#ef4444" }
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label
                      >
                        {[
                          { name: "Doanh thu", value: metricsData.totalOrderRevenue, fill: "#10b981" },
                          { name: "Giá vốn", value: metricsData.totalCostPrice, fill: "#f59e0b" },
                          { name: "Chi phí", value: metricsData.totalExpensesAmount, fill: "#ef4444" }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Tình trạng thanh toán</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{metricsData.paidOrders}</div>
                  <div className="text-sm text-green-700">Đã thanh toán</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{metricsData.partialPaidOrders}</div>
                  <div className="text-sm text-yellow-700">Thanh toán một phần</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{metricsData.unpaidOrders}</div>
                  <div className="text-sm text-red-700">Chưa thanh toán</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed financial sections */}
          <ReportFinancialDetails
            filteredOrders={filteredOrders}
            filteredExpenses={filteredExpenses}
            orderPayments={orderPayments}
            monthlyData={monthlyData}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng khách hàng</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metricsData.totalCustomers}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Khách hàng mới</CardTitle>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{metricsData.newCustomers}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Doanh thu/Khách hàng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(metricsData.totalCustomers > 0 ? metricsData.totalOrderRevenue / metricsData.totalCustomers : 0)}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tỷ lệ tăng trưởng</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {metricsData.totalCustomers > 0 ? Math.round((metricsData.totalCustomers / (metricsData.totalCustomers - metricsData.newCustomers + 1)) * 100 - 100) : 0}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Customers Table */}
          <Card>
            <CardHeader>
              <CardTitle>Khách hàng gần đây</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên khách hàng</TableHead>
                      <TableHead>Mã khách hàng</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Tổng đơn hàng</TableHead>
                      <TableHead>Tổng giá trị</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.slice(0, 10).map((customer) => {
                      const customerOrders = filteredOrders.filter(o => o.customers?.id === customer.id);
                      const totalValue = customerOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
                      
                      return (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell>{customer.customer_code}</TableCell>
                          <TableCell>{format(new Date(customer.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{customerOrders.length}</TableCell>
                          <TableCell>{formatCurrency(totalValue)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Detailed customer sections */}
          <ReportCustomerDetails
            filteredOrders={filteredOrders}
            customers={customers}
            formatCurrency={formatCurrency}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportsPage;