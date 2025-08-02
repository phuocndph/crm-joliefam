import React, { useState, useEffect } from "react";
import { Search, Plus, Package, Eye, Edit, Trash2, Filter, MoreHorizontal, CheckCircle, Clock, XCircle, AlertCircle, DollarSign, CalendarDays, Truck, CreditCard, Edit3, RotateCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateOrderForm } from "@/components/CreateOrderForm";
import { EditOrderDialog } from "@/components/EditOrderDialog";
import { DeleteOrderDialog } from "@/components/DeleteOrderDialog";
import { CreatePaymentForm } from "@/components/CreatePaymentForm";
import { EditOrderNumberDialog } from "@/components/EditOrderNumberDialog";
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
    id: string;
    customer_code: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
  } | null;
}

const statusConfig = {
  pending: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-600 hover:text-white", icon: Clock },
  processing: { label: "Đang xử lý", color: "bg-blue-100 text-blue-800 hover:bg-blue-600 hover:text-white", icon: AlertCircle },
  shipped: { label: "Đã giao", color: "bg-green-100 text-green-800 hover:bg-green-600 hover:text-white", icon: Truck },
  delivered: { label: "Hoàn thành", color: "bg-green-100 text-green-800 hover:bg-green-600 hover:text-white", icon: CheckCircle },
  cancelled: { label: "Đã hủy", color: "bg-red-100 text-red-800 hover:bg-red-600 hover:text-white", icon: XCircle },
  self_delivered: { label: "Đã giao tự thu tiền", color: "bg-purple-100 text-purple-800 hover:bg-purple-600 hover:text-white", icon: Truck },
  returned: { label: "Hoàn Hàng", color: "bg-orange-100 text-orange-800 hover:bg-orange-600 hover:text-white", icon: RotateCcw },
};

