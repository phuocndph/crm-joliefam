import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, Download, Truck, Package, Clock, Eye, ExternalLink, MapPin, Phone, Calendar, DollarSign } from "lucide-react";
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
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const { toast } = useToast();

  const loadTrackingRecords = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLoading(true);
      }
      
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
      setLastUpdated(new Date());
      
      if (isBackground) {
        toast({
          title: "Đã cập nhật",
          description: "Dữ liệu tracking đã được đồng bộ",
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('Error loading tracking records:', error);
      if (!isBackground) {
        toast({
          title: "Lỗi",
          description: "Không thể tải dữ liệu tracking",
          variant: "destructive",
        });
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [toast]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadTrackingRecords(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadTrackingRecords]);

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('ghn-tracking-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ghn_tracking'
        },
        (payload) => {
          console.log('Real-time update:', payload);
          loadTrackingRecords(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTrackingRecords]);

  useEffect(() => {
    loadTrackingRecords();
  }, [loadTrackingRecords]);

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Theo dõi giao hàng GHN</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Cập nhật lần cuối: {format(lastUpdated, 'HH:mm:ss dd/MM/yyyy')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <span>{autoRefresh ? 'Tự động cập nhật' : 'Đã tắt tự động cập nhật'}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="h-6 px-2 text-xs"
                >
                  {autoRefresh ? 'Tắt' : 'Bật'}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            onClick={() => loadTrackingRecords()} 
            variant="outline" 
            size="sm" 
            className="gap-2"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
          <Button onClick={handleBulkSync} disabled={syncing} size="sm" className="gap-2">
            {syncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            Cập nhật trạng thái
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <span>Danh sách đơn hàng ({filteredRecords.length})</span>
              </CardTitle>
              {trackingRecords.length > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>{trackingRecords.filter(r => r.ghn_status === 'delivered').length} đã giao</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <span>{trackingRecords.filter(r => ['transporting', 'delivering'].includes(r.ghn_status)).length} đang giao</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                    <span>{trackingRecords.filter(r => ['ready_to_pick', 'picking'].includes(r.ghn_status)).length} chờ lấy</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm theo mã GHN, tên khách hàng, SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-80"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Không có dữ liệu tracking</p>
              <p className="text-sm mt-1">Thêm mã GHN để bắt đầu theo dõi</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Mã GHN</TableHead>
                      <TableHead className="min-w-[100px]">Mã đơn hàng</TableHead>
                      <TableHead className="min-w-[120px]">Trạng thái</TableHead>
                      <TableHead className="min-w-[150px]">Khách hàng</TableHead>
                      <TableHead className="min-w-[120px]">SĐT</TableHead>
                      <TableHead className="min-w-[200px]">Địa chỉ</TableHead>
                      <TableHead className="min-w-[80px]">Cân nặng</TableHead>
                      <TableHead className="min-w-[100px]">Ngày tạo</TableHead>
                      <TableHead className="min-w-[100px]">Dự kiến giao</TableHead>
                      <TableHead className="min-w-[100px]">Đã giao</TableHead>
                      <TableHead className="min-w-[100px]">COD</TableHead>
                      <TableHead className="min-w-[80px]">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => (
                      <TableRow 
                        key={record.id} 
                        className={`${getRowColor(record.ghn_status)} hover:bg-opacity-80 transition-colors`}
                      >
                        <TableCell className="font-mono font-medium text-sm">
                          {record.ghn_order_code}
                        </TableCell>
                        <TableCell className="font-medium">
                          {record.orders?.display_order_number || record.orders?.order_number || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(record.ghn_status)}>
                            {record.ghn_status_text}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="break-words">
                            <div className="font-medium">{record.customer_name}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{record.customer_phone}</TableCell>
                        <TableCell>
                          <div className="max-w-[200px] break-words text-sm" title={record.customer_address}>
                            {record.customer_address}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{formatWeight(record.package_weight)}</TableCell>
                        <TableCell className="text-sm">{formatDate(record.created_date)}</TableCell>
                        <TableCell className="text-sm">{formatDate(record.expected_delivery_date)}</TableCell>
                        <TableCell>
                          {record.delivered_date ? (
                            <span className="text-green-600 font-medium text-sm">
                              {formatDate(record.delivered_date)}
                            </span>
                          ) : (
                            <span className="text-gray-500 text-sm">Chưa giao</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {formatCOD(record.cod_amount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(record.tracking_url, '_blank')}
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

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {filteredRecords.map((record) => (
                  <Card key={record.id} className={`${getRowColor(record.ghn_status)} border-l-4 ${
                    record.ghn_status === 'delivered' ? 'border-l-green-500' :
                    record.ghn_status === 'delivering' ? 'border-l-blue-500' :
                    record.ghn_status === 'transporting' ? 'border-l-purple-500' :
                    'border-l-yellow-500'
                  }`}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-mono font-bold text-sm">{record.ghn_order_code}</div>
                            <div className="text-xs text-muted-foreground">
                              Đơn: {record.orders?.display_order_number || record.orders?.order_number || '-'}
                            </div>
                          </div>
                          <Badge className={getStatusColor(record.ghn_status)}>
                            {record.ghn_status_text}
                          </Badge>
                        </div>

                        {/* Customer Info */}
                        <div className="grid grid-cols-1 gap-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            <div className="break-words">
                              <div className="font-medium">{record.customer_name}</div>
                              <div className="text-sm text-muted-foreground">{record.customer_phone}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm break-words">{record.customer_address}</div>
                          </div>
                        </div>

                        {/* Dates and Details */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <Calendar className="h-3 w-3 text-gray-400" />
                              <span className="text-muted-foreground">Tạo đơn</span>
                            </div>
                            <div>{formatDate(record.created_date)}</div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <Clock className="h-3 w-3 text-gray-400" />
                              <span className="text-muted-foreground">Dự kiến</span>
                            </div>
                            <div>{formatDate(record.expected_delivery_date)}</div>
                          </div>
                        </div>

                        {record.delivered_date && (
                          <div className="text-sm">
                            <div className="flex items-center gap-1 mb-1">
                              <Clock className="h-3 w-3 text-green-600" />
                              <span className="text-muted-foreground">Đã giao</span>
                            </div>
                            <div className="text-green-600 font-medium">{formatDate(record.delivered_date)}</div>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Cân nặng: </span>
                              <span className="font-medium">{formatWeight(record.package_weight)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">COD: </span>
                              <span className="font-medium text-green-600">{formatCOD(record.cod_amount)}</span>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(record.tracking_url, '_blank')}
                            className="gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Chi tiết
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}