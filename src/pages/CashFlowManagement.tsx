import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Plus, Filter, Search, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { CreateExpenseForm } from "@/components/CreateExpenseForm";
import { EditExpenseDialog } from "@/components/EditExpenseDialog";
import { DeleteExpenseDialog } from "@/components/DeleteExpenseDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

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

export default function CashFlowManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
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

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
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

  const loadProfitStats = async () => {
    try {
      // Load orders for revenue and cost price (only delivered orders)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('total_amount, cost_price')
        .eq('status', 'delivered');

      if (ordersError) {
        console.error('Error loading orders:', ordersError);
      }

      // Load expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('amount');

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
        netProfit
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
  }, []);

  const handleCreateExpense = () => {
    loadExpenses();
    loadProfitStats();
    setShowCreateForm(false);
    toast({
      title: "Thành công",
      description: "Chi phí đã được tạo thành công",
    });
  };

  const handleEditExpense = () => {
    loadExpenses();
    loadProfitStats();
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

  // Calculate stats based on profit calculations
  const stats = [
    {
      title: "Tổng doanh thu",
      value: `${profitStats.totalRevenue.toLocaleString()} ₫`,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      change: "tăng",
      changePercent: "0",
    },
    {
      title: "Tổng chi phí",
      value: `${profitStats.totalExpenses.toLocaleString()} ₫`,
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      change: "giảm",
      changePercent: "0",
    },
    {
      title: "Giá gốc sản phẩm",
      value: `${profitStats.totalCostPrice.toLocaleString()} ₫`,
      icon: DollarSign,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      change: "ổn định",
      changePercent: "0",
    },
    {
      title: "Lợi nhuận ròng",
      value: `${profitStats.netProfit.toLocaleString()} ₫`,
      icon: Calendar,
      color: profitStats.netProfit >= 0 ? "text-green-600" : "text-red-600",
      bgColor: profitStats.netProfit >= 0 ? "bg-green-50" : "bg-red-50",
      change: profitStats.netProfit >= 0 ? "tăng" : "giảm",
      changePercent: "0",
    },
  ];


  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Quản lý Chi phí & Lợi nhuận</h2>
        <div className="flex items-center space-x-2">
          <Button onClick={() => setShowCreateForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Thêm chi phí
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`h-8 w-8 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <span className={stat.change === "tăng" ? "text-green-600" : "text-red-600"}>
                  {stat.change === "tăng" ? "↗" : "↘"} {stat.changePercent}%
                </span>
                <span className="ml-1">so với tháng trước</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Profit Formula Explanation */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Công thức tính Lợi nhuận</h3>
              <div className="text-blue-800 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Lợi nhuận ròng</span>
                  <span>=</span>
                  <span className="text-green-600 font-medium">Tổng doanh thu</span>
                  <span>-</span>
                  <span className="text-blue-600 font-medium">Giá gốc sản phẩm</span>
                  <span>-</span>
                  <span className="text-red-600 font-medium">Tổng chi phí</span>
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  = {profitStats.totalRevenue.toLocaleString()} ₫ - {profitStats.totalCostPrice.toLocaleString()} ₫ - {profitStats.totalExpenses.toLocaleString()} ₫ = <span className={profitStats.netProfit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>{profitStats.netProfit.toLocaleString()} ₫</span>
                </div>
              </div>
            </div>
            <div className="text-3xl">📊</div>
          </div>
        </CardContent>
      </Card>

      {/* Finance Records Table */}
      <Card className="animate-scale-in">
        <CardHeader>
          <CardTitle>Danh sách Chi phí</CardTitle>
          <CardDescription>
            Quản lý chi phí và tính toán lợi nhuận doanh nghiệp
          </CardDescription>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
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
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Loại chi phí</TableHead>
                  <TableHead>Người chi</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead>Số tiền</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="ml-2">Đang tải...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <DollarSign className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchTerm ? "Không tìm thấy chi phí nào" : "Chưa có chi phí nào"}
                        </p>
                        {!searchTerm && (
                          <Button onClick={() => setShowCreateForm(true)} variant="outline" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Thêm chi phí đầu tiên
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenses.map((expense) => (
                    <TableRow key={expense.id} className="hover-scale">
                      <TableCell>{formatSafeDate(expense.expense_date)}</TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-800">
                          {expense.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{expense.person_name || "—"}</div>
                      </TableCell>
                      <TableCell>{expense.description || "—"}</TableCell>
                      <TableCell>
                        <span className="text-red-600 font-semibold">
                          -{expense.amount.toLocaleString()} ₫
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <DollarSign className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white z-50">
                            <DropdownMenuItem onClick={() => setSelectedExpense(expense)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Xem chi tiết
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setExpenseToEdit(expense)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Chỉnh sửa
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