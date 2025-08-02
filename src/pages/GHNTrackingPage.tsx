import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2, ExternalLink, Trash2, Plus, RefreshCw, Download } from 'lucide-react';
import { User } from '@supabase/supabase-js';

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
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
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
    const orderCode = orderCodeInput.trim();
    if (!orderCode || !user) return;

    // Check if already exists
    const existingOrder = trackingData.find(item => item.ghn_order_code === orderCode);
    if (existingOrder) {
      toast.error('Mã đơn hàng đã tồn tại trong hệ thống');
      return;
    }

    setLoading(true);

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
        toast.success(data.message);
        setOrderCodeInput('');
        await loadTrackingData(); // Reload data
      } else {
        toast.error(data.error || 'Lỗi thêm tracking');
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Theo dõi đơn hàng GHN</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
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
            <Button
              onClick={updateAllTracking}
              disabled={loading || trackingData.length === 0}
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Cập nhật tất cả
            </Button>
            <Button
              onClick={importAllOrdersFromGHN}
              disabled={loading}
              variant="secondary"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Import từ GHN
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">STT</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">MÃ GHN</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">MÃ ĐƠN HÀNG</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">TRẠNG THÁI ĐƠN HÀNG</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">TÊN KHÁCH HÀNG</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">SỐ ĐIỆN THOẠI</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">ĐỊA CHỈ</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">CÂN NẶNG ĐƠN HÀNG</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">NGÀY TẠO ĐƠN</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">NGÀY DỰ KIẾN GIAO</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">NGÀY GIAO THÀNH CÔNG</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">COD THU HỘ</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">TRA CỨU ĐƠN HÀNG</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {trackingData.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="border border-gray-300 px-3 py-4 text-center text-gray-500">
                      Chưa có dữ liệu tracking
                    </td>
                  </tr>
                ) : (
                  trackingData.map((item, index) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2 text-sm">{index + 1}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm font-mono">{item.ghn_order_code}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm font-mono">{item.internal_order_code || '-'}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        <Badge className={statusColors[item.ghn_status || ''] || 'bg-gray-100 text-gray-800'}>
                          {item.ghn_status_text || item.ghn_status || '-'}
                        </Badge>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{item.customer_name}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{item.customer_phone || '-'}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm max-w-xs truncate" title={item.customer_address}>
                        {item.customer_address || '-'}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{formatWeight(item.package_weight)}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{formatDate(item.created_date)}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{formatDate(item.expected_delivery_date)}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{formatDate(item.delivered_date)}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">{formatCurrency(item.cod_amount)}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        {item.tracking_url && (
                          <a
                            href={item.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Tra cứu
                          </a>
                        )}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
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
              Tổng cộng: {trackingData.length} đơn hàng đang được theo dõi
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}