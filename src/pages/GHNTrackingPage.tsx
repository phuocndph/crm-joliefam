import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, Download, Truck, Package, ExternalLink, MapPin, Phone, Calendar, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface GHNOrder {
  orderCode: string;
  status: string;
  statusText: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  weight: number;
  createdDate: string;
  expectedDeliveryTime?: string;
  deliveredDate?: string;
  codAmount: number;
  trackingUrl: string;
}

export default function GHNTrackingPage() {
  const [orders, setOrders] = useState<GHNOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [singleOrderCode, setSingleOrderCode] = useState("");
  const { toast } = useToast();

  const fetchAllOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'fetch_all_orders' }
      });

      if (error) throw error;

      if (data.success) {
        setOrders(data.data);
        toast({
          title: "Thành công",
          description: data.message,
          duration: 3000,
        });
      } else {
        throw new Error(data.error || 'Failed to fetch orders');
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể lấy dữ liệu từ GHN",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const trackSingleOrder = async () => {
    if (!singleOrderCode.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập mã đơn hàng",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { 
          action: 'track_order',
          orderCode: singleOrderCode.trim()
        }
      });

      if (error) throw error;

      if (data.success) {
        // Add the single order to the list (or replace if exists)
        setOrders(prev => {
          const filtered = prev.filter(order => order.orderCode !== data.data.orderCode);
          return [data.data, ...filtered];
        });
        setSingleOrderCode("");
        toast({
          title: "Thành công",
          description: "Đã tìm thấy đơn hàng",
          duration: 2000,
        });
      } else {
        throw new Error(data.error || 'Order not found');
      }
    } catch (error) {
      console.error('Error tracking order:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không tìm thấy đơn hàng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colorMap = {
      'ready_to_pick': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'picking': 'bg-yellow-200 text-yellow-900 border-yellow-300',
      'storing': 'bg-orange-100 text-orange-800 border-orange-200',
      'transporting': 'bg-blue-100 text-blue-800 border-blue-200',
      'delivering': 'bg-purple-100 text-purple-800 border-purple-200',
      'delivered': 'bg-green-100 text-green-800 border-green-200',
      'cancel': 'bg-red-100 text-red-800 border-red-200',
      'delivery_fail': 'bg-red-100 text-red-800 border-red-200',
      'returning': 'bg-pink-100 text-pink-800 border-pink-200',
      'return_transporting': 'bg-orange-200 text-orange-900 border-orange-300',
      'returned': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const formatWeight = (weight: number) => {
    return `${(weight / 1000).toFixed(1)} kg`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Chưa có";
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm');
    } catch {
      return "Ngày không hợp lệ";
    }
  };

  const formatCOD = (amount: number) => {
    return amount.toLocaleString('vi-VN') + 'đ';
  };

  const filteredOrders = orders.filter(order =>
    order.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerPhone.includes(searchTerm)
  );

  const exportToCSV = () => {
    const headers = [
      'Mã GHN', 'Trạng thái', 'Tên khách hàng', 'Số điện thoại', 'Địa chỉ', 
      'Cân nặng', 'Ngày tạo', 'Ngày dự kiến giao', 'Ngày giao thành công', 'COD'
    ];
    
    const csvData = filteredOrders.map(order => [
      order.orderCode,
      order.statusText,
      order.customerName,
      order.customerPhone,
      order.customerAddress,
      formatWeight(order.weight),
      formatDate(order.createdDate),
      formatDate(order.expectedDeliveryTime),
      order.deliveredDate ? formatDate(order.deliveredDate) : 'Chưa giao',
      formatCOD(order.codAmount)
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ghn-orders-${format(new Date(), 'dd-MM-yyyy')}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Theo dõi giao hàng GHN</h1>
            <p className="text-sm text-muted-foreground">
              Lấy dữ liệu trực tiếp từ hệ thống Giao Hàng Nhanh
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2" disabled={orders.length === 0}>
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
          <Button onClick={fetchAllOrders} disabled={loading} size="sm" className="gap-2">
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            Lấy tất cả đơn từ GHN
          </Button>
        </div>
      </div>

      {/* Single Order Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Tra cứu đơn hàng cụ thể
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Nhập mã đơn hàng GHN..."
              value={singleOrderCode}
              onChange={(e) => setSingleOrderCode(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && trackSingleOrder()}
              className="flex-1"
            />
            <Button onClick={trackSingleOrder} disabled={loading}>
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Tra cứu
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <span>Danh sách đơn hàng ({filteredOrders.length})</span>
              </CardTitle>
              {orders.length > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>{orders.filter(o => o.status === 'delivered').length} đã giao</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <span>{orders.filter(o => ['transporting', 'delivering'].includes(o.status)).length} đang giao</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                    <span>{orders.filter(o => ['ready_to_pick', 'picking'].includes(o.status)).length} chờ lấy</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm theo mã đơn, tên khách hàng, SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-80"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && orders.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Đang lấy dữ liệu từ GHN...</p>
              </div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Chưa có dữ liệu đơn hàng</p>
              <p className="text-sm mt-1">Bấm "Lấy tất cả đơn từ GHN" để bắt đầu</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Mã GHN</TableHead>
                    <TableHead className="min-w-[120px]">Trạng thái</TableHead>
                    <TableHead className="min-w-[150px]">Khách hàng</TableHead>
                    <TableHead className="min-w-[120px]">SĐT</TableHead>
                    <TableHead className="min-w-[200px]">Địa chỉ</TableHead>
                    <TableHead className="min-w-[80px]">Cân nặng</TableHead>
                    <TableHead className="min-w-[120px]">Ngày tạo</TableHead>
                    <TableHead className="min-w-[120px]">Dự kiến giao</TableHead>
                    <TableHead className="min-w-[120px]">Đã giao</TableHead>
                    <TableHead className="min-w-[100px]">COD</TableHead>
                    <TableHead className="min-w-[80px]">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.orderCode}>
                      <TableCell className="font-mono font-medium text-sm">
                        {order.orderCode}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(order.status)}>
                          {order.statusText}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="break-words">
                          <div className="font-medium">{order.customerName}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{order.customerPhone}</TableCell>
                      <TableCell>
                        <div className="max-w-[200px] break-words text-sm" title={order.customerAddress}>
                          {order.customerAddress}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{formatWeight(order.weight)}</TableCell>
                      <TableCell className="text-sm">{formatDate(order.createdDate)}</TableCell>
                      <TableCell className="text-sm">{formatDate(order.expectedDeliveryTime)}</TableCell>
                      <TableCell>
                        {order.deliveredDate ? (
                          <span className="text-green-600 font-medium text-sm">
                            {formatDate(order.deliveredDate)}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-sm">Chưa giao</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {formatCOD(order.codAmount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(order.trackingUrl, '_blank')}
                          className="gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}