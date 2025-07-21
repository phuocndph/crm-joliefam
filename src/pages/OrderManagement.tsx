import React, { useState, useEffect } from "react";
import { Search, Plus, Package, Eye, Edit, Trash2, Filter, MoreHorizontal, CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";
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
import { CreateOrderForm } from "@/components/CreateOrderForm";
import { EditOrderDialog } from "@/components/EditOrderDialog";
import { DeleteOrderDialog } from "@/components/DeleteOrderDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  total_amount: number | null;
  status: string;
  notes: string | null;
  items: any;
  created_at: string;
  updated_at: string;
  customers?: {
    name: string;
    email: string | null;
    company: string | null;
  } | null;
}

const statusConfig = {
  pending: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  processing: { label: "Đang xử lý", color: "bg-blue-100 text-blue-800", icon: AlertCircle },
  shipped: { label: "Đã giao", color: "bg-green-100 text-green-800", icon: CheckCircle },
  delivered: { label: "Hoàn thành", color: "bg-green-100 text-green-800", icon: CheckCircle },
  cancelled: { label: "Đã hủy", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function OrderManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const filteredOrders = orders.filter(
    (order) =>
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customers (
            name,
            email,
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
      description: "Đơn hàng đã được cập nhật",
    });
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderToDelete.id);

      if (error) throw error;

      loadOrders();
      setOrderToDelete(null);
      toast({
        title: "Thành công",
        description: "Đơn hàng đã được xóa",
      });
    } catch (error) {
      console.error('Error deleting order:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa đơn hàng",
        variant: "destructive",
      });
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      // Tạo transaction record khi đơn hàng hoàn thành
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
        description: "Không thể cập nhật trạng thái",
        variant: "destructive",
      });
    }
  };

  // Calculate stats
  const stats = [
    {
      title: "Tổng đơn hàng",
      value: orders.length.toString(),
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Chờ xử lý",
      value: orders.filter(o => o.status === 'pending').length.toString(),
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      title: "Hoàn thành",
      value: orders.filter(o => o.status === 'delivered').length.toString(),
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Tổng giá trị",
      value: `${orders.reduce((sum, o) => sum + (o.total_amount || 0), 0).toLocaleString()} ₫`,
      icon: Package,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Quản lý Đơn hàng</h2>
        <div className="flex items-center space-x-2">
          <Button onClick={() => setShowCreateForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Tạo đơn hàng
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
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Orders Table */}
      <Card className="animate-scale-in">
        <CardHeader>
          <CardTitle>Danh sách Đơn hàng</CardTitle>
          <CardDescription>
            Xử lý và theo dõi đơn hàng của khách hàng
          </CardDescription>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm đơn hàng..."
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
                  <TableHead>Số đơn hàng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Giá trị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
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
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchTerm ? "Không tìm thấy đơn hàng nào" : "Chưa có đơn hàng nào"}
                        </p>
                        {!searchTerm && (
                          <Button onClick={() => setShowCreateForm(true)} variant="outline" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Tạo đơn hàng đầu tiên
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id} className="hover-scale">
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customers?.name || "Khách lẻ"}</div>
                          {order.customers?.company && (
                            <div className="text-sm text-muted-foreground">{order.customers.company}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{order.total_amount?.toLocaleString() || "0"} ₫</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="p-0 h-auto">
                              <Badge className={statusConfig[order.status as keyof typeof statusConfig]?.color || "bg-gray-100 text-gray-800"}>
                                {statusConfig[order.status as keyof typeof statusConfig]?.label || order.status}
                              </Badge>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-white z-50">
                            {Object.entries(statusConfig).map(([status, config]) => (
                              <DropdownMenuItem
                                key={status}
                                onClick={() => updateOrderStatus(order.id, status)}
                                className="flex items-center gap-2"
                              >
                                <config.icon className="h-4 w-4" />
                                {config.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>{format(new Date(order.created_at), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white z-50">
                            <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Xem chi tiết
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setOrderToEdit(order)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => setOrderToDelete(order)}
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Tạo đơn hàng mới</DialogTitle>
            <DialogDescription>
              Tạo đơn hàng cho khách hàng
            </DialogDescription>
          </DialogHeader>
          <CreateOrderForm 
            onClose={() => setShowCreateForm(false)}
            onSubmit={handleCreateOrder}
          />
        </DialogContent>
      </Dialog>

      {orderToEdit && (
        <EditOrderDialog 
          order={orderToEdit}
          open={!!orderToEdit}
          onOpenChange={(open) => !open && setOrderToEdit(null)}
          onSubmit={handleEditOrder}
        />
      )}

      {orderToDelete && (
        <DeleteOrderDialog
          order={orderToDelete}
          open={!!orderToDelete}
          onOpenChange={(open) => !open && setOrderToDelete(null)}
          onConfirm={handleDeleteOrder}
        />
      )}

      {/* Order Detail Dialog */}
      {selectedOrder && (
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Chi tiết đơn hàng #{selectedOrder.order_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Khách hàng</label>
                  <p className="text-base">{selectedOrder.customers?.name || "Khách lẻ"}</p>
                  {selectedOrder.customers?.company && (
                    <p className="text-sm text-gray-500">{selectedOrder.customers.company}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Trạng thái</label>
                  <div className="mt-1">
                    <Badge className={statusConfig[selectedOrder.status as keyof typeof statusConfig]?.color || "bg-gray-100 text-gray-800"}>
                      {statusConfig[selectedOrder.status as keyof typeof statusConfig]?.label || selectedOrder.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Tổng giá trị</label>
                  <p className="text-lg font-semibold">{selectedOrder.total_amount?.toLocaleString() || "0"} ₫</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Ngày tạo</label>
                  <p className="text-base">{format(new Date(selectedOrder.created_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>
              </div>

              {selectedOrder.items && (
                <div>
                  <label className="text-sm font-medium text-gray-500 mb-2 block">Sản phẩm</label>
                  <div className="border rounded-lg p-4">
                    <pre className="text-sm bg-gray-50 p-2 rounded">
                      {JSON.stringify(selectedOrder.items, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedOrder.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Ghi chú</label>
                  <p className="text-base">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}