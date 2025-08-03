import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2, ExternalLink, Trash2, Plus, RefreshCw, Download } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { GHNTrackingFilters, FilterState } from '@/components/GHNTrackingFilters';
import * as XLSX from 'xlsx';

interface GHNTrackingData {
  id: string;
  ghn_order_code: string;
  internal_order_code?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  package_weight?: number;
  created_date?: string;
  expected_delivery_date?: string;
  delivered_date?: string;
  cod_amount?: number;
  ghn_status?: string;
  ghn_status_text?: string;
  tracking_url?: string;
  last_updated_at?: string;
}

// Map trạng thái và màu sắc
const statusColors: { [key: string]: string } = {
  'ready_to_pick': 'bg-yellow-100 text-yellow-800',
  'picking': 'bg-orange-100 text-orange-800',
  'picked': 'bg-blue-100 text-blue-800',
  'storing': 'bg-purple-100 text-purple-800',
  'transporting': 'bg-indigo-100 text-indigo-800',
  'sorting': 'bg-cyan-100 text-cyan-800',
  'delivering': 'bg-pink-100 text-pink-800',
  'delivered': 'bg-green-100 text-green-800',
  'delivery_fail': 'bg-red-100 text-red-800',
  'returning': 'bg-amber-100 text-amber-800',
  'returned': 'bg-gray-100 text-gray-800',
  'cancel': 'bg-red-100 text-red-800',
  'lost': 'bg-red-100 text-red-800',
  'damage': 'bg-red-100 text-red-800'
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('vi-VN');
  } catch {
    return '';
  }
}

function formatWeight(weight?: number): string {
  if (!weight) return '';
  return `${(weight / 1000).toFixed(2)} kg`;
}

