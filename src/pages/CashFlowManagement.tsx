import React, { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, DollarSign, Plus, Filter, Search, Eye, Edit, Trash2, MoreHorizontal } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ManagerSelector } from "@/components/ManagerSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
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
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { getOrderDisplayNumber } from "@/lib/orderUtils";

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

interface OrderDetail {
  id: string;
  order_number: string;
  display_order_number?: string;
  total_amount: number;
  cost_price: number;
  profit_before: number;
  profit_after: number;
  created_at: string;
  items?: any;
  customers: { name: string } | null;
}

interface CashFlowStats {
  totalRevenue: number;
  totalCostPrice: number;
  totalExpenses: number;
  profitBefore: number;
  profitAfter: number;
  otherIncome: number;
  netCashFlow: number;
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
  const [filterPeriod, setFilterPeriod] = useState("month");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subYears(new Date(), 10),
    to: new Date()
  });
  const [activeTab, setActiveTab] = useState("profit");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  
  // Data states
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [orderProfits, setOrderProfits] = useState<OrderProfitDetail[]>([]);
  const [cashFlowStats, setCashFlowStats] = useState<CashFlowStats>({
    totalRevenue: 0,
    totalCostPrice: 0,
    totalExpenses: 0,
    profitBefore: 0,
    profitAfter: 0,
    otherIncome: 0,
    netCashFlow: 0
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const { role, loading: roleLoading } = useUserRole(user);
  const queryClient = useQueryClient();
  
  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUser();
  }, []);

  // Debug role
  useEffect(() => {
    console.log('Current user role:', role, 'Role loading:', roleLoading);
  }, [role, roleLoading]);

  // Quick date ranges
  const quickDateRanges = [
    {
      label: "Hôm nay",
      range: {
        from: startOfDay(new Date()),
        to: endOfDay(new Date())
      }
    },
    {
      label: "Từ trước đến nay",
      range: {
        from: subYears(new Date(), 10),
        to: new Date()
      }
    },
    {
      label: "Tháng này",
      range: {
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
      }
    },
    {
      label: "Năm này",
      range: {
        from: startOfYear(new Date()),
        to: endOfYear(new Date())
      }
    }
  ];

  // Utility functions
  const getDateRange = useCallback(() => {
    // Nếu filterPeriod là "custom" và có dateRange, sử dụng nó
    if (filterPeriod === "custom" && dateRange?.from && dateRange?.to) {
      return {
        start: startOfDay(dateRange.from),
        end: endOfDay(dateRange.to)
      };
    }
    
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
  }, [dateRange, selectedYear, selectedMonth, filterPeriod]);

  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return "0đ";
    return `${amount.toLocaleString()}đ`;
  };

  // Use React Query for expenses
  const { data: expensesData = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', selectedManagerId, selectedYear, selectedMonth, filterPeriod, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const dateRange = getDateRange();
      
      let expensesQuery = supabase
        .from('expenses')
        .select('*');

      if (selectedManagerId && selectedManagerId !== 'all') {
        expensesQuery = expensesQuery.eq('manager_id', selectedManagerId);
      }

      const { data, error } = await expensesQuery
        .gte('expense_date', dateRange.start.toISOString())
        .lte('expense_date', dateRange.end.toISOString())
        .order('expense_date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Use React Query for orders  
  const { data: ordersData = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['orders', selectedManagerId, selectedYear, selectedMonth, filterPeriod, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const dateRange = getDateRange();
      
      let ordersQuery = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          display_order_number,
          total_amount,
          cost_price,
          profit_before,
          profit_after,
          status,
          created_at,
          items,
          customers(name),
          manager_id
        `);

      if (selectedManagerId && selectedManagerId !== 'all') {
        ordersQuery = ordersQuery.eq('manager_id', selectedManagerId);
      }

      const { data, error } = await ordersQuery
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());

      if (error) throw error;
      return data || [];
    },
    staleTime: 0, // Don't cache to always get fresh data
    gcTime: 0, // Don't keep in memory to always refetch
  });

  // Real-time subscription for orders updates
  useEffect(() => {
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          refetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchOrders]);

  const calculateCashFlowStats = useCallback(async () => {
    // Tính từ đơn hàng đã giao (delivered orders) - tính giá gốc thực tế
    const deliveredOrders = orders.filter(order => order.total_amount > 0);
    
    const totalRevenue = deliveredOrders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    
    // Tính tổng giá gốc thực tế từ từng đơn hàng
    let totalCostPrice = 0;
    
    for (const order of deliveredOrders) {
      let orderCostPrice = Number(order.cost_price) || 0;
      
      // Nếu cost_price trong order bằng 0, tính từ product data
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

            return sum + (quantity * costPrice);
          }, 0);
        } catch (error) {
          console.error('Error calculating cost price for order:', order.id, error);
        }
      }
      
      totalCostPrice += orderCostPrice;
    }
    
    // Lợi nhuận trước = Doanh thu - Chi phí giá gốc
    const profitBefore = totalRevenue - totalCostPrice;
    
    // Lợi nhuận sau = Doanh thu - Chi phí giá gốc - Chi phí
    const profitAfter = totalRevenue - totalCostPrice - totalExpenses;
    
    const otherIncome = 0; // Thu nhập khác
    const netCashFlow = profitAfter + otherIncome;

    setCashFlowStats({
      totalRevenue,
      totalCostPrice,
      totalExpenses,
      profitBefore,
      profitAfter,
      otherIncome,
      netCashFlow
    });
  }, [orders, expenses]);

  const calculateOrderProfits = useCallback(async () => {
    // Hiển thị đơn hàng đã giao có doanh thu
    const deliveredOrders = orders.filter(order => order.total_amount > 0);

    const totalExpenses = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
    const orderCount = deliveredOrders.length || 1;
    const allocatedExpensePerOrder = totalExpenses / orderCount;

    console.log('=== DEBUG CHI PHÍ CHI TIẾT ===');
    console.log('Raw expenses:', expenses.slice(0, 3));
    expenses.forEach((exp, index) => {
      console.log(`Expense ${index}:`, {
        amount: exp.amount,
        type: typeof exp.amount,
        number: Number(exp.amount),
        description: exp.description
      });
    });
    console.log('totalExpenses calculation:', expenses.reduce((sum, exp) => {
      const val = Number(exp.amount) || 0;
      console.log(`  Adding: ${exp.amount} (${typeof exp.amount}) -> ${val}`);
      return sum + val;
    }, 0));
    console.log('totalExpenses final:', totalExpenses);
    console.log('orderCount:', orderCount);
    console.log('allocatedExpensePerOrder:', allocatedExpensePerOrder);
    console.log('===========================');

    // Tạo một promise array để lấy cost price cho từng đơn hàng
    const orderProfitPromises = deliveredOrders.map(async order => {
      const revenue = Number(order.total_amount) || 0;
      let totalCostPrice = Number(order.cost_price) || 0;

      // Nếu cost_price trong order bằng 0, tính từ product data
      if (totalCostPrice === 0 && order.items) {
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

          // Tính tổng cost price từ order items
          totalCostPrice = orderItems.reduce((sum: number, item: any) => {
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

            return sum + (quantity * costPrice);
          }, 0);
        } catch (error) {
          console.error('Error calculating cost price for order:', order.id, error);
        }
      }
      // Tính chi phí phân bổ đều cho mỗi đơn hàng
      const allocatedExpenseForOrder = allocatedExpensePerOrder;
      
      console.log(`Order ${order.order_number}: allocatedExpenseForOrder =`, allocatedExpenseForOrder);
      
      // Lợi nhuận trước = Doanh thu - Chi phí giá gốc
      const profitBefore = revenue - totalCostPrice;
      
      // Lợi nhuận sau = Doanh thu - Chi phí giá gốc - Chi phí phân bổ
      const profitAfter = revenue - totalCostPrice - allocatedExpenseForOrder;

      return {
        id: order.id,
        order_number: order.display_order_number || order.order_number,
        customer_name: order.customers?.name || "Khách hàng",
        date: order.created_at,
        total_amount: revenue,
        cost_price: totalCostPrice,
        profit_before: profitBefore,
        allocated_expenses: allocatedExpenseForOrder,
        profit_after: profitAfter
      };
    });

    // Đợi tất cả promises hoàn thành
    const orderProfitResults = await Promise.all(orderProfitPromises);
    setOrderProfits(orderProfitResults);
  }, [orders, expenses]);

  // Update local state when data changes
  useEffect(() => {
    setExpenses(expensesData);
    
    // Sort orders by display order number (largest to smallest)
    const sortedOrders = [...ordersData].sort((a, b) => {
      const aOrderNum = parseInt(getOrderDisplayNumber(a)) || 0;
      const bOrderNum = parseInt(getOrderDisplayNumber(b)) || 0;
      return bOrderNum - aOrderNum; // Descending order (largest first)
    });
    
    setOrders(sortedOrders);
    setLoading(expensesLoading || ordersLoading);
  }, [expensesData, ordersData, expensesLoading, ordersLoading]);

  // Optimize calculations with useMemo
  useEffect(() => {
    if (orders.length > 0 || expenses.length > 0) {
      // Use requestAnimationFrame to prevent blocking UI
      requestAnimationFrame(() => {
        calculateCashFlowStats();
        calculateOrderProfits();
      });
    }
  }, [orders, expenses]);

  // Event handlers
  const handleCreateExpense = async () => {
    await queryClient.invalidateQueries({ queryKey: ['expenses'] });
    setShowCreateForm(false);
    toast({
      title: "Thành công",
      description: "Chi phí đã được tạo thành công",
    });
  };

  const handleEditExpense = async () => {
    await queryClient.invalidateQueries({ queryKey: ['expenses'] });
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

      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
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

  // Filter expenses based on search term and date range
  const filteredExpenses = expenses.filter((expense) => {
    // Apply search term filter
    const matchesSearch = searchTerm.trim() === "" || (
      expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.person_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.expense_code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Apply date range filter
    const { start, end } = getDateRange();
    const expenseDate = new Date(expense.expense_date);
    const matchesDateRange = expenseDate >= start && expenseDate <= end;

    return matchesSearch && matchesDateRange;
  });

  // Cash flow statistics cards - hide profit stats for accountants
  const getVisibleStatsCards = () => {
    const allCards = [
      {
        title: "Doanh thu",
        value: formatCurrency(cashFlowStats.totalRevenue),
        icon: TrendingUp,
        color: "text-green-600"
      },
      {
        title: "Chi phí", 
        value: formatCurrency(cashFlowStats.totalExpenses),
        icon: TrendingDown,
        color: "text-red-600"
      },
      {
        title: "Lợi nhuận trước",
        value: formatCurrency(cashFlowStats.profitBefore),
        icon: DollarSign,
        color: "text-blue-600"
      },
      {
        title: "Lợi nhuận sau",
        value: formatCurrency(cashFlowStats.profitAfter),
        icon: DollarSign,
        color: cashFlowStats.profitAfter >= 0 ? "text-purple-600" : "text-red-600"
      },
      {
        title: "Thu khác",
        value: formatCurrency(cashFlowStats.otherIncome),
        icon: TrendingUp,
        color: "text-green-600"
      },
      {
        title: "Dòng tiền ròng",
        value: formatCurrency(cashFlowStats.netCashFlow),
        icon: DollarSign,
        color: cashFlowStats.netCashFlow >= 0 ? "text-green-600" : "text-red-600"
      }
    ];

    // Hide profit-related cards for accountants
    if (role === 'accountant') {
      return allCards.filter((_, index) => index === 0 || index === 1 || index === 4); // Only show Revenue, Expenses, and Other Income
    }
    
    return allCards;
  };

  const statsCards = getVisibleStatsCards();

  return (
    <main className="flex-1 container-responsive py-4 lg:py-6">
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Quản lý dòng tiền</h1>
            <p className="text-muted-foreground mt-1">
              Theo dõi thu chi, lợi nhuận và dòng tiền của doanh nghiệp
            </p>
          </div>
          <div className="flex items-center gap-2">
            {role === 'accountant' && (
              <ManagerSelector
                selectedManagerId={selectedManagerId}
                onManagerChange={setSelectedManagerId}
              />
            )}
            <Button onClick={() => setShowCreateForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Thêm thu chi
            </Button>
          </div>
        </div>

        {/* Time Filter */}
        <Card>
          <CardContent className="p-6 pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center space-x-3">
                 <Select onValueChange={(value) => {
                   const selectedRange = quickDateRanges.find(range => range.label === value);
                   if (selectedRange) {
                     setDateRange(selectedRange.range);
                     setFilterPeriod("custom");
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
                   setDate={(date) => {
                     setDateRange(date);
                     if (date?.from && date?.to) {
                       setFilterPeriod("custom");
                     }
                   }}
                   className="w-auto"
                 />
              </div>
              
              <div className="flex gap-4 items-center">
                 <Select value={filterPeriod} onValueChange={(value) => {
                   setFilterPeriod(value);
                   if (value !== "custom") {
                     setDateRange(undefined);
                   }
                 }}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Chọn khoảng thời gian" />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="month">Theo tháng</SelectItem>
                     <SelectItem value="year">Theo năm</SelectItem>
                     <SelectItem value="custom">Tùy chỉnh</SelectItem>
                  </SelectContent>
                </Select>

                 <Select value={selectedYear} onValueChange={(value) => {
                   setSelectedYear(value);
                   if (filterPeriod !== "custom") {
                     setDateRange(undefined);
                   }
                 }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2023, 2024, 2025, 2026].map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {filterPeriod === "month" && (
                  <Select value={selectedMonth} onValueChange={(value) => {
                    // Batch state updates to prevent multiple re-renders
                    setTimeout(() => {
                      setSelectedMonth(value);
                      setDateRange(undefined);
                    }, 0);
                  }}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 12}, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          Tháng {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statsCards.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  <div>
                    <p className="text-sm text-gray-600">{stat.title}</p>
                    <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs for Expense and Profit Management */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="expenses">Quản lý chi phí</TabsTrigger>
            <TabsTrigger value="profit">Quản lý lợi nhuận</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses" className="space-y-6">
            {/* Expense Management Content */}
            <Card>
              <CardHeader>
                <CardTitle>Danh sách chi phí</CardTitle>
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

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mã chi phí</TableHead>
                          <TableHead>Ngày</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead>Người chi</TableHead>
                          <TableHead>Mô tả</TableHead>
                          <TableHead>Số tiền</TableHead>
                          <TableHead>Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-4">Đang tải...</TableCell>
                          </TableRow>
                        ) : filteredExpenses.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                              Chưa có chi phí nào trong khoảng thời gian đã chọn
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredExpenses.map((expense) => (
                            <TableRow key={expense.id} className="hover:bg-muted/60 transition-colors">
                              <TableCell className="font-medium">{expense.expense_code}</TableCell>
                              <TableCell>{formatSafeDate(expense.expense_date)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{expense.category}</Badge>
                              </TableCell>
                              <TableCell>{expense.person_name || "—"}</TableCell>
                              <TableCell className="max-w-xs truncate">{expense.description}</TableCell>
                              <TableCell className="text-red-600 font-semibold">
                                -{formatCurrency(expense.amount)}
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem 
                                      onClick={() => setSelectedExpense(expense)}
                                      className="hover:bg-primary hover:text-primary-foreground transition-colors"
                                    >
                                      <Eye className="mr-2 h-4 w-4" />
                                      Xem chi tiết
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => setExpenseToEdit(expense)}
                                      className="hover:bg-primary hover:text-primary-foreground transition-colors"
                                    >
                                      <Edit className="mr-2 h-4 w-4" />
                                      Chỉnh sửa
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      className="text-red-600 hover:bg-red-600 hover:text-white transition-colors"
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
          </TabsContent>

          <TabsContent value="profit" className="space-y-6">
            {/* Profit Details Table */}
            <Card>
              <CardHeader>
                <CardTitle>Chi tiết lợi nhuận theo đơn hàng</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">Đang tải dữ liệu...</div>
                  </div>
                ) : orderProfits.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground mb-2">
                      Không có đơn hàng nào trong khoảng thời gian đã chọn
                    </div>
                    <div className="text-sm text-gray-500">
                      Chỉ hiển thị đơn hàng đã giao có đầy đủ dữ liệu doanh thu và giá gốc
                    </div>
                  </div>
                ) : (
                  <>
                     {/* Summary Card - Hide profit data for accountants */}
                     {role !== 'accountant' && (
                       <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                         <h4 className="text-sm font-semibold text-blue-900 mb-3">Tổng kết lợi nhuận</h4>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                           <div>
                             <span className="text-blue-600">Tổng doanh thu:</span>
                             <div className="font-bold text-green-600">{formatCurrency(cashFlowStats.totalRevenue)}</div>
                           </div>
                           <div>
                             <span className="text-blue-600">Tổng giá gốc:</span>
                             <div className="font-bold text-blue-600">{formatCurrency(cashFlowStats.totalCostPrice)}</div>
                           </div>
                           <div>
                             <span className="text-blue-600">Lợi nhuận trước:</span>
                             <div className={`font-bold ${cashFlowStats.profitBefore >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                               {formatCurrency(cashFlowStats.profitBefore)}
                             </div>
                           </div>
                           <div>
                             <span className="text-blue-600">Lợi nhuận sau:</span>
                             <div className={`font-bold ${cashFlowStats.profitAfter >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                               {formatCurrency(cashFlowStats.profitAfter)}
                             </div>
                           </div>
                         </div>
                       </div>
                     )}

                    <div className="rounded-md border">
                      <Table>
                         <TableHeader>
                           <TableRow>
                             <TableHead>Đơn hàng</TableHead>
                             <TableHead>Khách hàng</TableHead>
                             <TableHead>Ngày</TableHead>
                             <TableHead>Doanh thu</TableHead>
                             {role !== 'accountant' && <TableHead>Giá sản xuất</TableHead>}
                             {role !== 'accountant' && <TableHead>Lợi nhuận trước</TableHead>}
                             <TableHead>Chi phí phân bổ</TableHead>
                             {role !== 'accountant' && <TableHead>Lợi nhuận sau</TableHead>}
                           </TableRow>
                         </TableHeader>
                        <TableBody>
                          {orderProfits.map((profit) => (
                            <TableRow 
                              key={profit.id} 
                              className="cursor-pointer hover:bg-muted/60 transition-colors"
                            >
                               <TableCell className="font-medium">{getOrderDisplayNumber(profit)}</TableCell>
                               <TableCell>{profit.customer_name}</TableCell>
                               <TableCell>{formatSafeDate(profit.date)}</TableCell>
                               <TableCell className="text-green-600 font-semibold">
                                 {formatCurrency(profit.total_amount)}
                               </TableCell>
                               {role !== 'accountant' && (
                                 <TableCell className="text-blue-600 font-semibold">
                                   {formatCurrency(profit.cost_price)}
                                 </TableCell>
                               )}
                               {role !== 'accountant' && (
                                 <TableCell className={`font-semibold ${profit.profit_before >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                   {formatCurrency(profit.profit_before)}
                                 </TableCell>
                               )}
                               <TableCell className="text-orange-600 font-semibold">
                                 {formatCurrency(profit.allocated_expenses)}
                               </TableCell>
                               {role !== 'accountant' && (
                                 <TableCell className={`font-semibold ${profit.profit_after >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                   {formatCurrency(profit.profit_after)}
                                 </TableCell>
                               )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

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
                  <p className="text-base font-mono">{selectedExpense.expense_code}</p>
                </div>
                <div className="mt-2">
                  <label className="text-sm font-medium text-gray-500">Ngày tạo</label>
                  <p className="text-base">{formatSafeDate(selectedExpense.created_at)}</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}