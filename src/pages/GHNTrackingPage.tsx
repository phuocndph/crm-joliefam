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
  orderNumber: string;
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
      'ready_to_pick': 'bg-green-100 text-green-800 border-green-200', // Sẵn sàng lấy hàng
      'picking': 'bg-yellow-100 text-yellow-800 border-yellow-200', // Đang lấy hàng
      'storing': 'bg-orange-100 text-orange-800 border-orange-200', // Đang lưu kho
      'transporting': 'bg-blue-100 text-blue-800 border-blue-200', // Đang vận chuyển
      'delivering': 'bg-purple-100 text-purple-800 border-purple-200', // Đang giao hàng
      'delivered': 'bg-green-200 text-green-900 border-green-300', // Đã giao hàng
      'cancel': 'bg-red-100 text-red-800 border-red-200', // Đã hủy
      'delivery_fail': 'bg-red-100 text-red-800 border-red-200', // Giao hàng thất bại
      'returning': 'bg-pink-100 text-pink-800 border-pink-200', // Đang trả hàng
      'return_transporting': 'bg-orange-200 text-orange-900 border-orange-300', // Đang vận chuyển trả hàng
      'returned': 'bg-gray-200 text-gray-800 border-gray-300' // Hoàn hàng thành công
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getRowColor = (status: string) => {
    const colorMap = {
      'ready_to_pick': 'bg-green-50', // Sẵn sàng lấy hàng
      'picking': 'bg-yellow-50', // Đang lấy hàng  
      'storing': 'bg-orange-50', // Đang lưu kho
      'transporting': 'bg-blue-50', // Đang vận chuyển
      'delivering': 'bg-purple-50', // Đang giao hàng
      'delivered': 'bg-green-100', // Đã giao hàng
      'cancel': 'bg-red-50', // Đã hủy
      'delivery_fail': 'bg-red-50', // Giao hàng thất bại
      'returning': 'bg-pink-50', // Đang trả hàng
      'return_transporting': 'bg-orange-100', // Đang vận chuyển trả hàng
      'returned': 'bg-gray-100' // Hoàn hàng thành công
    };
    return colorMap[status] || '';
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
    order.orderNumber.includes(searchTerm) ||
    order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerPhone.includes(searchTerm)
  );

  const exportToCSV = () => {
    const headers = [
      'Mã GHN', 'Mã đơn hàng', 'Trạng thái', 'Tên khách hàng', 'Số điện thoại', 'Địa chỉ', 
      'Cân nặng', 'Ngày tạo', 'Ngày dự kiến giao', 'Ngày giao thành công', 'COD thu hộ'
    ];
    
    const csvData = filteredOrders.map(order => [
      order.orderCode,
      order.orderNumber,
      order.statusText,
      order.customerName,
      order.customerPhone,
      order.customerAddress,
      formatWeight(order.weight),
      formatDate(order.createdDate),
      formatDate(order.expectedDeliveryTime),
      order.deliveredDate ? formatDate(order.deliveredDate) : 'Chưa giao đến khách',
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
                placeholder="Tìm kiếm theo mã GHN, mã đơn hàng, tên khách hàng, SĐT..."
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
                  <TableRow className="bg-blue-50 border-b-2 border-blue-200">
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">MÃ GHN</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">MÃ ĐƠN HÀNG</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">TRẠNG THÁI ĐƠN HÀNG</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">TÊN KHÁCH HÀNG</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">SỐ ĐIỆN THOẠI</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">ĐỊA CHỈ</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">CÂN NẶNG ĐƠN HÀNG</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">NGÀY TẠO ĐƠN</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">NGÀY DỰ KIẾN GIAO</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">NGÀY GIAO THÀNH CÔNG</TableHead>
                    <TableHead className="font-bold text-center text-blue-900 border-r border-gray-300">COD THU HỘ ĐƠN</TableHead>
                    <TableHead className="font-bold text-center text-blue-900">TRA CỨU ĐƠN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order, index) => (
                    <TableRow 
                      key={order.orderCode}
                      className={`${getRowColor(order.status)} hover:bg-opacity-80 transition-colors border-b border-gray-200`}
                    >
                      <TableCell className="font-mono font-medium text-sm text-center border-r border-gray-200">
                        {order.orderCode}
                      </TableCell>
                      <TableCell className="font-medium text-center border-r border-gray-200">
                        {order.orderNumber || '-'}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-200">
                        <Badge className={getStatusColor(order.status)}>
                          {order.statusText}
                        </Badge>
                      </TableCell>
                      <TableCell className="border-r border-gray-200">
                        <div className="break-words">
                          <div className="font-medium">{order.customerName}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-center border-r border-gray-200">{order.customerPhone}</TableCell>
                      <TableCell className="border-r border-gray-200">
                        <div className="max-w-[200px] break-words text-sm" title={order.customerAddress}>
                          {order.customerAddress}
                        </div>
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-200 font-medium">{formatWeight(order.weight)}</TableCell>
                      <TableCell className="text-sm text-center border-r border-gray-200">{formatDate(order.createdDate)}</TableCell>
                      <TableCell className="text-sm text-center border-r border-gray-200">{formatDate(order.expectedDeliveryTime)}</TableCell>
                      <TableCell className="text-center border-r border-gray-200">
                        {order.deliveredDate ? (
                          <span className="text-green-600 font-medium text-sm">
                            {formatDate(order.deliveredDate)}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-sm">Chưa giao đến khách</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm text-center border-r border-gray-200">
                        <span className="text-green-600 font-semibold">
                          {formatCOD(order.codAmount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(order.trackingUrl, '_blank')}
                          className="gap-1 text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Tra cứu
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