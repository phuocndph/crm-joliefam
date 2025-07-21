import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Plus, Filter, Search, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateExpenseForm } from "@/components/CreateExpenseForm";
import { EditExpenseDialog } from "@/components/EditExpenseDialog";
import { DeleteExpenseDialog } from "@/components/DeleteExpenseDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";

const formatSafeDate = (dateValue: string | null | undefined, formatStr: string = "dd/MM/yyyy") => {
  if (!dateValue) {
    return "-";
  }
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return "-";
    }
    return format(date, formatStr);
  } catch (error) {
    return "-";
  }
};

interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  expense_date: string;
  person_name: string | null;
  expense_code: string;
  created_at: string;
}

interface Order {
  id: string;
  total_amount: number;
  cost_price: number;
  profit_before: number;
  profit_after: number;
}

interface ProfitStats {
  totalRevenue: number;
  totalCostPrice: number;
  totalExpenses: number;
  netProfit: number;
}

interface OrderProfitDetail {
  id: string;
  order_number: string;
  customer_name: string;
  date: string;
  total_amount: number;
  cost_price: number;
  profit_before: number;
  allocated_expenses: number;
  profit_after: number;
}

export default function CashFlowManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("month"); // month, year, custom
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orderProfits, setOrderProfits] = useState<OrderProfitDetail[]>([]);
  const [profitStats, setProfitStats] = useState<ProfitStats>({
    totalRevenue: 0,
    totalCostPrice: 0,
    totalExpenses: 0,
    netProfit: 0
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const filteredExpenses = expenses.filter(
    (expense) =>
      expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.person_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get date filter range
  const getDateRange = () => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    
    if (filterPeriod === "year") {
      return {
        start: startOfYear(new Date(year, 0)),
        end: endOfYear(new Date(year, 0))
      };
    } else {
      return {
        start: startOfMonth(new Date(year, month - 1)),
        end: endOfMonth(new Date(year, month - 1))
      };
    }
  };

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const dateRange = getDateRange();
      
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', dateRange.start.toISOString())
        .lte('expense_date', dateRange.end.toISOString())
        .order('expense_date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải dữ liệu chi phí",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOrderProfits = async () => {
    try {
      const dateRange = getDateRange();
      
      // Load delivered orders with customer info
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, 
          order_number, 
          total_amount, 
          cost_price, 
          profit_before, 
          profit_after,
          created_at,
          customers(name)
        `)
        .eq('status', 'delivered')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());

      if (ordersError) {
        console.error('Error loading orders:', ordersError);
        return;
      }

      // Calculate allocated expenses per order (simplified: total expenses / number of orders)
      const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
      const orderCount = orders?.length || 1;
      const allocatedExpensePerOrder = totalExpenses / orderCount;

      const orderProfitDetails: OrderProfitDetail[] = orders?.map(order => ({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customers?.name || "Khách hàng",
        date: order.created_at,
        total_amount: order.total_amount || 0,
        cost_price: order.cost_price || 0,
        profit_before: (order.total_amount || 0) - (order.cost_price || 0),
        allocated_expenses: allocatedExpensePerOrder,
        profit_after: (order.total_amount || 0) - (order.cost_price || 0) - allocatedExpensePerOrder
      })) || [];

      setOrderProfits(orderProfitDetails);
    } catch (error) {
      console.error('Error loading order profits:', error);
    }
  };

  const loadProfitStats = async () => {
    try {
      const dateRange = getDateRange();
      
      // Load orders for revenue and cost price (only delivered orders)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('total_amount, cost_price')
        .eq('status', 'delivered')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());

      if (ordersError) {
        console.error('Error loading orders:', ordersError);
      }

      // Load expenses in date range
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('amount')
        .gte('expense_date', dateRange.start.toISOString())
        .lte('expense_date', dateRange.end.toISOString());

      if (expensesError) {
        console.error('Error loading expenses:', expensesError);
      }

      // Calculate totals with proper null handling
      const totalRevenue = orders?.reduce((sum, order) => {
        return sum + (Number(order.total_amount) || 0);
      }, 0) || 0;
      
      const totalCostPrice = orders?.reduce((sum, order) => {
        return sum + (Number(order.cost_price) || 0);
      }, 0) || 0;
      
      const totalExpenses = expensesData?.reduce((sum, expense) => {
        return sum + (Number(expense.amount) || 0);
      }, 0) || 0;
      
      // Apply profit formula: Revenue - Cost Price - Expenses = Net Profit
      const netProfit = totalRevenue - totalCostPrice - totalExpenses;

      console.log('Profit Calculation:', {
        totalRevenue,
        totalCostPrice, 
        totalExpenses,
        netProfit,
        dateRange
      });

      setProfitStats({
        totalRevenue,
        totalCostPrice,
        totalExpenses,
        netProfit
      });
    } catch (error) {
      console.error('Error loading profit stats:', error);
    }
  };

  useEffect(() => {
    loadExpenses();
    loadProfitStats();
    loadOrderProfits();
  }, [selectedYear, selectedMonth, filterPeriod]);

  useEffect(() => {
    loadOrderProfits();
  }, [expenses]);

  const handleCreateExpense = () => {
    loadExpenses();
    loadProfitStats();
    loadOrderProfits();
    setShowCreateForm(false);
    toast({
      title: "Thành công",
      description: "Chi phí đã được tạo thành công",
    });
  };

  const handleEditExpense = () => {
    loadExpenses();
    loadProfitStats();
    loadOrderProfits();
    setExpenseToEdit(null);
    toast({
      title: "Thành công",
      description: "Chi phí đã được cập nhật",
    });
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseToDelete.id);

      if (error) throw error;

      loadExpenses();
      loadProfitStats();
      loadOrderProfits();
      setExpenseToDelete(null);
      toast({
        title: "Thành công",
        description: "Chi phí đã được xóa",
      });
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa chi phí",
        variant: "destructive",
      });
    }
  };

  // Calculate additional stats
  const profitBeforeExpenses = profitStats.totalRevenue - profitStats.totalCostPrice;
  const otherIncome = 0; // Placeholder for other income sources
  const cashFlow = profitStats.netProfit;

  const stats = [
    {
      title: "Doanh thu",
      value: `${profitStats.totalRevenue.toLocaleString()}₫`,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Chi phí",
      value: `${profitStats.totalExpenses.toLocaleString()}₫`,
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      title: "Lợi nhuận trước",
      value: `${profitBeforeExpenses.toLocaleString()}₫`,
      icon: DollarSign,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Lợi nhuận sau",
      value: `${profitStats.netProfit.toLocaleString()}₫`,
      icon: Calendar,
      color: profitStats.netProfit >= 0 ? "text-green-600" : "text-red-600",
      bgColor: profitStats.netProfit >= 0 ? "bg-green-50" : "bg-red-50",
    },
    {
      title: "Thu khác",
      value: `${otherIncome.toLocaleString()}₫`,
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Dòng tiền ròng",
      value: `${cashFlow.toLocaleString()}₫`,
      icon: DollarSign,
      color: cashFlow >= 0 ? "text-green-600" : "text-red-600",
      bgColor: cashFlow >= 0 ? "bg-green-50" : "bg-red-50",
    },
  ];


  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Quản lý dòng tiền</h2>
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Thêm thu chi
        </Button>
      </div>

      {/* Time Filter */}
      <div className="flex items-center gap-4">
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white z-50">
            <SelectItem value="month">Theo tháng</SelectItem>
            <SelectItem value="year">Theo năm</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white z-50">
            {[2024, 2025, 2026].map(year => (
              <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filterPeriod === "month" && (
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              {Array.from({length: 12}, (_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  Tháng {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats Cards - 6 cards in 3 columns */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat, index) => (
          <Card key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`h-8 w-8 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="text-lg font-bold mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two Section Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Section: Expense Management */}
        <Card className="border-2 border-blue-200 border-dashed">
          <CardHeader>
            <CardTitle className="text-center text-blue-600">🔸 Quản lý chi phí</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm chi phí..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Lọc
                </Button>
              </div>

              <div className="rounded-md border max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ngày</TableHead>
                      <TableHead className="text-xs">Loại</TableHead>
                      <TableHead className="text-xs">Người chi</TableHead>
                      <TableHead className="text-xs">Tiền</TableHead>
                      <TableHead className="text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-xs">Đang tải...</TableCell>
                      </TableRow>
                    ) : filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-xs text-muted-foreground">
                          Chưa có chi phí nào
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExpenses.slice(0, 5).map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="text-xs">{formatSafeDate(expense.expense_date)}</TableCell>
                          <TableCell className="text-xs">
                            <Badge className="bg-red-100 text-red-800 text-xs">
                              {expense.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{expense.person_name || "—"}</TableCell>
                          <TableCell className="text-xs text-red-600 font-semibold">
                            -{expense.amount.toLocaleString()}₫
                          </TableCell>
                          <TableCell className="text-xs">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-6 w-6 p-0">
                                  <DollarSign className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white z-50">
                                <DropdownMenuItem onClick={() => setSelectedExpense(expense)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Xem
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setExpenseToEdit(expense)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Sửa
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={() => setExpenseToDelete(expense)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Xóa
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Section: Profit Management */}
        <Card className="border-2 border-green-200 border-dashed">
          <CardHeader>
            <CardTitle className="text-center text-green-600">🔸 Quản lý lợi nhuận</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Công thức tính Lợi nhuận</h4>
                <div className="text-xs text-blue-800 space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Lợi nhuận ròng</span>
                    <span>=</span>
                    <span className="text-green-600 font-medium">Doanh thu</span>
                    <span>-</span>
                    <span className="text-blue-600 font-medium">Giá gốc</span>
                    <span>-</span>
                    <span className="text-red-600 font-medium">Chi phí</span>
                  </div>
                  <div className="text-xs text-blue-600">
                    = {profitStats.totalRevenue.toLocaleString()}₫ - {profitStats.totalCostPrice.toLocaleString()}₫ - {profitStats.totalExpenses.toLocaleString()}₫ = 
                    <span className={profitStats.netProfit >= 0 ? "text-green-600 font-bold ml-1" : "text-red-600 font-bold ml-1"}>
                      {profitStats.netProfit.toLocaleString()}₫
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {profitStats.netProfit.toLocaleString()}₫
                </div>
                <div className="text-sm text-muted-foreground">Lợi nhuận hiện tại</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profit Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết lợi nhuận</CardTitle>
          <CardDescription>Lợi nhuận chi tiết theo từng đơn hàng</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đơn hàng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Doanh thu</TableHead>
                  <TableHead>Giá sản xuất</TableHead>
                  <TableHead>Lợi nhuận trước</TableHead>
                  <TableHead>Chi phí phân bổ</TableHead>
                  <TableHead>Lợi nhuận sau</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderProfits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Chưa có đơn hàng nào trong khoảng thời gian đã chọn
                    </TableCell>
                  </TableRow>
                ) : (
                  orderProfits.map((profit) => (
                    <TableRow key={profit.id}>
                      <TableCell className="font-medium">{profit.order_number}</TableCell>
                      <TableCell>{profit.customer_name}</TableCell>
                      <TableCell>{formatSafeDate(profit.date)}</TableCell>
                      <TableCell className="text-green-600 font-semibold">
                        ₫ {profit.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-blue-600 font-semibold">
                        ₫ {profit.cost_price.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-green-600 font-semibold">
                        ₫ {profit.profit_before.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-red-600 font-semibold">
                        ₫ {profit.allocated_expenses.toLocaleString()}
                      </TableCell>
                      <TableCell className={`font-semibold ${profit.profit_after >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ₫ {profit.profit_after.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Thêm chi phí mới</DialogTitle>
            <DialogDescription>
              Thêm chi phí vào hệ thống
            </DialogDescription>
          </DialogHeader>
          <CreateExpenseForm 
            onClose={() => setShowCreateForm(false)}
            onSubmit={handleCreateExpense}
          />
        </DialogContent>
      </Dialog>

      {expenseToEdit && (
        <EditExpenseDialog 
          expense={expenseToEdit}
          open={!!expenseToEdit}
          onOpenChange={(open) => !open && setExpenseToEdit(null)}
          onSubmit={handleEditExpense}
        />
      )}

      {expenseToDelete && (
        <DeleteExpenseDialog
          expense={expenseToDelete}
          open={!!expenseToDelete}
          onOpenChange={(open) => !open && setExpenseToDelete(null)}
          onConfirm={handleDeleteExpense}
        />
      )}

      {/* Expense Detail Dialog */}
      {selectedExpense && (
        <Dialog open={!!selectedExpense} onOpenChange={(open) => !open && setSelectedExpense(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Chi tiết chi phí</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Ngày chi phí</label>
                <p className="text-base">{formatSafeDate(selectedExpense.expense_date)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Loại chi phí</label>
                <div className="mt-1">
                  <Badge className="bg-red-100 text-red-800">
                    {selectedExpense.category}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Người chi</label>
                <p className="text-base">{selectedExpense.person_name || "—"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Số tiền</label>
                <p className="text-lg font-semibold text-red-600">
                  -{selectedExpense.amount.toLocaleString()} ₫
                </p>
              </div>
              {selectedExpense.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Mô tả</label>
                  <p className="text-base">{selectedExpense.description}</p>
                </div>
              )}
              <div className="pt-4 border-t">
                <div>
                  <label className="text-sm font-medium text-gray-500">Mã chi phí</label>
                  <p className="text-base">{selectedExpense.expense_code}</p>
                </div>
                <div className="mt-2">
                  <label className="text-sm font-medium text-gray-500">Ngày tạo</label>
                  <p className="text-base">{formatSafeDate(selectedExpense.created_at, 'dd/MM/yyyy HH:mm')}</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}