const paymentStatusConfig = {
  pending: { label: "Chưa thanh toán", color: "bg-red-100 text-red-800" },
  partial: { label: "Thanh toán 1 phần", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Đã thanh toán", color: "bg-green-100 text-green-800" },
};

export default function OrderManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToPayment, setOrderToPayment] = useState<Order | null>(null);
  const [orderToEditNumber, setOrderToEditNumber] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderPayments, setOrderPayments] = useState<{[orderId: string]: number}>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      getOrderDisplayNumber(order).toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.phone?.includes(searchTerm);

    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesPayment = paymentFilter === "all" || order.payment_status === paymentFilter;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (sortBy) {
      case "order_number":
        return getOrderDisplayNumber(a).localeCompare(getOrderDisplayNumber(b));
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

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customers (
            id,
            customer_code,
            name,
            email,
            phone,
            company
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Add payment amounts from order_payments
      const ordersWithPayments = await Promise.all(
        (data || []).map(async (order) => {
          const { data: payments } = await supabase
            .from('order_payments')
            .select('payment_amount')
            .eq('order_id', order.id);
          
          const totalPaid = payments?.reduce((sum, payment) => sum + payment.payment_amount, 0) || 0;
          
          return {
            ...order,
            total_paid: totalPaid
          };
        })
      );
      
      setOrders(ordersWithPayments);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách đơn hàng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

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

  const handleCreateOrder = () => {
    loadOrders();
    setShowCreateForm(false);
    toast({
      title: "Thành công",
      description: "Đơn hàng đã được tạo thành công",
    });
  };

  const handleEditOrder = () => {
    loadOrders();
    setOrderToEdit(null);
    toast({
      title: "Thành công",
      description: "Đơn hàng đã được cập nhật thành công",
    });
  };

  const handleDeleteOrder = () => {
    loadOrders();
    setOrderToDelete(null);
    toast({
      title: "Thành công",
      description: "Đơn hàng đã được xóa thành công",
    });
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      
      // If order is delivered or shipped, set delivered_date
      if (newStatus === 'delivered' || newStatus === 'shipped') {
        updateData.delivered_date = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

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
          });
        }
      }

      // Update local state instead of reloading
      setOrders(prevOrders => 
        prevOrders.map(o => 
          o.id === orderId 
            ? { ...o, ...updateData }
            : o
        )
      );

      toast({
        title: "Thành công",
        description: "Trạng thái đơn hàng đã được cập nhật",
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái đơn hàng",
        variant: "destructive",
      });
    }
  };

  const handlePaymentAdded = () => {
    loadOrders();
    setOrderToPayment(null);
    toast({
      title: "Thành công",
      description: "Thanh toán đã được thêm thành công",
    });
  };

  // Calculate stats
  const stats = [
    {
      title: "Tổng đơn hàng",
      value: orders.length,
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Chờ xử lý",
      value: orders.filter(order => order.status === 'pending').length,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
    },
    {
      title: "Hoàn thành",
      value: orders.filter(order => order.status === 'delivered').length,
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Tổng giá trị",
      value: `${orders
        .filter(order => order.status === 'delivered')
        .reduce((sum, order) => sum + (order.total_amount || 0), 0)
        .toLocaleString("vi-VN")} VNĐ`,
      icon: DollarSign,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý Đơn hàng</h1>
          <p className="text-muted-foreground">
            Theo dõi và quản lý đơn hàng, thanh toán và giao hàng
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Tạo đơn hàng
        </Button>
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

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Đơn hàng</CardTitle>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Tìm kiếm theo mã đơn, khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
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
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Lọc trạng thái đơn" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="pending">Chờ xử lý</SelectItem>
                  <SelectItem value="processing">Đang xử lý</SelectItem>
                  <SelectItem value="shipped">Đã giao</SelectItem>
                  <SelectItem value="delivered">Hoàn thành</SelectItem>
                  <SelectItem value="cancelled">Đã hủy</SelectItem>
                  <SelectItem value="self_delivered">Đã giao tự thu tiền</SelectItem>
                  <SelectItem value="returned">Hoàn Hàng</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Lọc thanh toán" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  <SelectItem value="all">Tất cả thanh toán</SelectItem>
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
            <div className="flex justify-center py-8">
              <span>Đang tải...</span>
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Package className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" || paymentFilter !== "all" 
                  ? "Không tìm thấy đơn hàng nào" 
                  : "Chưa có đơn hàng nào"}
              </p>
              {!searchTerm && statusFilter === "all" && paymentFilter === "all" && (
                <Button onClick={() => setShowCreateForm(true)} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Tạo đơn hàng đầu tiên
                </Button>
              )}
            </div>
          ) : (
            <InlineOrderEditTable 
              orders={sortedOrders}
              onOrderUpdate={async (orderId: string, updates: Partial<Order>) => {
                try {
                  const updateData: any = { ...updates };
                  
                  // Handle special cases for status changes
                  if (updates.status) {
                    if (updates.status === 'delivered' || updates.status === 'shipped') {
                      updateData.delivered_date = new Date().toISOString();
                    }
                    
                    // Create transaction for delivered orders
                    if (updates.status === 'delivered') {
                      const order = orders.find(o => o.id === orderId);
                      if (order?.total_amount) {
                        const { error: transactionError } = await supabase
                          .from('transactions')
                          .insert({
                            type: 'income',
                            amount: order.total_amount,
                            description: `Hoàn thành đơn hàng ${getOrderDisplayNumber(order)}`,
                            order_id: orderId,
                            category: 'order_completion',
                            date: new Date().toISOString()
                          });
                        
                        if (transactionError) console.error('Error creating transaction:', transactionError);
                      }
                    }
                  }

                  const { error } = await supabase
                    .from('orders')
                    .update(updateData)
                    .eq('id', orderId);

                  if (error) throw error;

                  // Update local state
                  console.log('Before update - orderId:', orderId, 'updateData:', updateData);
                  setOrders(prevOrders => {
                    const newOrders = prevOrders.map(o => 
                      o.id === orderId 
                        ? { ...o, ...updateData }
                        : o
                    );
                    console.log('Updated orders:', newOrders.find(o => o.id === orderId));
                    return newOrders;
                  });

                  toast({
                    title: "Thành công",
                    description: "Đơn hàng đã được cập nhật",
                  });
                } catch (error) {
                  console.error('Error updating order:', error);
                  toast({
                    title: "Lỗi",
                    description: "Không thể cập nhật đơn hàng",
                    variant: "destructive",
                  });
                }
              }}
              onDeleteOrder={(order) => setOrderToDelete(order)}
              onViewOrderDetail={(order) => setSelectedOrder(order)}
            />
          )}
        </CardContent>
      </Card>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <p className="text-gray-600 mt-1">
                    Mã đơn: <span className="font-medium">{selectedOrder ? getOrderDisplayNumber(selectedOrder) : ''}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className={`inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors border-transparent text-sm px-2.5 py-1 ${statusConfig[selectedOrder?.status || 'pending']?.color}`}>
                    <CheckCircle className="w-3 h-3" />
                    <span>{statusConfig[selectedOrder?.status || 'pending']?.label}</span>
                  </div>
                </div>
              </div>

              {/* Customer and Quote Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Info Card */}
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader className="bg-blue-100 border-b border-blue-200">
                    <CardTitle className="text-2xl font-semibold text-blue-800 text-center">
                      THÔNG TIN KHÁCH HÀNG:
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex justify-between">
                      <span className="font-medium">Tên KH:</span>
                      <span className="font-medium">{selectedOrder?.customers?.name || "Khách lẻ"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">SĐT:</span>
                      <span className="font-medium">{selectedOrder?.customers?.phone || "Chưa có"}</span>
                    </div>
                    <div>
                      <div className="font-medium mb-1">Địa chỉ:</div>
                      <div className="text-sm">{selectedOrder?.customers?.company || "Chưa có thông tin"}</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quote Info Card */}
                <Card className="bg-green-50 border-green-200">
                  <CardHeader className="bg-green-100 border-b border-green-200">
                    <CardTitle className="text-2xl font-semibold text-green-800 text-center">
                      THÔNG TIN BÁO GIÁ:
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex justify-between">
                      <span className="font-medium">Số báo giá:</span>
                      <span className="font-medium">{selectedOrder ? getOrderDisplayNumber(selectedOrder) : ''}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Ngày báo giá:</span>
                      <span className="font-medium">
                        {format(new Date(selectedOrder?.created_at || new Date()), "d/M/yyyy")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Ngày hết hạn:</span>
                      <span className="font-medium">
                        {format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "d/M/yyyy")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Products Table */}
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-yellow-100 border-b">
                        <th className="text-center py-3 px-2 font-bold text-sm min-w-[50px]">STT</th>
                        <th className="text-center py-3 px-3 font-bold text-sm min-w-[150px]">SẢN PHẨM</th>
                        <th className="text-center py-3 px-2 font-bold text-sm min-w-[100px]">QUY CÁCH (CM)</th>
                        <th className="text-center py-3 px-2 font-bold text-sm min-w-[100px]">CHẤT LIỆU</th>
                        <th className="text-center py-3 px-2 font-bold text-sm min-w-[80px]">SỐ LƯỢNG</th>
                        <th className="text-center py-3 px-2 font-bold text-sm min-w-[100px]">ĐƠN GIÁ</th>
                        <th className="text-center py-3 px-2 font-bold text-sm min-w-[120px]">THÀNH TIỀN</th>
                        <th className="text-center py-3 px-2 font-bold text-sm min-w-[80px]">Ghi Chú</th>
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
                                <td colSpan={8} className="px-4 py-8 text-center text-red-500">
                                  Lỗi định dạng dữ liệu sản phẩm
                                </td>
                              </tr>
                            );
                          }
                        }
                        
                        if (Array.isArray(itemsToDisplay) && itemsToDisplay.length > 0) {
                          return itemsToDisplay.map((item: any, index: number) => (
                            <tr key={index} className="border-b">
                              <td className="py-3 px-2 text-center font-medium">{index + 1}</td>
                              <td className="py-3 px-3">
                                <div className="font-medium text-sm">{item.name || `Sản phẩm ${index + 1}`}</div>
                              </td>
                              <td className="py-3 px-2 text-center text-sm">{item.specifications || "Thông số kỹ thuật"}</td>
                              <td className="py-3 px-2 text-center text-sm">{item.material || "Thép"}</td>
                              <td className="py-3 px-2 text-center">
                                <span className="font-medium text-sm">{item.quantity || 1}</span>
                              </td>
                              <td className="py-3 px-2 text-right">
                                <span className="font-medium text-sm">{(item.price || 0).toLocaleString()}đ</span>
                              </td>
                              <td className="py-3 px-2 text-right">
                                <span className="font-bold text-sm text-red-600">
                                  {((item.quantity || 1) * (item.price || 0)).toLocaleString()}đ
                                </span>
                              </td>
                              <td className="py-3 px-2 text-center text-xs text-gray-500">{item.notes || "-"}</td>
                            </tr>
                          ));
                        }
                        
                        return (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                              Không có thông tin sản phẩm
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                
                {/* Total Summary */}
                <div className="border-t bg-gray-50">
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-red-600">TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT</span>
                      <span className="text-red-600">
                        {Math.round((selectedOrder?.total_amount || 0) / 1.08).toLocaleString()}đ
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-red-600">GTGT (8%)</span>
                      <span className="text-red-600">
                        {Math.round((selectedOrder?.total_amount || 0) - (selectedOrder?.total_amount || 0) / 1.08).toLocaleString()}đ
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-red-600">TỔNG TIỀN ĐÃ BAO GỒM GTGT</span>
                      <span className="text-red-600">{(selectedOrder?.total_amount || 0).toLocaleString()}đ</span>
                    </div>
                     <div className="flex justify-between text-sm font-bold">
                       <span className="text-red-600">THANH TOÁN ĐÃ NHẬN</span>
                       <span className="text-red-600">
                         {calculateTotalPaid(selectedOrder).toLocaleString()}đ
                       </span>
                     </div>
                    <div className="bg-yellow-100 p-3 rounded">
                      <div className="flex justify-between text-sm font-bold">
                        <span className="text-red-600">CÒN LẠI</span>
                        <span className="text-red-600">
                          {calculateRemainingAmount(selectedOrder).toLocaleString()}đ
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Terms and Conditions */}
                <div className="bg-white p-4 border-t text-sm">
                  <p className="font-medium">1. Báng báo giá áp dụng trong vòng 10 ngày</p>
                  {selectedOrder?.notes && (
                    <p className="mt-2">Ghi chú: {selectedOrder.notes}</p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button 
                  onClick={() => setOrderToPayment(selectedOrder)}
                  variant="default"
                  className="gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  Thêm thanh toán
                </Button>
                <Button 
                  onClick={() => setSelectedOrder(null)}
                  variant="outline"
                >
                  Đóng
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Order Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <CreateOrderForm 
            onClose={() => setShowCreateForm(false)}
            onSubmit={handleCreateOrder}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      {orderToEdit && (
        <EditOrderDialog
          order={orderToEdit}
          open={!!orderToEdit}
          onOpenChange={(open) => !open && setOrderToEdit(null)}
          onSubmit={handleEditOrder}
        />
      )}

      {/* Delete Order Dialog */}
      {orderToDelete && (
        <DeleteOrderDialog
          order={orderToDelete}
          open={!!orderToDelete}
          onOpenChange={(open) => !open && setOrderToDelete(null)}
          onConfirm={handleDeleteOrder}
        />
      )}

      {/* Add Payment Dialog */}
      {orderToPayment && (
        <Dialog open={!!orderToPayment} onOpenChange={(open) => !open && setOrderToPayment(null)}>
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
          onOpenChange={(open) => !open && setOrderToEditNumber(null)}
          onSuccess={() => {
            loadOrders();
            setOrderToEditNumber(null);
          }}
        />
      )}
    </div>
  );

  function calculateRemainingAmount(order: Order | null): number {
    // Handle null/undefined order
    if (!order) return 0;
    
    // Use the total_paid amount that was loaded with the order
    const totalPaid = (order as any).total_paid || 0;
    return Math.max(0, (order.total_amount || 0) - totalPaid);
  }
  
  function calculateTotalPaid(order: Order | null): number {
    if (!order) return 0;
    return (order as any).total_paid || 0;
  }
}