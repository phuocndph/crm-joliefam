import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, Download, Truck, Package, ExternalLink } from "lucide-react";
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
      'ready_to_pick': 'bg-green-200 text-green-800', // Sẵn sàng lấy hàng
      'picking': 'bg-yellow-200 text-yellow-800', // Đang lấy hàng
      'storing': 'bg-orange-200 text-orange-800', // Đang lưu kho
      'transporting': 'bg-blue-200 text-blue-800', // Đang vận chuyển
      'delivering': 'bg-purple-200 text-purple-800', // Đang giao hàng
      'delivered': 'bg-green-300 text-green-900', // Đã giao hàng
      'cancel': 'bg-red-200 text-red-800', // Đã hủy
      'delivery_fail': 'bg-red-200 text-red-800', // Giao hàng thất bại
      'returning': 'bg-pink-200 text-pink-800', // Đang trả hàng
      'return_transporting': 'bg-orange-300 text-orange-900', // Đang vận chuyển trả hàng
      'returned': 'bg-orange-300 text-orange-900' // Hoàn hàng thành công
    };
    return colorMap[status] || 'bg-gray-200 text-gray-800';
  };

  const formatWeight = (weight: number) => {
    return `${weight / 1000} kg`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch {
      return "";
    }
  };

  const formatCOD = (amount: number) => {
    return `${amount.toLocaleString('vi-VN')} đ`;
  };

  const filteredOrders = orders.filter(order =>
    order.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.orderNumber.includes(searchTerm) ||
    order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerPhone.includes(searchTerm)
  );

  const exportToCSV = () => {
    const headers = [
      'MÃ GHN', 'MÃ ĐƠN HÀNG', 'TRẠNG THÁI ĐƠN HÀNG', 'TÊN KHÁCH HÀNG', 'SỐ ĐIỆN THOẠI', 'ĐỊA CHỈ', 
      'CÂN NẶNG ĐƠN HÀNG', 'NGÀY TẠO ĐƠN', 'NGÀY DỰ KIẾN GIAO', 'NGÀY GIAO THÀNH CÔNG', 'COD THU HỘ'
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
      order.deliveredDate ? formatDate(order.deliveredDate) : '',
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
            <CardTitle className="flex items-center gap-2">
              <span>Danh sách đơn hàng ({filteredOrders.length})</span>
            </CardTitle>
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
            <div className="overflow-x-auto border border-gray-300 rounded-lg">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-yellow-400 hover:bg-yellow-400">
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      MÃ GHN
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      MÃ ĐƠN HÀNG
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      TRẠNG THÁI ĐƠN HÀNG
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      TÊN KHÁCH HÀNG
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      SỐ ĐIỆN THOẠI
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      ĐỊA CHỈ
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      CÂN NẶNG ĐƠN HÀNG
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      NGÀY TẠO ĐƠN
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      NGÀY DỰ KIẾN GIAO
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      NGÀY GIAO THÀNH CÔNG
                    </TableHead>
                    <TableHead className="font-bold text-center text-black border-r border-gray-400 py-3 px-2 text-sm">
                      COD THU HỘ
                    </TableHead>
                    <TableHead className="font-bold text-center text-black py-3 px-2 text-sm">
                      TRA CỨU ĐƠN
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order, index) => (
                    <TableRow 
                      key={order.orderCode}
                      className={`${getStatusColor(order.status)} hover:opacity-80 transition-opacity border-b border-gray-300`}
                    >
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm font-mono">
                        {order.orderCode}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm font-bold">
                        {order.orderNumber || ''}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm font-medium">
                        {order.statusText}
                      </TableCell>
                      <TableCell className="border-r border-gray-300 py-2 px-2 text-sm">
                        {order.customerName}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm">
                        {order.customerPhone}
                      </TableCell>
                      <TableCell className="border-r border-gray-300 py-2 px-2 text-sm max-w-[200px] break-words">
                        {order.customerAddress}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm">
                        {formatWeight(order.weight)}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm">
                        {formatDate(order.createdDate)}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm">
                        {formatDate(order.expectedDeliveryTime)}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm">
                        {formatDate(order.deliveredDate)}
                      </TableCell>
                      <TableCell className="text-center border-r border-gray-300 py-2 px-2 text-sm font-bold">
                        {formatCOD(order.codAmount)}
                      </TableCell>
                      <TableCell className="text-center py-2 px-2">
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => window.open(order.trackingUrl, '_blank')}
                          className="text-blue-600 hover:text-blue-800 underline p-0 h-auto font-normal"
                        >
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