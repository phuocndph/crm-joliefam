import React, { useState, useEffect } from "react";
import { Search, Plus, Package, Eye, Edit, Trash2, Filter, MoreHorizontal, CheckCircle, Clock, XCircle, AlertCircle, DollarSign, CalendarDays, Truck, CreditCard } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  total_amount: number | null;
  cost_price: number | null;
  profit_before: number | null;
  profit_after: number | null;
  status: string;
  payment_status: string;
  payment_date: string | null;
  delivery_date: string | null;
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
  pending: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  processing: { label: "Đang xử lý", color: "bg-blue-100 text-blue-800", icon: AlertCircle },
  shipped: { label: "Đã giao", color: "bg-green-100 text-green-800", icon: Truck },
  delivered: { label: "Hoàn thành", color: "bg-green-100 text-green-800", icon: CheckCircle },
  cancelled: { label: "Đã hủy", color: "bg-red-100 text-red-800", icon: XCircle },
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        return a.order_number.localeCompare(b.order_number);
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
      setOrders(data || []);
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
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
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
            description: `Thanh toán đơn hàng ${order.order_number}`,
            date: new Date().toISOString(),
            tenant_id: 'default',
          });
        }
      }

      loadOrders();
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn hàng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Giá trị</TableHead>
                  <TableHead>Trạng thái đơn</TableHead>
                  <TableHead>Thanh toán</TableHead>
                  <TableHead>Hẹn giao hàng</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : sortedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
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
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedOrders.map((order) => {
                    const daysUntilDelivery = order.delivery_date ? getDaysUntilDelivery(order.delivery_date) : null;
                    
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.order_number}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {order.customers?.name || "Khách lẻ"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {order.customers?.customer_code || order.customers?.phone || order.customers?.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {(order.total_amount || 0).toLocaleString("vi-VN")} VNĐ
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="p-0">
                                <Badge className={statusConfig[order.status]?.color || "bg-gray-100 text-gray-800"}>
                                  {statusConfig[order.status]?.label || order.status}
                                </Badge>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-white z-50">
                              {Object.entries(statusConfig).map(([key, config]) => (
                                <DropdownMenuItem
                                  key={key}
                                  onClick={() => updateOrderStatus(order.id, key)}
                                  className={order.status === key ? "bg-gray-100" : ""}
                                >
                                  <config.icon className="mr-2 h-4 w-4" />
                                  {config.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell>
                          <Badge className={paymentStatusConfig[order.payment_status]?.color || "bg-gray-100 text-gray-800"}>
                            {paymentStatusConfig[order.payment_status]?.label || order.payment_status}
                          </Badge>
                          {order.payment_date && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(order.payment_date), "dd/MM/yyyy", { locale: vi })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.delivery_date ? (
                            <div>
                              <div className="text-sm">
                                {format(new Date(order.delivery_date), "dd/MM/yyyy", { locale: vi })}
                              </div>
                              {daysUntilDelivery !== null && (
                                <div className={`text-xs ${
                                  daysUntilDelivery < 0 ? 'text-red-600' : 
                                  daysUntilDelivery === 0 ? 'text-orange-600' :
                                  daysUntilDelivery <= 3 ? 'text-yellow-600' : 'text-green-600'
                                }`}>
                                  {daysUntilDelivery < 0 ? `Trễ ${Math.abs(daysUntilDelivery)} ngày` :
                                   daysUntilDelivery === 0 ? 'Hôm nay' :
                                   `Còn ${daysUntilDelivery} ngày`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Chưa hẹn</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Mở menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white z-50">
                              <DropdownMenuItem
                                onClick={() => setSelectedOrder(order)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Xem chi tiết
                              </DropdownMenuItem>
                              {(order.payment_status === 'pending' || order.payment_status === 'partial') && (
                                <DropdownMenuItem
                                  onClick={() => setOrderToPayment(order)}
                                  className="text-green-600"
                                >
                                  <CreditCard className="mr-2 h-4 w-4" />
                                  Thêm thanh toán
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setOrderToEdit(order)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Sửa
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setOrderToDelete(order)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Xóa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết đơn hàng</DialogTitle>
            <DialogDescription>
              Thông tin chi tiết đơn hàng #{selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Thông tin đơn hàng</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Mã đơn hàng:</label>
                      <p className="text-sm text-muted-foreground">{selectedOrder.order_number}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Khách hàng:</label>
                      <p className="text-sm text-muted-foreground">
                        {selectedOrder.customers?.name || "Khách lẻ"}
                        {selectedOrder.customers?.customer_code && (
                          <span className="ml-2 text-xs">({selectedOrder.customers.customer_code})</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Trạng thái:</label>
                      <Badge className={`ml-2 ${statusConfig[selectedOrder.status]?.color}`}>
                        {statusConfig[selectedOrder.status]?.label}
                      </Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Thanh toán:</label>
                      <Badge className={`ml-2 ${paymentStatusConfig[selectedOrder.payment_status]?.color}`}>
                        {paymentStatusConfig[selectedOrder.payment_status]?.label}
                      </Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Ngày tạo:</label>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(selectedOrder.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                      </p>
                    </div>
                    {selectedOrder.delivery_date && (
                      <div>
                        <label className="text-sm font-medium">Hẹn giao hàng:</label>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(selectedOrder.delivery_date), "dd/MM/yyyy", { locale: vi })}
                        </p>
                      </div>
                    )}
                    {selectedOrder.payment_date && (
                      <div>
                        <label className="text-sm font-medium">Ngày thanh toán:</label>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(selectedOrder.payment_date), "dd/MM/yyyy", { locale: vi })}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Thông tin tài chính</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {(selectedOrder.total_amount || 0).toLocaleString("vi-VN")}
                        </div>
                        <div className="text-sm text-muted-foreground">Tổng tiền (VNĐ)</div>
                      </div>
                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">
                          {(selectedOrder.cost_price || 0).toLocaleString("vi-VN")}
                        </div>
                        <div className="text-sm text-muted-foreground">Giá vốn (VNĐ)</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-lg font-bold text-green-600">
                          {(selectedOrder.profit_before || 0).toLocaleString("vi-VN")}
                        </div>
                        <div className="text-sm text-muted-foreground">Lợi nhuận trước</div>
                      </div>
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <div className="text-lg font-bold text-purple-600">
                          {(selectedOrder.profit_after || 0).toLocaleString("vi-VN")}
                        </div>
                        <div className="text-sm text-muted-foreground">Lợi nhuận sau</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {selectedOrder.items && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sản phẩm</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {typeof selectedOrder.items === 'string' ? (
                        <p>{selectedOrder.items}</p>
                      ) : Array.isArray(selectedOrder.items) ? (
                        selectedOrder.items.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between p-2 border rounded">
                            <span>{item.name || `Sản phẩm ${index + 1}`}</span>
                            <span>{item.quantity || 1} x {(item.price || 0).toLocaleString("vi-VN")} VNĐ</span>
                          </div>
                        ))
                      ) : (
                        <p>Không có thông tin sản phẩm</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedOrder.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Ghi chú</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{selectedOrder.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
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
          <DialogContent className="max-w-2xl">
            <CreatePaymentForm
              orderId={orderToPayment.id}
              orderNumber={orderToPayment.order_number}
              totalAmount={orderToPayment.total_amount || 0}
              totalPaid={(orderToPayment.total_amount || 0) - (calculateRemainingAmount(orderToPayment))}
              remainingAmount={calculateRemainingAmount(orderToPayment)}
              onClose={() => setOrderToPayment(null)}
              onSubmit={handlePaymentAdded}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  function calculateRemainingAmount(order: Order): number {
    // This is a simplified calculation - in real app, we'd fetch from payment_summary
    if (order.payment_status === 'paid') return 0;
    if (order.payment_status === 'partial') return (order.total_amount || 0) * 0.5; // Example
    return order.total_amount || 0;
  }
}