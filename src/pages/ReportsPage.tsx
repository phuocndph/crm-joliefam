import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Download, TrendingUp, TrendingDown, BarChart3, PieChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, LineChart, Line, Pie } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { vi } from "date-fns/locale";
import { DateRange } from "react-day-picker";

const ReportsPage = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [reportType, setReportType] = useState("overview");

  // Fetch data for reports
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
        .select("*")
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
        .select("*");
      
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

  // Calculate key metrics
  const totalRevenue = filteredTransactions
    .filter(t => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpenses = filteredTransactions
    .filter(t => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const netProfit = totalRevenue - totalExpenses;

  const completedOrders = filteredOrders.filter(o => o.status === "completed").length;
  const pendingOrders = filteredOrders.filter(o => o.status === "pending").length;
  const totalOrders = filteredOrders.length;

  // Prepare chart data
  const monthlyData = [];
  const currentDate = new Date();
  for (let i = 11; i >= 0; i--) {
    const month = subMonths(currentDate, i);
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    
    const monthTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= monthStart && tDate <= monthEnd;
    });

    const revenue = monthTransactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const expenses = monthTransactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    monthlyData.push({
      month: format(month, "MMM", { locale: vi }),
      revenue,
      expenses,
      profit: revenue - expenses
    });
  }

  // Category breakdown
  const categoryData = filteredTransactions
    .filter(t => t.category)
    .reduce((acc, t) => {
      const category = t.category!;
      if (!acc[category]) {
        acc[category] = { name: category, value: 0, count: 0 };
      }
      acc[category].value += Number(t.amount);
      acc[category].count += 1;
      return acc;
    }, {} as Record<string, { name: string; value: number; count: number }>);

  const categoryChartData = Object.values(categoryData);

  // Order status data
  const orderStatusData = [
    { name: "Hoàn thành", value: completedOrders, color: "#10b981" },
    { name: "Đang xử lý", value: pendingOrders, color: "#f59e0b" },
    { name: "Khác", value: totalOrders - completedOrders - pendingOrders, color: "#6b7280" }
  ].filter(item => item.value > 0);

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
      totalRevenue,
      totalExpenses,
      netProfit,
      totalOrders,
      completedOrders,
      totalCustomers: customers.length,
      monthlyData,
      categoryData: categoryChartData
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Báo cáo & Thống kê</h1>
          <p className="text-muted-foreground">Phân tích hiệu suất kinh doanh và xu hướng</p>
        </div>
        <Button onClick={exportReport}>
          <Download className="w-4 h-4 mr-2" />
          Xuất báo cáo
        </Button>
      </div>

      {/* Date Range and Quick Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc thời gian</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <DatePickerWithRange date={dateRange} setDate={setDateRange} />
            <div className="flex gap-2">
              {quickDateRanges.map((range, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setDateRange(range.range)}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Doanh thu</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredTransactions.filter(t => t.type === "income").length} giao dịch
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chi phí</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredTransactions.filter(t => t.type === "expense").length} giao dịch
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lợi nhuận ròng</CardTitle>
            <BarChart3 className={`h-4 w-4 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              Tỷ lệ lợi nhuận: {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Đơn hàng</CardTitle>
            <PieChart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">
              {completedOrders} hoàn thành ({totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue & Expenses */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Xu hướng doanh thu và chi phí theo tháng</CardTitle>
            <CardDescription>So sánh doanh thu, chi phí và lợi nhuận trong 12 tháng qua</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), ""]}
                  labelFormatter={(label) => `Tháng ${label}`}
                />
                <Bar dataKey="revenue" fill="#10b981" name="Doanh thu" />
                <Bar dataKey="expenses" fill="#ef4444" name="Chi phí" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Phân tích theo danh mục</CardTitle>
            <CardDescription>Phân bố chi tiêu theo các danh mục</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={categoryChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {categoryChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Order Status */}
        <Card>
          <CardHeader>
            <CardTitle>Trạng thái đơn hàng</CardTitle>
            <CardDescription>Phân bố trạng thái đơn hàng trong kỳ</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={orderStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {orderStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Profit Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Xu hướng lợi nhuận</CardTitle>
          <CardDescription>Biến động lợi nhuận ròng theo thời gian</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), "Lợi nhuận"]}
                labelFormatter={(label) => `Tháng ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey="profit" 
                stroke="#8884d8" 
                strokeWidth={3}
                dot={{ fill: '#8884d8', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;