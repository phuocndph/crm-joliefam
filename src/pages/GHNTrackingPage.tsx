import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, Download, Truck, Package } from "lucide-react";
import { format } from "date-fns";

interface GHNTrackingRecord {
  id: string;
  order_id: string;
  ghn_order_code: string;
  ghn_status: string;
  ghn_status_text: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  package_weight: number;
  created_date: string;
  expected_delivery_date: string;
  delivered_date?: string;
  cod_amount: number;
  tracking_url: string;
  orders?: {
    order_number: string;
    display_order_number?: string;
  };
}

export default function GHNTrackingPage() {
  const [trackingRecords, setTrackingRecords] = useState<GHNTrackingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadTrackingRecords();
  }, []);

  const loadTrackingRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('ghn_tracking')
        .select(`
          *,
          orders (
            order_number,
            display_order_number
          )
        `)
        .order('created_date', { ascending: false });

      if (error) throw error;
      setTrackingRecords(data || []);
    } catch (error) {
      console.error('Error loading tracking records:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải dữ liệu tracking",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'bulk_sync' }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Thành công",
          description: data.message,
        });
        await loadTrackingRecords();
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Error syncing:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể đồng bộ dữ liệu",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
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

  const getRowColor = (status: string) => {
    const colorMap = {
      'ready_to_pick': 'bg-yellow-50',
      'picking': 'bg-yellow-100',
      'storing': 'bg-orange-50',
      'transporting': 'bg-blue-50',
      'delivering': 'bg-purple-50',
      'delivered': 'bg-green-50',
      'cancel': 'bg-red-50',
      'delivery_fail': 'bg-red-50',
      'returning': 'bg-pink-50',
      'return_transporting': 'bg-orange-100',
      'returned': 'bg-gray-50'
    };
    return colorMap[status] || '';
  };

  const formatWeight = (weight: number) => {
    return `${weight / 1000} kg`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Chưa có";
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch {
      return "Ngày không hợp lệ";
    }
  };

  const formatCOD = (amount: number) => {
    return amount.toLocaleString('vi-VN') + 'đ';
  };

  const filteredRecords = trackingRecords.filter(record =>
    record.ghn_order_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.customer_phone.includes(searchTerm) ||
    record.orders?.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.orders?.display_order_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToCSV = () => {
    const headers = [
      'Mã GHN', 'Mã đơn hàng', 'Trạng thái đơn hàng', 'Tên khách hàng', 
      'Số điện thoại', 'Địa chỉ', 'Cân nặng đơn hàng', 'Ngày tạo đơn', 
      'Ngày dự kiến giao', 'Ngày giao thành công', 'Trả cứu COD thu hộ'
    ];
    
    const csvData = filteredRecords.map(record => [
      record.ghn_order_code,
      record.orders?.display_order_number || record.orders?.order_number || '',
      record.ghn_status_text,
      record.customer_name,
      record.customer_phone,
      record.customer_address,
      formatWeight(record.package_weight),
      formatDate(record.created_date),
      formatDate(record.expected_delivery_date),
      record.delivered_date ? formatDate(record.delivered_date) : 'Chưa giao đến khách',
      formatCOD(record.cod_amount)
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ghn-tracking-${format(new Date(), 'dd-MM-yyyy')}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Theo dõi giao hàng GHN</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportToCSV} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
          <Button onClick={handleBulkSync} disabled={syncing} className="gap-2">
            {syncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            Đồng bộ tất cả
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Danh sách đơn hàng ({filteredRecords.length})</span>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Tìm kiếm theo mã GHN, tên khách hàng, SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-80"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã GHN</TableHead>
                    <TableHead>Mã đơn hàng</TableHead>
                    <TableHead>Trạng thái đơn hàng</TableHead>
                    <TableHead>Tên khách hàng</TableHead>
                    <TableHead>Số điện thoại</TableHead>
                    <TableHead>Địa chỉ</TableHead>
                    <TableHead>Cân nặng đơn hàng</TableHead>
                    <TableHead>Ngày tạo đơn</TableHead>
                    <TableHead>Ngày dự kiến giao</TableHead>
                    <TableHead>Ngày giao thành công</TableHead>
                    <TableHead>Trả cứu COD thu hộ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow 
                      key={record.id} 
                      className={getRowColor(record.ghn_status)}
                    >
                      <TableCell className="font-mono font-medium">
                        {record.ghn_order_code}
                      </TableCell>
                      <TableCell>
                        {record.orders?.display_order_number || record.orders?.order_number || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(record.ghn_status)}>
                          {record.ghn_status_text}
                        </Badge>
                      </TableCell>
                      <TableCell>{record.customer_name}</TableCell>
                      <TableCell>{record.customer_phone}</TableCell>
                      <TableCell className="max-w-xs truncate" title={record.customer_address}>
                        {record.customer_address}
                      </TableCell>
                      <TableCell>{formatWeight(record.package_weight)}</TableCell>
                      <TableCell>{formatDate(record.created_date)}</TableCell>
                      <TableCell>{formatDate(record.expected_delivery_date)}</TableCell>
                      <TableCell>
                        {record.delivered_date ? (
                          <span className="text-green-600 font-medium">
                            {formatDate(record.delivered_date)}
                          </span>
                        ) : (
                          <span className="text-gray-500">Chưa giao đến khách</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCOD(record.cod_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredRecords.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500">
                  Không có dữ liệu tracking
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}