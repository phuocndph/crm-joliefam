import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Search, Plus, Package, Eye, Edit, Trash2, Filter, MoreHorizontal, CheckCircle, Clock, XCircle, AlertCircle, DollarSign, CalendarDays, Truck, CreditCard, Edit3, RotateCcw, MapPin, Navigation, Zap, Printer } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useInfiniteOrders } from "@/hooks/useInfiniteOrders";
import { useOrdersStats } from "@/hooks/useOrdersStats";
import { useDuplicateOrderNumbers } from "@/hooks/useDuplicateOrderNumbers";
import { useDebounce } from "@/hooks/useDebounce";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { ManagerSelector } from "@/components/ManagerSelector";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileOrderList } from "@/components/MobileOrderList";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CreateOrderForm } from "@/components/CreateOrderForm";
import { EditOrderDialog } from "@/components/EditOrderDialog";
import { DeleteOrderDialog } from "@/components/DeleteOrderDialog";
import { CreatePaymentForm } from "@/components/CreatePaymentForm";
import { EditOrderNumberDialog } from "@/components/EditOrderNumberDialog";
import { GHNTrackingDialog } from "@/components/GHNTrackingDialog";
import { CreateGHNOrderDialog } from "@/components/CreateGHNOrderDialog";
import { InlineOrderEditTable } from "@/components/InlineOrderEditTable";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { getOrderDisplayNumber } from "@/lib/orderUtils";

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
  customer_id: string | null;
  total_amount: number | null;
  cost_price: number | null;
  profit_before: number | null;
  profit_after: number | null;
  status: string;
  payment_status: string;
  payment_date: string | null;
  delivery_date: string | null;
  delivered_date: string | null;
  notes: string | null;
  items: any;
  created_at: string;
  updated_at: string;
  customers?: {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    customer_code: string | null;
    address?: string | null;
    addresses?: any[] | null;
  } | null;
  assignees?: {
    name: string;
  } | null;
  ghn_tracking?: { ghn_order_code: string }[] | null;
}

const statusConfig = {
  pending: {
    label: "Chờ xử lý",
    color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-600 hover:text-white",
    icon: Clock
  },
  processing: {
    label: "Đang xử lý",
    color: "bg-blue-100 text-blue-800 hover:bg-blue-600 hover:text-white",
    icon: AlertCircle
  },
  shipped: {
    label: "Đã giao",
    color: "bg-green-100 text-green-800 hover:bg-green-600 hover:text-white",
    icon: Truck
  },
  delivered: {
    label: "Hoàn thành",
    color: "bg-green-100 text-green-800 hover:bg-green-600 hover:text-white",
    icon: CheckCircle
  },
  cancelled: {
    label: "Đã hủy",
    color: "bg-red-100 text-red-800 hover:bg-red-600 hover:text-white",
    icon: XCircle
  },
  self_delivered: {
    label: "Đã giao tự thu tiền",
    color: "bg-purple-100 text-purple-800 hover:bg-purple-600 hover:text-white",
    icon: Truck
  },
  returned: {
    label: "Hoàn Hàng",
    color: "bg-orange-100 text-orange-800 hover:bg-orange-600 hover:text-white",
    icon: RotateCcw
  }
};

const paymentStatusConfig = {
  pending: {
    label: "Chưa thanh toán",
    color: "bg-red-100 text-red-800"
  },
  partial: {
    label: "Thanh toán 1 phần",
    color: "bg-yellow-100 text-yellow-800"
  },
  paid: {
    label: "Đã thanh toán",
    color: "bg-green-100 text-green-800"
  }
};

export default function OrderManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("order_number");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToPayment, setOrderToPayment] = useState<Order | null>(null);
  const [orderToEditNumber, setOrderToEditNumber] = useState<Order | null>(null);
  const [orderToGHNTracking, setOrderToGHNTracking] = useState<Order | null>(null);
  const [orderToCreateGHN, setOrderToCreateGHN] = useState<Order | null>(null);
  const [standaloneGHNOpen, setStandaloneGHNOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("orders");
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { user, isReady } = useAuthReady();
  const { role: userRole, roleReady } = useUserRole(user);
  const authReady = isReady && roleReady;

  useEffect(() => {
    document.title = "Quản lý Đơn hàng | Hệ thống";
  }, []);

  const managerFilter = (userRole === 'admin' || userRole === 'accountant')
    ? selectedManagerId
    : (userRole === 'manager' && (user as any)?.id) ? (user as any).id : undefined;
  console.log('[Orders] role:', userRole, 'selectedManagerId:', selectedManagerId, 'managerFilter:', managerFilter, 'authReady:', authReady);
  const debouncedSearch = useDebounce(searchTerm, 350);
  const {
    data: ordersPages,
    isLoading: loading,
    refetch: loadOrders,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteOrders({ managerId: managerFilter, search: debouncedSearch, enabled: authReady && !!user }) as any;
  const orders = ((ordersPages?.pages || []) as any[]).flat();
  const sentinelRef = useInfiniteScroll(hasNextPage, isFetchingNextPage, fetchNextPage);
  const { data: orderStats } = useOrdersStats(managerFilter, authReady && !!user);
  const { data: dupOrderNumbers } = useDuplicateOrderNumbers();
  console.log('[Orders] fetched:', orders.length, 'unique managers:', Array.from(new Set(orders.map((o:any)=>o.manager_id))).length);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Optimistic patch helper for the infinite orders cache
  const patchOrderInCache = (orderId: string, patch: Record<string, any>) => {
    const queries = queryClient.getQueriesData<any>({ queryKey: ['orders-infinite'] });
    const prev: Array<{ key: any; data: any }> = [];
    queries.forEach(([key, data]) => {
      if (!data?.pages) return;
      prev.push({ key, data });
      const newPages = data.pages.map((page: any[]) =>
        page.map((o: any) => (o.id === orderId ? { ...o, ...patch } : o))
      );
      queryClient.setQueryData(key, { ...data, pages: newPages });
    });
    return () => {
      // Rollback
      prev.forEach(({ key, data }) => queryClient.setQueryData(key, data));
    };
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = getOrderDisplayNumber(order).toLowerCase().includes(searchTerm.toLowerCase()) || order.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || order.customers?.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) || order.customers?.company?.toLowerCase().includes(searchTerm.toLowerCase()) || order.customers?.phone?.includes(searchTerm);
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesPayment = paymentFilter === "all" || order.payment_status === paymentFilter;
    const matchesManager = !selectedManagerId || order.manager_id === selectedManagerId;
    return matchesSearch && matchesStatus && matchesPayment && matchesManager;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (sortBy) {
      case "order_number":
        return getOrderDisplayNumber(b).localeCompare(getOrderDisplayNumber(a), undefined, { numeric: true });
      case "customer_name":
        return (a.customers?.name || "").localeCompare(b.customers?.name || "");
      case "total_amount":
        return (b.total_amount || 0) - (a.total_amount || 0);
      case "delivery_date":
        if (!a.delivery_date && !b.delivery_date) return 0;
        if (!a.delivery_date) return 1;
        if (!b.delivery_date) return -1;
        return new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime();
      case "payment_date":
        if (!a.payment_date && !b.payment_date) return 0;
        if (!a.payment_date) return 1;
        if (!b.payment_date) return -1;
        return new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime();
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  // Auto-open order detail from URL parameter
  useEffect(() => {
    const orderId = searchParams.get('order_id');
    if (orderId && orders.length > 0) {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order);
        // Clear the URL parameter after opening
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.delete('order_id');
          return newParams;
        });
      }
    }
  }, [orders, searchParams, setSearchParams]);

  // Update selectedOrder when orders data changes
  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const updatedOrder = orders.find(o => o.id === selectedOrder.id);
      if (updatedOrder) {
        setSelectedOrder(updatedOrder);
      }
    }
  }, [orders, selectedOrder?.id]);

  const handleCreateOrder = () => {
    loadOrders();
    setShowCreateForm(false);
    toast({
      title: "Thành công",
      description: "Đơn hàng đã được tạo thành công"
    });
  };

  const handleEditOrder = () => {
    setOrderToEdit(null);
    // Realtime + optimistic cache đã cập nhật; chỉ invalidate mềm
    queryClient.invalidateQueries({ queryKey: ['orders-infinite'] });
  };

  const handleDeleteOrder = () => {
    loadOrders();
    setOrderToDelete(null);
    toast({
      title: "Thành công",
      description: "Đơn hàng đã được xóa thành công"
    });
  };

  const updateOrderStatus = (orderId: string, newStatus: string) => {
    const updateData: any = { status: newStatus };
    if (newStatus === 'delivered' || newStatus === 'shipped') {
      updateData.delivered_date = new Date().toISOString();
    }

    // 1) Cập nhật UI tức thì
    const rollback = patchOrderInCache(orderId, updateData);
    toast({
      title: "Đã cập nhật",
      description: "Trạng thái đơn hàng đã được thay đổi"
    });

    // 2) Gửi request ngầm
    (async () => {
      try {
        const { error } = await supabase.from('orders').update(updateData).eq('id', orderId);
        if (error) throw error;

        if (newStatus === 'delivered') {
          const order = orders.find(o => o.id === orderId);
          if (order && order.total_amount) {
            supabase.from('transactions').insert({
              amount: order.total_amount,
              type: 'income',
              category: 'sales',
              description: `Thanh toán đơn hàng ${getOrderDisplayNumber(order)}`,
              date: new Date().toISOString(),
              tenant_id: 'default',
              manager_id: (order as any).manager_id || null,
            }).then(({ error: txErr }) => {
              if (txErr) console.error('Transaction insert error:', txErr);
            });
          }
        }
      } catch (error: any) {
        console.error('Error updating order status:', error);
        rollback();
        toast({
          title: "Lỗi",
          description: error?.message || "Không thể cập nhật trạng thái đơn hàng",
          variant: "destructive"
        });
      }
    })();
  };

  const handlePaymentAdded = async () => {
    try {
      const result = await loadOrders();
      const updatedOrders = result?.data || [];
      
      // Cập nhật selectedOrder từ dữ liệu mới ngay lập tức
      if (selectedOrder) {
        const updatedOrder = updatedOrders.find((o: any) => o.id === selectedOrder.id);
        if (updatedOrder) {
          setSelectedOrder(updatedOrder);
        }
      }
    } catch (error) {
      console.error('Error refreshing orders:', error);
    } finally {
      setOrderToPayment(null);
    }
  };

  const handleBulkSync = async () => {
    setBulkSyncing(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'bulk_sync'
        }
      });
      if (error) throw error;
      if (data.success) {
        toast({
          title: "Thành công",
          description: data.message
        });
        loadOrders(); // Reload to get updated data
      } else {
        throw new Error(data.error || 'Không thể đồng bộ dữ liệu');
      }
    } catch (error) {
      console.error('Error syncing GHN data:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể đồng bộ dữ liệu từ GHN",
        variant: "destructive"
      });
    } finally {
      setBulkSyncing(false);
    }
  };

  // Stats from server-side aggregation (covers ALL orders, not just loaded pages)
  const pendingCount = orderStats?.pendingCount ?? 0;
  const processingCount = orderStats?.processingCount ?? 0;
  const completedCount = orderStats?.completedCount ?? 0;
  const overdueCount = orderStats?.overdueCount ?? 0;
  const totalReceivable = orderStats?.totalReceivable ?? 0;
  const totalValue = orderStats?.totalValue ?? 0;
  const totalOrders = orderStats?.total ?? orders.length;

  const formatCompactCurrency = (amount: number) => {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}tỷ`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)}tr`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
    return amount.toString();
  };

  const calculateTotalPaid = (order: Order | null): number => {
    if (!order) return 0;
    return (order as any).total_paid || 0;
  };

  const calculateRemainingAmount = (order: Order | null): number => {
    if (!order) return 0;
    return Math.max(0, (order.total_amount || 0) - calculateTotalPaid(order));
  };

  const statusFilterChips = [
    { value: 'all', label: 'Tất cả' },
    { value: 'pending', label: 'Chờ xử lý' },
    { value: 'processing', label: 'Đang xử lý' },
    { value: 'shipped', label: 'Đã giao' },
    { value: 'self_delivered', label: 'Tự giao' },
    { value: 'delivered', label: 'Hoàn thành' },
    { value: 'returned', label: 'Hoàn hàng' },
    { value: 'cancelled', label: 'Đã hủy' },
  ];

  // Duplicate display_order_number warning — toàn cục, mọi role thấy được
  const duplicateOrderNumbers = (dupOrderNumbers ?? []) as Array<[string, number]>;
  const duplicateNumberSet = React.useMemo(
    () => new Set(duplicateOrderNumbers.map(([num]) => String(num))),
    [duplicateOrderNumbers]
  );

  return (
    <div className="space-y-3">
      {/* Header + Stats Compact Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">Quản lý Đơn hàng</h1>
          <div className="flex items-center gap-2">
            {(userRole === 'admin' || userRole === 'accountant') && (
              <ManagerSelector
                selectedManagerId={selectedManagerId}
                onManagerChange={setSelectedManagerId}
              />
            )}
            <Button onClick={() => navigate('/quotes?create=true')} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Tạo báo giá
            </Button>
            <Button onClick={() => setStandaloneGHNOpen(true)} size="sm" variant="outline" className="gap-1.5">
              <Truck className="h-3.5 w-3.5" />
              Tạo đơn GHN
            </Button>
          </div>
        </div>

        {/* Compact Stats Bar */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-blue-600" />
            <span className="font-semibold">{totalOrders}</span>
            <span className="text-muted-foreground">đơn</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-yellow-600" />
            <span className="font-semibold">{pendingCount}</span>
            <span className="text-muted-foreground">chờ xử lý</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-blue-600" />
            <span className="font-semibold">{processingCount}</span>
            <span className="text-muted-foreground">đang xử lý</span>
          </div>
          {overdueCount > 0 && (
            <>
              <span className="hidden sm:inline text-muted-foreground/40">|</span>
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-600 animate-pulse" />
                <span className="font-semibold text-red-600">{overdueCount}</span>
                <span className="text-red-600">quá hạn</span>
              </div>
            </>
          )}
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span className="font-semibold">{completedCount}</span>
            <span className="text-muted-foreground">hoàn thành</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5 col-span-2">
            <DollarSign className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-muted-foreground">Chờ thu:</span>
            <span className="font-semibold text-orange-600">{formatCompactCurrency(totalReceivable)}</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5 col-span-2">
            <DollarSign className="h-3.5 w-3.5 text-green-600" />
            <span className="text-muted-foreground">Tổng HT:</span>
            <span className="font-semibold text-green-600">{formatCompactCurrency(totalValue)}</span>
          </div>
        </div>
      </div>

      {/* Cảnh báo trùng số đơn (gây lỗi auto-link mã GHN) */}
      {duplicateOrderNumbers.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Phát hiện {duplicateOrderNumbers.length} số đơn bị trùng</AlertTitle>
          <AlertDescription>
            <p className="mb-2 text-sm">Các số đơn dưới đây đang bị dùng cho nhiều đơn khác nhau (có thể nằm ở quản lý khác), khiến mã vận đơn GHN không tự liên kết được. Vui lòng sửa số đơn cho 1 trong các đơn để mỗi số là duy nhất — nếu bạn không tìm thấy đơn trùng trong danh sách của mình, liên hệ admin để xử lý:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {duplicateOrderNumbers.map(([num, count]) => (
                <li key={num}>
                  <strong>Số {num}</strong>: {count} đơn trùng
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Search + Filter Chips */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input placeholder="Tìm mã đơn, khách hàng, SĐT..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9" />
        </div>
        <div className="flex gap-1.5 items-center overflow-x-auto lg:flex-wrap -mx-1 px-1 pb-1 lg:pb-0 lg:mx-0 lg:px-0 scrollbar-hide">
          {statusFilterChips.map(chip => (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border whitespace-nowrap shrink-0",
                statusFilter === chip.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex lg:ml-auto">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full lg:w-44 h-9">
              <SelectValue placeholder="Sắp xếp theo" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              <SelectItem value="created_at">Ngày tạo mới nhất</SelectItem>
              <SelectItem value="order_number">Mã đơn hàng</SelectItem>
              <SelectItem value="customer_name">Tên khách hàng</SelectItem>
              <SelectItem value="total_amount">Giá trị đơn</SelectItem>
              <SelectItem value="delivery_date">Hẹn giao hàng</SelectItem>
              <SelectItem value="payment_date">Ngày thanh toán</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full lg:w-40 h-9">
              <SelectValue placeholder="Thanh toán" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              <SelectItem value="all">Tất cả TT</SelectItem>
              <SelectItem value="pending">Chưa thanh toán</SelectItem>
              <SelectItem value="partial">Thanh toán 1 phần</SelectItem>
              <SelectItem value="paid">Đã thanh toán</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="orders">
          {/* Table */}
              {loading ? (
                <div className="text-center py-8">Đang tải...</div>
              ) : isMobile ? (
                <MobileOrderList
                  orders={sortedOrders}
                  duplicateNumbers={duplicateNumberSet}
                  statusConfig={statusConfig}
                  paymentStatusConfig={paymentStatusConfig}
                  calculateTotalPaid={calculateTotalPaid}
                  calculateRemainingAmount={calculateRemainingAmount}
                  onView={(o) => setSelectedOrder(o)}
                  onEdit={(o) => setOrderToEdit(o)}
                  onDelete={(o) => setOrderToDelete(o)}
                  onAddPayment={(o) => setOrderToPayment(o)}
                  onEditNumber={(o) => setOrderToEditNumber(o)}
                  onCreateGHN={(o) => setOrderToCreateGHN(o)}
                  onGHNTracking={(o) => setOrderToGHNTracking(o)}
                />
              ) : (
                <InlineOrderEditTable
                  orders={sortedOrders}
                  duplicateNumbers={duplicateNumberSet}
                  onOrderUpdate={async (orderId, updates) => {
                    try {
                      const { error } = await supabase
                        .from('orders')
                        .update(updates)
                        .eq('id', orderId);
                      
                      if (error) throw error;
                      
                      if ('assignee_id' in updates) {
                        const order = sortedOrders.find(o => o.id === orderId);
                        if (order?.customer_id) {
                          await supabase
                            .from('customers')
                            .update({ assignee_id: updates.assignee_id })
                            .eq('id', order.customer_id);
                        }
                      }
                      
                      await loadOrders();
                      toast({
                        title: "Thành công",
                        description: "Đơn hàng đã được cập nhật"
                      });
                    } catch (error) {
                      console.error('Error updating order:', error);
                      toast({
                        title: "Lỗi",
                        description: "Không thể cập nhật đơn hàng",
                        variant: "destructive"
                      });
                    }
                  }}
                  onDeleteOrder={order => setOrderToDelete(order)}
                  onViewOrderDetail={order => setSelectedOrder(order)}
                />
              )}
              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-10 flex items-center justify-center">
                {isFetchingNextPage && (
                  <span className="text-sm text-muted-foreground">Đang tải thêm...</span>
                )}
                {!hasNextPage && orders.length > 0 && (
                  <span className="text-xs text-muted-foreground">Đã tải hết</span>
                )}
              </div>
        </TabsContent>
      </Tabs>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={open => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="p-2">
            <div className="space-y-2">
              {/* Header */}
              <div className="border-b border-gray-300 pb-2 mb-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Mã đơn: {selectedOrder ? getOrderDisplayNumber(selectedOrder) : ''}</span>
                  <span className="text-sm px-2 py-1 bg-gray-100 border border-gray-300">
                    {statusConfig[selectedOrder?.status || 'pending']?.label}
                  </span>
                </div>
              </div>

              {/* Order Details Table */}
              <div className="border border-gray-300">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium w-32">Tên KH</td>
                      <td className="p-2">{selectedOrder?.customers?.name || "Khách lẻ"}</td>
                      <td className="border-l border-gray-200 border-r border-gray-200 p-2 bg-gray-50 font-medium w-32">Mã KH</td>
                      <td className="p-2">{selectedOrder?.customers?.customer_code || "-"}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">SĐT</td>
                      <td className="p-2">{selectedOrder?.customers?.phone || "-"}</td>
                      <td className="border-l border-gray-200 border-r border-gray-200 p-2 bg-gray-50 font-medium">Email</td>
                      <td className="p-2">{selectedOrder?.customers?.email || "-"}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">Công ty</td>
                      <td className="p-2" colSpan={3}>{selectedOrder?.customers?.company || "-"}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">Tổng tiền</td>
                      <td className="p-2">{selectedOrder?.total_amount?.toLocaleString("vi-VN")} VNĐ</td>
                      <td className="border-l border-gray-200 border-r border-gray-200 p-2 bg-gray-50 font-medium">Phụ trách</td>
                      <td className="p-2">{selectedOrder?.assignees?.name || "-"}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">Ngày tạo</td>
                      <td className="p-2">{selectedOrder?.created_at ? format(new Date(selectedOrder.created_at), "dd/MM/yyyy HH:mm", { locale: vi }) : "-"}</td>
                      <td className="border-l border-gray-200 border-r border-gray-200 p-2 bg-gray-50 font-medium">Hẹn giao</td>
                      <td className="p-2">{selectedOrder?.delivery_date ? format(new Date(selectedOrder.delivery_date), "dd/MM/yyyy", { locale: vi }) : "-"}</td>
                    </tr>
                    <tr>
                      <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">Ghi chú</td>
                      <td className="p-2" colSpan={3}>{selectedOrder?.notes || "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Product Details */}
              <div className="mt-4">
                <div className="border-b border-gray-300 pb-1 mb-2">
                  <span className="text-sm font-medium">Chi tiết sản phẩm</span>
                </div>
                {/* Products Table */}
                <div className="border border-gray-300">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-300">
                        <th className="border-r border-gray-300 p-2 text-left font-medium">STT</th>
                        <th className="border-r border-gray-300 p-2 text-left font-medium">Sản phẩm</th>
                        <th className="border-r border-gray-300 p-2 text-left font-medium">Quy cách</th>
                        <th className="border-r border-gray-300 p-2 text-left font-medium">Chất liệu</th>
                        <th className="border-r border-gray-300 p-2 text-left font-medium">SL</th>
                        <th className="border-r border-gray-300 p-2 text-left font-medium">Đơn giá</th>
                        <th className="border-r border-gray-300 p-2 text-left font-medium">Thành tiền</th>
                        <th className="p-2 text-left font-medium">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let itemsToDisplay = selectedOrder?.items;
                        if (typeof selectedOrder?.items === 'string') {
                          try {
                            itemsToDisplay = JSON.parse(selectedOrder.items);
                          } catch (error) {
                            return (
                              <tr>
                                <td colSpan={8} className="p-4 text-center text-red-500">
                                  Lỗi định dạng dữ liệu sản phẩm
                                </td>
                              </tr>
                            );
                          }
                        }
                        if (Array.isArray(itemsToDisplay) && itemsToDisplay.length > 0) {
                          return itemsToDisplay.map((item: any, index: number) => (
                            <tr key={index} className="border-b border-gray-200">
                              <td className="border-r border-gray-200 p-2">{index + 1}</td>
                              <td className="border-r border-gray-200 p-2">{item.name || `Sản phẩm ${index + 1}`}</td>
                              <td className="border-r border-gray-200 p-2">{item.specifications || "-"}</td>
                              <td className="border-r border-gray-200 p-2">{item.description || "-"}</td>
                              <td className="border-r border-gray-200 p-2">{item.quantity || 1}</td>
                              <td className="border-r border-gray-200 p-2">{(item.price || 0).toLocaleString()}đ</td>
                              <td className="border-r border-gray-200 p-2 font-medium">{((item.quantity || 1) * (item.price || 0)).toLocaleString()}đ</td>
                              <td className="p-2">{item.notes || "-"}</td>
                            </tr>
                          ));
                        }
                        return (
                          <tr>
                            <td colSpan={8} className="p-4 text-center text-gray-500">
                              Không có thông tin sản phẩm
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Total Summary */}
                <div className="border border-gray-300 border-t-0">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">Tổng thanh toán</td>
                        <td className="p-2 font-medium">{selectedOrder?.total_amount?.toLocaleString("vi-VN")}đ</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">Đã thanh toán</td>
                        <td className="p-2 font-medium">{(() => {
                          const totalPaid = calculateTotalPaid(selectedOrder);
                          return totalPaid.toLocaleString();
                        })()}đ</td>
                      </tr>
                      <tr>
                        <td className="border-r border-gray-200 p-2 bg-gray-50 font-medium">Còn lại</td>
                        <td className="p-2 font-bold text-red-600">{calculateRemainingAmount(selectedOrder).toLocaleString()}đ</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-300 mt-4">
                  {selectedOrder?.ghn_tracking && Array.isArray(selectedOrder.ghn_tracking) && selectedOrder.ghn_tracking.length > 0 && (
                    <Button
                      onClick={async () => {
                        const codes = selectedOrder.ghn_tracking!.map((t: any) => t.ghn_order_code);
                        try {
                          const { data, error } = await supabase.functions.invoke('ghn-tracking', {
                            body: { action: 'print_a5', orderCodes: codes }
                          });
                          if (error) throw error;
                          if (data.success && data.data?.printUrl) {
                            window.open(data.data.printUrl, '_blank');
                            toast({ title: "Đang mở trang in phiếu A5..." });
                          } else {
                            throw new Error(data.error || 'Không thể tạo link in phiếu');
                          }
                        } catch (err: any) {
                          toast({ title: "Lỗi", description: err.message || "Lỗi in phiếu A5", variant: "destructive" });
                        }
                      }}
                      variant="outline"
                      className="gap-2"
                    >
                      <Printer className="h-4 w-4" />
                      In vận đơn A5
                    </Button>
                  )}
                  {(!selectedOrder?.ghn_tracking || (Array.isArray(selectedOrder?.ghn_tracking) && selectedOrder.ghn_tracking.length === 0)) && (
                    <Button onClick={() => setOrderToCreateGHN(selectedOrder)} variant="outline" className="gap-2">
                      <Truck className="h-4 w-4" />
                      Tạo đơn GHN
                    </Button>
                  )}
                  {calculateRemainingAmount(selectedOrder) > 0 && (
                    <Button onClick={() => setOrderToPayment(selectedOrder)} variant="default" className="gap-2">
                      <CreditCard className="h-4 w-4" />
                      Thêm thanh toán
                    </Button>
                  )}
                  <Button onClick={() => setSelectedOrder(null)} variant="outline">
                    Đóng
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Order Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <CreateOrderForm onClose={() => setShowCreateForm(false)} onSubmit={handleCreateOrder} />
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      {orderToEdit && <EditOrderDialog order={orderToEdit} open={!!orderToEdit} onOpenChange={open => !open && setOrderToEdit(null)} onSubmit={handleEditOrder} />}

      {/* Delete Order Dialog */}
      {orderToDelete && <DeleteOrderDialog order={orderToDelete} open={!!orderToDelete} onOpenChange={open => !open && setOrderToDelete(null)} onConfirm={handleDeleteOrder} />}

      {/* Add Payment Dialog */}
      {orderToPayment && (
        <Dialog open={!!orderToPayment} onOpenChange={open => !open && setOrderToPayment(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <CreatePaymentForm 
              orderId={orderToPayment.id} 
              orderNumber={getOrderDisplayNumber(orderToPayment)} 
              totalAmount={orderToPayment.total_amount || 0} 
              totalPaid={calculateTotalPaid(orderToPayment)} 
              remainingAmount={calculateRemainingAmount(orderToPayment)} 
              onClose={() => setOrderToPayment(null)} 
              onSubmit={handlePaymentAdded} 
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Order Number Dialog */}
      {orderToEditNumber && (
        <EditOrderNumberDialog 
          orderId={orderToEditNumber.id} 
          currentOrderNumber={orderToEditNumber.order_number} 
          currentDisplayNumber={orderToEditNumber.display_order_number} 
          open={!!orderToEditNumber} 
          onOpenChange={open => !open && setOrderToEditNumber(null)} 
          onSuccess={() => {
            loadOrders();
            setOrderToEditNumber(null);
          }} 
        />
      )}

      {/* GHN Tracking Dialog */}
      {orderToGHNTracking && (
        <GHNTrackingDialog 
          order={orderToGHNTracking} 
          open={!!orderToGHNTracking} 
          onOpenChange={open => !open && setOrderToGHNTracking(null)} 
          onTrackingAdded={() => {
            loadOrders();
            setOrderToGHNTracking(null);
          }} 
        />
      )}

      {/* Create GHN Order Dialog */}
      {orderToCreateGHN && (
        <CreateGHNOrderDialog
          order={orderToCreateGHN}
          open={!!orderToCreateGHN}
          onOpenChange={open => !open && setOrderToCreateGHN(null)}
          remainingAmount={calculateRemainingAmount(orderToCreateGHN)}
          onSuccess={() => {
            loadOrders();
          }}
        />
      )}

    </div>
  );
}