function formatCurrency(amount?: number): string {
  if (!amount) return '0 ₫';
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

export default function GHNTrackingPage() {
  const [trackingData, setTrackingData] = useState<GHNTrackingData[]>([]);
  const [orderCodeInput, setOrderCodeInput] = useState('');
  const [isMultipleMode, setIsMultipleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    status: 'all',
    sortBy: 'none',
    sortOrder: 'asc'
  });
  const { role } = useUserRole(user);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();
  }, []);

  // Load tracking data from database
  useEffect(() => {
    if (user) {
      loadTrackingData();
    }
  }, [user]);

  const loadTrackingData = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('ghn_tracking')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading tracking data:', error);
        toast.error('Lỗi tải dữ liệu tracking');
      } else {
        setTrackingData(data || []);
      }
    } catch (error) {
      console.error('Error loading tracking data:', error);
      toast.error('Lỗi tải dữ liệu tracking');
    }
  };

  const addOrderTracking = async () => {
    const input = orderCodeInput.trim();
    if (!input || !user) return;

    // Parse multiple order codes (separated by comma, semicolon, or newline)
    const orderCodes = input
      .split(/[,;\n]/)
      .map(code => code.trim())
      .filter(code => code.length > 0);

    if (orderCodes.length === 0) return;

    // Check for duplicates
    const duplicates = orderCodes.filter(code => 
      trackingData.some(item => item.ghn_order_code === code)
    );

    if (duplicates.length > 0) {
      toast.error(`Các mã đơn hàng đã tồn tại: ${duplicates.join(', ')}`);
      return;
    }

    setLoading(true);

    try {
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const orderCode of orderCodes) {
        try {
          const { data, error } = await supabase.functions.invoke('ghn-tracking', {
            body: {
              action: 'save_tracking',
              orderCode: orderCode,
              userId: user.id,
              managerId: user.id
            }
          });

          if (error) {
            throw error;
          }

          if (data.success) {
            successCount++;
          } else {
            errorCount++;
            errors.push(`${orderCode}: ${data.error}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`${orderCode}: ${error.message || 'Lỗi không xác định'}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Đã thêm thành công ${successCount} đơn hàng`);
        setOrderCodeInput('');
        await loadTrackingData();
      }

      if (errorCount > 0) {
        toast.error(`${errorCount} đơn hàng thất bại. Chi tiết: ${errors.join('; ')}`);
      }
    } catch (error: any) {
      console.error('Error adding tracking:', error);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const updateAllTracking = async () => {
    if (!user || trackingData.length === 0) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'update_all_tracking',
          managerId: user.id
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast.success(data.message);
        await loadTrackingData(); // Reload data
      } else {
        toast.error(data.error || 'Lỗi cập nhật tracking');
      }
    } catch (error: any) {
      console.error('Error updating tracking:', error);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const importAllOrdersFromGHN = async () => {
    if (!user) return;

    setLoading(true);

    try {
      // First fetch all orders from GHN
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'fetch_all_orders'
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        const orders = data.data || [];
        
        if (orders.length === 0) {
          toast.info('Không tìm thấy đơn hàng nào trên GHN');
          return;
        }

        toast.info(`Tìm thấy ${orders.length} đơn hàng trên GHN. Đang import...`);

        // Save each order to database
        let savedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const order of orders) {
          try {
            // Check if order already exists
            const existingOrder = trackingData.find(item => item.ghn_order_code === order.orderCode);
            if (existingOrder) {
              skippedCount++;
              continue;
            }

            const { data: saveData, error: saveError } = await supabase.functions.invoke('ghn-tracking', {
              body: {
                action: 'save_tracking',
                orderCode: order.orderCode,
                userId: user.id,
                managerId: user.id
              }
            });

            if (saveError || !saveData.success) {
              errorCount++;
              console.error(`Error saving order ${order.orderCode}:`, saveError || saveData.error);
            } else {
              savedCount++;
            }
          } catch (saveError) {
            errorCount++;
            console.error(`Error saving order ${order.orderCode}:`, saveError);
          }
        }

        const message = `Import hoàn tất: ${savedCount} đã thêm, ${skippedCount} đã tồn tại${errorCount > 0 ? `, ${errorCount} lỗi` : ''}`;
        toast.success(message);
        
        if (savedCount > 0) {
          await loadTrackingData(); // Reload data only if new orders were added
        }
      } else {
        toast.error(data.error || 'Lỗi lấy dữ liệu từ GHN');
      }
    } catch (error: any) {
      console.error('Error importing orders:', error);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const removeTracking = async (id: string) => {
    try {
      const { error } = await supabase
        .from('ghn_tracking')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      toast.success('Đã xóa tracking');
      await loadTrackingData();
    } catch (error: any) {
      console.error('Error removing tracking:', error);
      toast.error('Lỗi xóa tracking');
    }
  };

  // Filter and sort logic
  const filteredData = useMemo(() => {
    let result = trackingData.filter(item => {
      // Search text filter
      if (filters.searchText) {
        const searchText = filters.searchText.toLowerCase();
        const matchesGhnCode = item.ghn_order_code?.toLowerCase().includes(searchText);
        const matchesInternalCode = item.internal_order_code?.toLowerCase().includes(searchText);
        const matchesCustomerName = item.customer_name?.toLowerCase().includes(searchText);
        
        if (!matchesGhnCode && !matchesInternalCode && !matchesCustomerName) {
          return false;
        }
      }

      // Status filter
      if (filters.status && filters.status !== 'all' && item.ghn_status !== filters.status) {
        return false;
      }

      return true;
    });

    // Apply sorting
    if (filters.sortBy && filters.sortBy !== 'none') {
      result = [...result].sort((a, b) => {
        let aValue = '';
        let bValue = '';

        switch (filters.sortBy) {
          case 'status':
            aValue = a.ghn_status_text || a.ghn_status || '';
            bValue = b.ghn_status_text || b.ghn_status || '';
            break;
          case 'customer_name':
            aValue = a.customer_name || '';
            bValue = b.customer_name || '';
            break;
          case 'created_date':
            aValue = a.created_date || '';
            bValue = b.created_date || '';
            break;
        }

        if (filters.sortOrder === 'desc') {
          return bValue.localeCompare(aValue, 'vi');
        } else {
          return aValue.localeCompare(bValue, 'vi');
        }
      });
    }

    return result;
  }, [trackingData, filters]);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Theo dõi đơn hàng GHN</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Button
                variant={!isMultipleMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultipleMode(false)}
              >
                Đơn lẻ
              </Button>
              <Button
                variant={isMultipleMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultipleMode(true)}
              >
                Nhiều đơn
              </Button>
            </div>

            {!isMultipleMode ? (
              <div className="flex gap-4">
                <Input
                  placeholder="Nhập mã đơn hàng GHN"
                  value={orderCodeInput}
                  onChange={(e) => setOrderCodeInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addOrderTracking()}
                  className="max-w-xs"
                />
                <Button
                  onClick={addOrderTracking}
                  disabled={loading || !orderCodeInput.trim()}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Thêm tracking
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  placeholder="Nhập nhiều mã đơn hàng (mỗi mã một dòng hoặc ngăn cách bằng dấu phẩy)"
                  value={orderCodeInput}
                  onChange={(e) => setOrderCodeInput(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <div className="flex gap-4">
                  <Button
                    onClick={addOrderTracking}
                    disabled={loading || !orderCodeInput.trim()}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Thêm tất cả
                  </Button>
                  <Button
                    onClick={() => setOrderCodeInput('')}
                    variant="outline"
                    disabled={loading}
                  >
                    Xóa
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex gap-4">
                <Button
                  onClick={updateAllTracking}
                  disabled={loading || trackingData.length === 0}
                  variant="outline"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Cập nhật tất cả
                </Button>
              </div>
              
              {/* Filter Component */}
              <GHNTrackingFilters
                onFiltersChange={handleFiltersChange}
                filteredCount={filteredData.length}
                totalCount={trackingData.length}
              />
            </div>
          </div>

          <div className="overflow-auto border rounded-lg max-h-[70vh]">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[60px]">STT</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">MÃ GHN</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[100px]">MÃ ĐƠN HÀNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">TRẠNG THÁI</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">TÊN KHÁCH HÀNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">SỐ ĐIỆN THOẠI</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[200px]">ĐỊA CHỈ</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[100px]">CÂN NẶNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[110px]">NGÀY TẠO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">DỰ KIẾN GIAO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">NGÀY GIAO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[100px]">COD THU HỘ</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[100px]">TRA CỨU</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[80px]">THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="border border-gray-300 px-3 py-4 text-center text-gray-500">
                      {trackingData.length === 0 ? 'Chưa có dữ liệu tracking' : 'Không tìm thấy kết quả phù hợp với bộ lọc'}
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item, index) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-center">{index + 1}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-mono">{item.ghn_order_code}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-mono">{item.internal_order_code || '-'}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">
                        <Badge className={statusColors[item.ghn_status || ''] || 'bg-gray-100 text-gray-800'}>
                          {item.ghn_status_text || item.ghn_status || '-'}
                        </Badge>
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">{item.customer_name}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">{item.customer_phone || '-'}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm max-w-xs break-words whitespace-normal leading-relaxed">
                        {item.customer_address || '-'}
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">{formatWeight(item.package_weight)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap">{formatDate(item.created_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap">{formatDate(item.expected_delivery_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap">{formatDate(item.delivered_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap">{formatCurrency(item.cod_amount)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">
                        {item.tracking_url && (
                          <a
                            href={item.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 whitespace-nowrap"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Tra cứu
                          </a>
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">
                        <Button
                          onClick={() => removeTracking(item.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {trackingData.length > 0 && (
            <div className="mt-4 text-sm text-gray-500">
              {filteredData.length !== trackingData.length ? (
                `Hiển thị ${filteredData.length} / ${trackingData.length} đơn hàng`
              ) : (
                `Tổng cộng: ${trackingData.length} đơn hàng đang được theo dõi`
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
