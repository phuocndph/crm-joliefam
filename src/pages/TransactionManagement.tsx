import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, DollarSign, Clock, CheckCircle, AlertCircle, Eye, Plus, Edit, Package, User, MapPin, Phone, Mail, Building, CalendarDays, FileText, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CreatePaymentForm } from "@/components/CreatePaymentForm";
import { getOrderDisplayNumber } from "@/lib/orderUtils";
import { useUserRole } from "@/hooks/useUserRole";
import { ManagerSelector } from "@/components/ManagerSelector";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTransactionList } from "@/components/MobileTransactionList";

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
  customer_id: string;
  total_amount: number;
  payment_status: string;
  payment_date?: string;
  status: string;
  delivery_date?: string;
  created_at: string;
  notes?: string;
  items?: any;
  assignee_id?: string;
  customers?: {
    name: string;
    customer_code: string;
    phone: string;
    email?: string;
    address?: string;
    company?: string;
  };
  assignees?: {
    name: string;
  };
}

interface OrderPayment {
  id: string;
  order_id: string;
  payment_amount: number;
  payment_type: string;
  payment_method: string;
  payment_date: string;
  notes?: string;
}

interface PaymentStats {
  totalOrders: number;
  paidOrders: number;
  partialOrders: number;
  pendingOrders: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
}

const TransactionManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderPayments, setOrderPayments] = useState<OrderPayment[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<OrderPayment[]>([]);
  const [selectedOrderExpenses, setSelectedOrderExpenses] = useState<any[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [allOrderExpenses, setAllOrderExpenses] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [user, setUser] = useState(null);
  const { role: userRole } = useUserRole(user);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  // Set up real-time synchronization for orders and payments
  useEffect(() => {
    console.log('🔧 Setting up real-time order & payment sync...');
    
    const channel = supabase
      .channel('transaction-orders-payments-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        console.log('🔄 Orders changed');
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, () => {
        console.log('🔄 Payments changed');
        queryClient.invalidateQueries({ queryKey: ['order-payments'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Use React Query for orders
  const { data: ordersData = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', selectedManagerId],
    queryFn: async () => {
      let ordersQuery = supabase
        .from("orders")
        .select(`
          *,
          customers:customer_id (
            name,
            customer_code,
            phone,
            email,
            address,
            company
          ),
          assignees:assignee_id (
            name
          )
        `);

      if (selectedManagerId) {
        ordersQuery = ordersQuery.eq('manager_id', selectedManagerId);
      }

      const { data, error } = await ordersQuery;
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 0, // Always fresh
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Use React Query for order payments
  const { data: orderPaymentsData = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['order-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_payments")
        .select("*")
        .order("payment_date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 0, // Always fresh
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Use React Query for all order expenses
  const { data: allOrderExpensesData = [] } = useQuery({
    queryKey: ['all-order-expenses', selectedManagerId],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("type", "expense")
        .not("order_id", "is", null);

      if (selectedManagerId) {
        query = query.eq('manager_id', selectedManagerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    // Sort orders by display order number (largest to smallest)
    const sortedOrders = [...ordersData].sort((a, b) => {
      const aOrderNum = parseInt(getOrderDisplayNumber(a)) || 0;
      const bOrderNum = parseInt(getOrderDisplayNumber(b)) || 0;
      return bOrderNum - aOrderNum; // Descending order (largest first)
    });
    
    setOrders(sortedOrders);
    setOrderPayments(orderPaymentsData);
    setAllOrderExpenses(allOrderExpensesData);
    setLoading(ordersLoading || paymentsLoading);
  }, [ordersData, orderPaymentsData, allOrderExpensesData, ordersLoading, paymentsLoading]);

  const loadOrderPaymentDetails = async (orderId: string) => {
    try {
      const [paymentsRes, expensesRes] = await Promise.all([
        supabase
          .from("order_payments")
          .select("*")
          .eq("order_id", orderId)
          .order("payment_date", { ascending: true }),
        supabase
          .from("transactions")
          .select("*")
          .eq("order_id", orderId)
          .eq("type", "expense")
          .order("date", { ascending: true }),
      ]);
      
      if (paymentsRes.error) throw paymentsRes.error;
      setSelectedOrderPayments(paymentsRes.data || []);
      setSelectedOrderExpenses(expensesRes.data || []);
    } catch (error) {
      console.error('Error loading order payments:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải chi tiết thanh toán",
        variant: "destructive",
      });
    }
  };

  const updatePaymentStatus = async (orderId: string, newStatus: 'pending' | 'partial' | 'paid') => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ 
          payment_status: newStatus,
          payment_date: newStatus === 'paid' ? new Date().toISOString() : null
        })
        .eq("id", orderId);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái thanh toán",
      });

      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái thanh toán",
        variant: "destructive",
      });
    }
  };

  // Calculate statistics
  const stats: PaymentStats = {
    totalOrders: orders.length,
    paidOrders: orders.filter(o => o.payment_status === 'paid').length,
    partialOrders: orders.filter(o => o.payment_status === 'partial').length,
    pendingOrders: orders.filter(o => o.payment_status === 'pending').length,
    totalPaidAmount: orderPayments.reduce((sum, p) => sum + Number(p.payment_amount), 0),
    totalPendingAmount: orders
      .filter(o => o.payment_status !== 'paid')
      .reduce((sum, o) => {
        const paidAmount = orderPayments
          .filter(p => p.order_id === o.id)
          .reduce((paidSum, p) => paidSum + Number(p.payment_amount), 0);
        const expenses = allOrderExpenses
          .filter(e => e.order_id === o.id)
          .reduce((expSum, e) => expSum + Number(e.amount || 0), 0);
        return sum + (Number(o.total_amount) - paidAmount - expenses);
      }, 0)
  };

  // Filter orders based on search and status
  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      getOrderDisplayNumber(order).toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.customer_code?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || order.payment_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
      return "0 VNĐ";
    }
    return Number(amount).toLocaleString("vi-VN") + " VNĐ";
  };

  const formatDate = (dateValue: string | null | undefined) => {
    if (!dateValue) return "-";
    try {
      return format(new Date(dateValue), "dd/MM/yyyy");
    } catch {
      return "-";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'partial': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'pending': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Đã thanh toán';
      case 'partial': return 'Thanh toán 1 phần';
      case 'pending': return 'Chưa thanh toán';
      default: return status;
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'deposit': return 'Đặt cọc';
      case 'installment': return 'Trả góp';
      case 'final': return 'Thanh toán cuối';
      case 'full': return 'Thanh toán toàn bộ';
      default: return type;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Tiền mặt';
      case 'bank_transfer': return 'Chuyển khoản';
      case 'card': return 'Thẻ';
      case 'other': return 'Khác';
      default: return method;
    }
  };

  const calculatePaidAmount = (orderId: string) => {
    return orderPayments
      .filter(p => p.order_id === orderId)
      .reduce((sum, p) => sum + Number(p.payment_amount), 0);
  };

  const calculateOrderExpenses = (orderId: string) => {
    return allOrderExpenses
      .filter(e => e.order_id === orderId)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  };

  const calculateRemainingAmount = (order: Order) => {
    const paidAmount = calculatePaidAmount(order.id);
    const expenses = calculateOrderExpenses(order.id);
    return Number(order.total_amount) - paidAmount - expenses;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý Thanh toán</h1>
          <p className="text-muted-foreground">
            Theo dõi và quản lý thanh toán đơn hàng
          </p>
        </div>
        {userRole === 'accountant' && (
          <ManagerSelector
            selectedManagerId={selectedManagerId}
            onManagerChange={setSelectedManagerId}
          />
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tổng đơn hàng</p>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
                <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Đã thanh toán</p>
                <p className="text-2xl font-bold text-green-600">{stats.paidOrders}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Chưa thanh toán</p>
                <p className="text-2xl font-bold text-red-600">{stats.pendingOrders}</p>
              </div>
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-900">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Số tiền còn lại</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(stats.totalPendingAmount)}</p>
              </div>
              <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900">
                <Clock className="h-6 w-6 text-orange-600 dark:text-orange-300" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Danh sách Đơn hàng</CardTitle>
              <CardDescription>Quản lý trạng thái thanh toán đơn hàng</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Tìm kiếm theo mã đơn hàng, tên khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Trạng thái thanh toán" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="pending">Chưa thanh toán</SelectItem>
                <SelectItem value="partial">Thanh toán 1 phần</SelectItem>
                <SelectItem value="paid">Đã thanh toán</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
          <div className="rounded-md border">
            {isMobile ? (
              <div className="p-2">
                {loading ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">Đang tải...</div>
                ) : (
                  <MobileTransactionList
                    orders={filteredOrders}
                    calculatePaidAmount={calculatePaidAmount}
                    calculateOrderExpenses={calculateOrderExpenses}
                    calculateRemainingAmount={calculateRemainingAmount}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    getPaymentStatusColor={getPaymentStatusColor}
                    getPaymentStatusLabel={getPaymentStatusLabel}
                    onView={(o) => {
                      setSelectedOrder(o);
                      loadOrderPaymentDetails(o.id);
                      setShowPaymentDialog(true);
                    }}
                    onAddPayment={(o) => {
                      setSelectedOrder(o);
                      setShowPaymentForm(true);
                    }}
                    onUpdatePaymentStatus={(id, v) => updatePaymentStatus(id, v as any)}
                  />
                )}
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn hàng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Tổng tiền</TableHead>
                  <TableHead>Đã thanh toán</TableHead>
                  <TableHead>Chi phí</TableHead>
                  <TableHead>Còn lại</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">Đang tải...</TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <DollarSign className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">Không có đơn hàng nào</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const paidAmount = calculatePaidAmount(order.id);
                    const orderExpenses = calculateOrderExpenses(order.id);
                    const remainingAmount = calculateRemainingAmount(order);
                    
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{getOrderDisplayNumber(order)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.customers?.name}</p>
                            <p className="text-sm text-muted-foreground">{order.customers?.customer_code}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(order.total_amount)}</TableCell>
                        <TableCell>{formatCurrency(paidAmount)}</TableCell>
                        <TableCell>
                          <span className={orderExpenses > 0 ? "text-orange-600" : "text-muted-foreground"}>
                            {formatCurrency(orderExpenses)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={remainingAmount > 0 ? "text-red-600" : "text-green-600"}>
                            {formatCurrency(remainingAmount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPaymentStatusColor(order.payment_status)}>
                            {getPaymentStatusLabel(order.payment_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(order.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedOrder(order);
                                loadOrderPaymentDetails(order.id);
                                setShowPaymentDialog(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {order.payment_status !== 'paid' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setShowPaymentForm(true);
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                            <Select
                              value={order.payment_status}
                              onValueChange={(value) => updatePaymentStatus(order.id, value as any)}
                            >
                              <SelectTrigger className="w-32 h-8">
                                <Edit className="h-3 w-3" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Chưa thanh toán</SelectItem>
                                <SelectItem value="partial">Thanh toán 1 phần</SelectItem>
                                <SelectItem value="paid">Đã thanh toán</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Details Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết Đơn hàng & Thanh toán - {selectedOrder && getOrderDisplayNumber(selectedOrder)}</DialogTitle>
            <DialogDescription>
              Thông tin đơn hàng và lịch sử thanh toán
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              {/* Customer & Order Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Info */}
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Khách hàng
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{selectedOrder.customers?.name || "-"}</span>
                      {selectedOrder.customers?.customer_code && (
                        <Badge variant="outline" className="text-xs">{selectedOrder.customers.customer_code}</Badge>
                      )}
                    </div>
                    {selectedOrder.customers?.company && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Building className="h-3 w-3" /> {selectedOrder.customers.company}
                      </p>
                    )}
                    {selectedOrder.customers?.phone && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3" /> {selectedOrder.customers.phone}
                      </p>
                    )}
                    {selectedOrder.customers?.email && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3 w-3" /> {selectedOrder.customers.email}
                      </p>
                    )}
                    {selectedOrder.customers?.address && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" /> {selectedOrder.customers.address}
                      </p>
                    )}
                  </div>
                </div>

                {/* Order Meta */}
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Đơn hàng
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số đơn:</span>
                      <span className="font-medium">{getOrderDisplayNumber(selectedOrder)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trạng thái:</span>
                      <Badge variant="outline">{
                        selectedOrder.status === 'pending' ? 'Chờ xử lý' :
                        selectedOrder.status === 'processing' ? 'Đang xử lý' :
                        selectedOrder.status === 'completed' ? 'Hoàn thành' :
                        selectedOrder.status === 'delivered' ? 'Đã giao' :
                        selectedOrder.status === 'cancelled' ? 'Đã hủy' :
                        selectedOrder.status
                      }</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ngày tạo:</span>
                      <span>{formatDate(selectedOrder.created_at)}</span>
                    </div>
                    {selectedOrder.delivery_date && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Ngày giao:</span>
                        <span>{formatDate(selectedOrder.delivery_date)}</span>
                      </div>
                    )}
                    {selectedOrder.assignees?.name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Người phụ trách:</span>
                        <span>{selectedOrder.assignees.name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tổng tiền:</span>
                      <span className="font-semibold">{formatCurrency(selectedOrder.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  <span className="font-medium">Ghi chú: </span>
                  <span className="text-muted-foreground">{selectedOrder.notes}</span>
                </div>
              )}

              {/* Items Table */}
              {(() => {
                let items: any[] = [];
                try {
                  if (selectedOrder.items) {
                    items = typeof selectedOrder.items === 'string' 
                      ? JSON.parse(selectedOrder.items) 
                      : selectedOrder.items;
                  }
                } catch (e) { /* ignore */ }
                
                if (!Array.isArray(items) || items.length === 0) return null;

                return (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Danh sách sản phẩm ({items.length})
                    </h4>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">STT</TableHead>
                            <TableHead>Sản phẩm</TableHead>
                            <TableHead>Quy cách</TableHead>
                            <TableHead>Chất liệu</TableHead>
                            <TableHead className="text-right">SL</TableHead>
                            <TableHead className="text-right">Đơn giá</TableHead>
                            <TableHead className="text-right">Thành tiền</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell className="font-medium">{item.name || "-"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{item.specifications || "-"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{item.description || "-"}</TableCell>
                              <TableCell className="text-right">{item.quantity || 0}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(item.total || (item.price * item.quantity))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })()}

              <Separator />

              {/* Payment Summary */}
              {(() => {
                const paidAmount = calculatePaidAmount(selectedOrder.id);
                const totalExpenses = selectedOrderExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
                const remaining = Number(selectedOrder.total_amount) - paidAmount - totalExpenses;
                return (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Thanh toán
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm text-muted-foreground">Tổng tiền</p>
                        <p className="font-semibold">{formatCurrency(selectedOrder.total_amount)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Đã thanh toán</p>
                        <p className="font-semibold text-green-600">-{formatCurrency(paidAmount)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Chi phí</p>
                        <p className="font-semibold text-orange-600">-{formatCurrency(totalExpenses)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Còn lại</p>
                        <p className="font-semibold text-red-600">{formatCurrency(Math.max(0, remaining))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Trạng thái</p>
                        <Badge className={getPaymentStatusColor(selectedOrder.payment_status)}>
                          {getPaymentStatusLabel(selectedOrder.payment_status)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Payment History */}
              <div>
                <h4 className="font-medium mb-3">Lịch sử Thanh toán</h4>
                {selectedOrderPayments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Chưa có thanh toán nào</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ngày thanh toán</TableHead>
                          <TableHead>Số tiền</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead>Phương thức</TableHead>
                          <TableHead>Ghi chú</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrderPayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>{formatDate(payment.payment_date)}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(payment.payment_amount)}</TableCell>
                            <TableCell>{getPaymentTypeLabel(payment.payment_type)}</TableCell>
                            <TableCell>{getPaymentMethodLabel(payment.payment_method)}</TableCell>
                            <TableCell>{payment.notes || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Order Expenses */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Chi phí đơn hàng
                </h4>
                {selectedOrderExpenses.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Chưa có chi phí nào</p>
                ) : (
                  <>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ngày</TableHead>
                            <TableHead>Mô tả</TableHead>
                            <TableHead>Danh mục</TableHead>
                            <TableHead className="text-right">Số tiền</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrderExpenses.map((expense) => (
                            <TableRow key={expense.id}>
                              <TableCell>{formatDate(expense.date)}</TableCell>
                              <TableCell>{expense.description || "-"}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {expense.category === 'shipping_fee' ? 'Phí vận chuyển' : expense.category || "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium text-red-600">
                                -{formatCurrency(expense.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end mt-2">
                      <span className="text-sm font-semibold">
                        Tổng chi phí: <span className="text-red-600">-{formatCurrency(selectedOrderExpenses.reduce((sum, e) => sum + (e.amount || 0), 0))}</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Form Dialog */}
      <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm Thanh toán - {selectedOrder && getOrderDisplayNumber(selectedOrder)}</DialogTitle>
            <DialogDescription>
              Thêm khoản thanh toán mới cho đơn hàng
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <CreatePaymentForm
              orderId={selectedOrder.id}
              orderNumber={getOrderDisplayNumber(selectedOrder)}
              totalAmount={selectedOrder.total_amount}
              totalPaid={calculatePaidAmount(selectedOrder.id)}
              orderExpenses={calculateOrderExpenses(selectedOrder.id)}
              remainingAmount={calculateRemainingAmount(selectedOrder)}
              onClose={() => setShowPaymentForm(false)}
              onSubmit={() => {
                setShowPaymentForm(false);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['order-payments'] });
                toast({
                  title: "Thành công",
                  description: "Đã thêm thanh toán mới",
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionManagement;