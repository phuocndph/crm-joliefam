import React, { useState, useEffect } from "react";
import { Search, Plus, Package, Eye, Edit, Trash2, Filter, MoreHorizontal, CheckCircle, Clock, XCircle, AlertCircle, DollarSign, CalendarDays, Truck, CreditCard, Edit3, RotateCcw, MapPin, Navigation, Zap, Printer } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useOrders } from "@/hooks/useOrders";
import { useUserRole } from "@/hooks/useUserRole";
import { ManagerSelector } from "@/components/ManagerSelector";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("orders");
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [printA5Url, setPrintA5Url] = useState<string | null>(null);
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const { role: userRole } = useUserRole(user);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    document.title = "Quản lý Đơn hàng | Hệ thống";
  }, []);

  const managerFilter = (userRole === 'admin' || userRole === 'accountant')
    ? selectedManagerId
    : (userRole === 'manager' && (user as any)?.id) ? (user as any).id : undefined;
  console.log('[Orders] role:', userRole, 'selectedManagerId:', selectedManagerId, 'managerFilter:', managerFilter);
  const { data: orders = [], isLoading: loading, refetch: loadOrders } = useOrders({ managerId: managerFilter }) as any;
  console.log('[Orders] fetched:', orders.length, 'unique managers:', Array.from(new Set(orders.map((o:any)=>o.manager_id))).length);
  const { toast } = useToast();

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
    loadOrders();
    setOrderToEdit(null);
    toast({
      title: "Thành công",
      description: "Đơn hàng đã được cập nhật thành công"
    });
  };

  const handleDeleteOrder = () => {
    loadOrders();
    setOrderToDelete(null);
    toast({
      title: "Thành công",
      description: "Đơn hàng đã được xóa thành công"
    });
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const updateData: any = {
        status: newStatus
      };

      // If order is delivered or shipped, set delivered_date
      if (newStatus === 'delivered' || newStatus === 'shipped') {
        updateData.delivered_date = new Date().toISOString();
      }
      const {
        error
      } = await supabase.from('orders').update(updateData).eq('id', orderId);
      if (error) throw error;

      // If order is delivered, create transaction
      if (newStatus === 'delivered') {
        const order = orders.find(o => o.id === orderId);
        if (order && order.total_amount) {
          await supabase.from('transactions').insert({
            amount: order.total_amount,
            type: 'income',
            category: 'sales',
            description: `Thanh toán đơn hàng ${getOrderDisplayNumber(order)}`,
            date: new Date().toISOString(),
            tenant_id: 'default',
            manager_id: (order as any).manager_id || null,
          });
        }
      }

      // Refetch data to get updated state
      loadOrders();
      toast({
        title: "Thành công",
        description: "Trạng thái đơn hàng đã được cập nhật"
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái đơn hàng",
        variant: "destructive"
      });
    }
  };

  const handlePaymentAdded = async () => {
    try {
      await loadOrders();
      toast({
        title: "Thành công",
        description: "Thanh toán đã được thêm thành công"
      });
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

  // Calculate stats
  const stats = [{
    title: "Tổng đơn hàng",
    value: orders.length,
    icon: Package,
    color: "text-blue-600",
    bgColor: "bg-blue-100"
  }, {
    title: "Chờ xử lý",
    value: orders.filter(order => order.status === 'pending').length,
    icon: Clock,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100"
  }, {
    title: "Hoàn thành",
    value: orders.filter(order => order.status === 'delivered').length,
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100"
  }, {
    title: "Tổng giá trị",
    value: `${orders.filter(order => order.status === 'delivered').reduce((sum, order) => sum + (order.total_amount || 0), 0).toLocaleString("vi-VN")} VNĐ`,
    icon: DollarSign,
    color: "text-purple-600",
    bgColor: "bg-purple-100"
  }];

  const getDefaultDeliveryDate = (createdAt: string) => {
    const orderDate = new Date(createdAt);
    const deliveryDate = new Date(orderDate);
    deliveryDate.setDate(orderDate.getDate() + 4);
    return deliveryDate.toISOString().split('T')[0];
  };

  const isDeliveryDateNear = (deliveryDate: string | null, status: string) => {
    if (!deliveryDate || status === 'delivered' || status === 'shipped') return false;
    const delivery = new Date(deliveryDate);
    const today = new Date();
    const diffTime = delivery.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  };

  const getDaysUntilDelivery = (deliveryDate: string) => {
    const today = new Date();
    const delivery = new Date(deliveryDate);
    const diffTime = delivery.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get delivery tracking orders
  const deliveryOrders = orders.filter(order => order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered' && order.delivered_date && new Date().getTime() - new Date(order.delivered_date).getTime() < 7 * 24 * 60 * 60 * 1000 // Last 7 days
  );

  const getDeliveryStatus = (order: Order) => {
    if (order.status === 'delivered') return 'Đã giao thành công';
    if (order.status === 'shipped') return 'Đang vận chuyển';
    if (order.status === 'processing') return 'Đang chuẩn bị hàng';
    return 'Chờ xử lý';
  };

  const getDeliveryStatusColor = (order: Order) => {
    if (order.status === 'delivered') return 'bg-green-100 text-green-800';
    if (order.status === 'shipped') return 'bg-blue-100 text-blue-800';
    if (order.status === 'processing') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  // Calculate payment totals
  const calculateTotalPaid = (order: Order | null): number => {
    if (!order) return 0;
    // Use total_paid from useOrders hook which calculates correctly
    return (order as any).total_paid || 0;
  };

  const calculateRemainingAmount = (order: Order | null): number => {
    if (!order) return 0;
    const totalAmount = order.total_amount || 0;
    const totalPaid = calculateTotalPaid(order);
    return Math.max(0, totalAmount - totalPaid);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý Đơn hàng</h1>
          <p className="text-muted-foreground">
            Theo dõi và quản lý đơn hàng, thanh toán và giao hàng
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(userRole === 'admin' || userRole === 'accountant') && (
            <ManagerSelector
              selectedManagerId={selectedManagerId}
              onManagerChange={setSelectedManagerId}
            />
          )}
          <Button onClick={() => navigate('/quotes?create=true')} className="gap-2">
            <Plus className="h-4 w-4" />
            Tạo báo giá
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="orders">
          {/* Search and Filter */}
          <Card>
            <CardHeader>
              <CardTitle>Danh sách Đơn hàng</CardTitle>
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input placeholder="Tìm kiếm theo mã đơn, khách hàng..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-48">
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
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Trạng thái" />
                    </SelectTrigger>
                    <SelectContent className="bg-white z-50">
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="pending">Chờ xử lý</SelectItem>
                      <SelectItem value="processing">Đang xử lý</SelectItem>
                      <SelectItem value="shipped">Đã giao</SelectItem>
                      <SelectItem value="delivered">Hoàn thành</SelectItem>
                      <SelectItem value="cancelled">Đã hủy</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Thanh toán" />
                    </SelectTrigger>
                    <SelectContent className="bg-white z-50">
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="pending">Chưa thanh toán</SelectItem>
                      <SelectItem value="partial">Thanh toán 1 phần</SelectItem>
                      <SelectItem value="paid">Đã thanh toán</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Đang tải...</div>
              ) : (
                <InlineOrderEditTable
                  orders={sortedOrders}
                  onOrderUpdate={async (orderId, updates) => {
                    try {
                      // Update order
                      const { error } = await supabase
                        .from('orders')
                        .update(updates)
                        .eq('id', orderId);
                      
                      if (error) throw error;
                      
                      // Sync assignee_id to customer if it was updated
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
            </CardContent>
          </Card>
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
                            setPrintA5Url(data.data.printUrl);
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
                  <Button onClick={() => setOrderToPayment(selectedOrder)} variant="default" className="gap-2">
                    <CreditCard className="h-4 w-4" />
                    Thêm thanh toán
                  </Button>
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

      {/* Print A5 Dialog */}
      <Dialog open={!!printA5Url} onOpenChange={open => !open && setPrintA5Url(null)}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>In phiếu vận đơn A5</DialogTitle>
          </DialogHeader>
          {printA5Url && (
            <iframe
              src={printA5Url}
              className="w-full border-0"
              style={{ height: 'calc(95vh - 80px)' }}
              title="Phiếu vận đơn A5"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}