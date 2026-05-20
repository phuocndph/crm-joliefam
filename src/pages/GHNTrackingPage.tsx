import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2, ExternalLink, Trash2, Plus, RefreshCw, Download, Pencil, Search, Printer } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { User } from '@supabase/supabase-js';
import { GHNTrackingFilters, FilterState } from '@/components/GHNTrackingFilters';
import { EditGHNOrderDialog } from '@/components/EditGHNOrderDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card as UICard } from '@/components/ui/card';

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
  raw_data?: any;
}

const FINAL_STATUSES = ['delivered', 'cancel', 'returned', 'lost', 'damage'];

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
  const [updatingOrderCode, setUpdatingOrderCode] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    status: ['all'],
    sortBy: 'none',
    sortOrder: 'asc'
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GHNTrackingData | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  const { role } = useUserRole(user);
  const isMobile = useIsMobile();

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

  // Auto-load incomplete orders when accessing the page
  useEffect(() => {
    if (user && trackingData.length > 0) {
      // Auto-load incomplete orders after data is loaded
      const timer = setTimeout(() => {
        autoLoadIncompleteOrders();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [user, trackingData.length]); // Trigger when user is available and data is loaded

  // Real-time subscription for GHN tracking updates
  useEffect(() => {
    if (!user) return;

    console.log('📦 Setting up GHN tracking real-time subscription');
    
    const channel = supabase
      .channel('ghn-tracking-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ghn_tracking'
        },
        async (payload) => {
          console.log('📦 GHN tracking real-time update received:', payload.eventType, payload);
          
          // Reload data when there are changes
          await loadTrackingData();
          
          // Show notification for updates
          if (payload.eventType === 'INSERT') {
            toast.success('Đã thêm đơn hàng tracking mới');
          } else if (payload.eventType === 'UPDATE') {
            toast.info('Cập nhật trạng thái đơn hàng');
          } else if (payload.eventType === 'DELETE') {
            toast.info('Đã xóa đơn hàng tracking');
          }
        }
      )
      .subscribe((status) => {
        console.log('📦 GHN tracking real-time subscription status:', status);
      });

    return () => {
      console.log('📦 Cleaning up GHN tracking real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Auto-update tracking data every 60 minutes
  useEffect(() => {
    if (!user || trackingData.length === 0) return;

    const autoUpdateInterval = setInterval(async () => {
      console.log('Auto-updating GHN tracking data...');
      await updateAllTracking();
    }, 60 * 60 * 1000); // 60 minutes

    return () => clearInterval(autoUpdateInterval);
  }, [user, trackingData.length]);

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

  // Auto-load incomplete orders when accessing the page
  const autoLoadIncompleteOrders = async () => {
    if (!user || trackingData.length === 0) return;

    // Find orders that don't have final delivery status
    const incompleteStatuses = ['delivered', 'returned', 'cancel', 'lost', 'damage'];
    const incompleteOrders = trackingData.filter(order => 
      !incompleteStatuses.includes(order.ghn_status || '')
    );

    if (incompleteOrders.length === 0) {
      console.log('Không có đơn hàng chưa hoàn thành để cập nhật');
      return;
    }

    console.log(`Tự động cập nhật ${incompleteOrders.length} đơn hàng chưa hoàn thành khi truy cập trang...`);
    
    try {
      let updatedCount = 0;
      const batchSize = 5; // Process in batches to avoid overloading

      for (let i = 0; i < incompleteOrders.length; i += batchSize) {
        const batch = incompleteOrders.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (order) => {
          try {
            const { data, error } = await supabase.functions.invoke('ghn-tracking', {
              body: {
                action: 'save_tracking',
                orderCode: order.ghn_order_code,
                userId: user.id,
                managerId: user.id
              }
            });

            if (!error && data.success) {
              updatedCount++;
            }
          } catch (error) {
            console.error(`Lỗi cập nhật đơn ${order.ghn_order_code}:`, error);
          }
        }));

        // Small delay between batches
        if (i + batchSize < incompleteOrders.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (updatedCount > 0) {
        toast.success(`Đã tự động cập nhật ${updatedCount} đơn hàng chưa hoàn thành`);
        await loadTrackingData();
      }
    } catch (error) {
      console.error('Lỗi tự động cập nhật:', error);
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

  const updateSingleTracking = async (orderCode: string) => {
    if (!user) return;

    setUpdatingOrderCode(orderCode);

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
        toast.success(`Đã cập nhật đơn hàng ${orderCode}`);
        await loadTrackingData(); // Reload data
      } else {
        toast.error(data.error || 'Lỗi cập nhật tracking');
      }
    } catch (error: any) {
      console.error('Error updating single tracking:', error);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setUpdatingOrderCode(null);
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
      // Search text filter - flexible search across all columns
      if (filters.searchText) {
        const searchText = filters.searchText.toLowerCase();
        
        // Create an array of all searchable text fields
        const searchableFields = [
          item.ghn_order_code,
          item.internal_order_code,
          item.customer_name,
          item.customer_phone,
          item.customer_address,
          item.ghn_status,
          item.ghn_status_text,
          formatDate(item.created_date),
          formatDate(item.expected_delivery_date),
          formatDate(item.delivered_date),
          formatCurrency(item.cod_amount),
          formatWeight(item.package_weight)
        ].filter(Boolean); // Remove null/undefined values
        
        // Check if search text appears in any field
        const hasMatch = searchableFields.some(field => 
          field?.toString().toLowerCase().includes(searchText)
        );
        
        if (!hasMatch) {
          return false;
        }
      }

      // Status filter
      if (filters.status && filters.status.length > 0 && !filters.status.includes('all') && !filters.status.includes(item.ghn_status || '')) {
        return false;
      }

      return true;
    });

    // Define completed statuses
    const completedStatuses = ['delivered', 'returned', 'cancel', 'lost', 'damage'];
    
    // Primary sort: incomplete orders first, then by custom sort
    result = [...result].sort((a, b) => {
      const aIsCompleted = completedStatuses.includes(a.ghn_status || '');
      const bIsCompleted = completedStatuses.includes(b.ghn_status || '');
      
      // Incomplete orders come first
      if (!aIsCompleted && bIsCompleted) return -1;
      if (aIsCompleted && !bIsCompleted) return 1;
      
      // If both have same completion status, apply secondary sorting
      if (filters.sortBy && filters.sortBy !== 'none') {
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
          default:
            // Default to most recent first for same completion status
            aValue = a.created_date || '';
            bValue = b.created_date || '';
            if (filters.sortOrder === 'desc') {
              return bValue.localeCompare(aValue, 'vi');
            } else {
              return aValue.localeCompare(bValue, 'vi');
            }
        }

        if (filters.sortOrder === 'desc') {
          return bValue.localeCompare(aValue, 'vi');
        } else {
          return aValue.localeCompare(bValue, 'vi');
        }
      } else {
        // Default sorting: most recent first within same completion status
        const aDate = a.created_date || '';
        const bDate = b.created_date || '';
        return bDate.localeCompare(aDate, 'vi');
      }
    });

    return result;
  }, [trackingData, filters]);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  const printA5 = async (orderCodes: string[]) => {
    if (orderCodes.length === 0) return;
    setPrinting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'print_a5', orderCodes }
      });
      if (error) throw error;
      if (data.success && data.data?.printUrl) {
        window.open(data.data.printUrl, '_blank');
        toast.success("Đang mở trang in phiếu A5...");
      } else {
        throw new Error(data.error || 'Không thể tạo link in phiếu');
      }
    } catch (error: any) {
      console.error('Error printing A5:', error);
      toast.error(error.message || 'Lỗi in phiếu A5');
    } finally {
      setPrinting(false);
    }
  };

  const toggleSelectOrder = (orderCode: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderCode)) next.delete(orderCode);
      else next.add(orderCode);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageCodes = paginatedData.map(d => d.ghn_order_code);
    const allSelected = pageCodes.every(c => selectedOrders.has(c));
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (allSelected) pageCodes.forEach(c => next.delete(c));
      else pageCodes.forEach(c => next.add(c));
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedData = useMemo(
    () => filteredData.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredData, safePage, pageSize]
  );
  const startIdx = filteredData.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, filteredData.length);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-full">
      <Card className="w-full">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle>Theo dõi đơn hàng GHN</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Button
                variant={!isMultipleMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultipleMode(false)}
                className="flex-1 sm:flex-none"
              >
                Đơn lẻ
              </Button>
              <Button
                variant={isMultipleMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultipleMode(true)}
                className="flex-1 sm:flex-none"
              >
                Nhiều đơn
              </Button>
            </div>

            {!isMultipleMode ? (
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <Input
                    placeholder="Nhập mã đơn hàng GHN"
                    value={orderCodeInput}
                    onChange={(e) => setOrderCodeInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addOrderTracking()}
                    className="sm:max-w-xs"
                  />
                  <Button
                    onClick={addOrderTracking}
                    disabled={loading || !orderCodeInput.trim()}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Thêm tracking
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-4 items-center">
                     <span className="text-sm text-muted-foreground">
                       Hiển thị {filteredData.length} / {trackingData.length} đơn hàng
                     </span>
                     {selectedOrders.size > 0 && (
                       <Button
                         onClick={() => printA5(Array.from(selectedOrders))}
                         disabled={printing}
                         variant="outline"
                         className="gap-2"
                       >
                         {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                         In A5 ({selectedOrders.size})
                       </Button>
                     )}
                     <Button
                       onClick={updateAllTracking}
                       disabled={loading || trackingData.length === 0}
                       variant="outline"
                     >
                       {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                       Cập nhật tất cả
                     </Button>
                </div>
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
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between">
                  <div className="flex gap-2 sm:gap-4">
                    <Button
                      onClick={addOrderTracking}
                      disabled={loading || !orderCodeInput.trim()}
                      className="flex-1 sm:flex-none"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Thêm tất cả
                    </Button>
                    <Button
                      onClick={() => setOrderCodeInput('')}
                      variant="outline"
                      disabled={loading}
                      className="flex-1 sm:flex-none"
                    >
                      Xóa
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-4 items-center">
                     <span className="text-sm text-muted-foreground">
                       Hiển thị {filteredData.length} / {trackingData.length} đơn hàng
                     </span>
                     {selectedOrders.size > 0 && (
                       <Button
                         onClick={() => printA5(Array.from(selectedOrders))}
                         disabled={printing}
                         variant="outline"
                         className="gap-2"
                       >
                         {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                         In A5 ({selectedOrders.size})
                       </Button>
                     )}
                     <Button
                       onClick={updateAllTracking}
                       disabled={loading || trackingData.length === 0}
                       variant="outline"
                     >
                       {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                       Cập nhật tất cả
                     </Button>
                  </div>
                </div>
              </div>
            )}

            
            {/* Filter Component */}
            <GHNTrackingFilters
              onFiltersChange={handleFiltersChange}
              filteredCount={filteredData.length}
              totalCount={trackingData.length}
            />
          </div>

          {!isMobile && (
          <div className="overflow-auto border rounded-lg max-h-[600px] w-full">
            <table className="w-full border-collapse min-w-[1800px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-blue-800 text-white border border-gray-300 px-2 py-4 text-center text-sm font-semibold min-w-[50px]">
                    <Checkbox
                      checked={paginatedData.length > 0 && paginatedData.every(d => selectedOrders.has(d.ghn_order_code))}
                      onCheckedChange={toggleSelectAll}
                      className="border-white data-[state=checked]:bg-white data-[state=checked]:text-blue-800"
                    />
                  </th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[80px]">STT</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[150px]">MÃ GHN</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">MÃ ĐƠN HÀNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[180px]">TRẠNG THÁI</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[180px]">TÊN KHÁCH HÀNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">SỐ ĐIỆN THOẠI</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[250px]">ĐỊA CHỈ</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">CÂN NẶNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[130px]">NGÀY TẠO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">DỰ KIẾN GIAO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">NGÀY GIAO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">COD THU HỘ</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px] sticky right-[80px] shadow-lg">TRA CỨU</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px] sticky right-0 shadow-lg">THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="border border-gray-300 px-3 py-4 text-center text-gray-500">
                      {trackingData.length === 0 ? 'Chưa có dữ liệu tracking' : 'Không tìm thấy kết quả phù hợp với bộ lọc'}
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item, index) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-3 text-center min-w-[50px]">
                        <Checkbox
                          checked={selectedOrders.has(item.ghn_order_code)}
                          onCheckedChange={() => toggleSelectOrder(item.ghn_order_code)}
                        />
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-center min-w-[80px]">{(safePage - 1) * pageSize + index + 1}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-mono min-w-[150px]">{item.ghn_order_code}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-mono min-w-[120px]">{item.internal_order_code || '-'}</td>
                       <td className="border border-gray-300 px-4 py-3 text-sm min-w-[180px]">
                         <div className="flex items-center gap-2">
                           <Badge className={statusColors[item.ghn_status || ''] || 'bg-gray-100 text-gray-800'}>
                             {item.ghn_status_text || item.ghn_status || '-'}
                           </Badge>
                           <Button
                             onClick={() => updateSingleTracking(item.ghn_order_code)}
                             variant="ghost"
                             size="sm"
                             className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                             disabled={updatingOrderCode === item.ghn_order_code}
                             title="Cập nhật đơn hàng này"
                           >
                             <RefreshCw className={`h-3 w-3 ${updatingOrderCode === item.ghn_order_code ? 'animate-spin' : ''}`} />
                           </Button>
                         </div>
                       </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[180px]">{item.customer_name}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[140px]">{item.customer_phone || '-'}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[250px] break-words whitespace-normal leading-relaxed">
                        {item.customer_address || '-'}
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[120px]">{formatWeight(item.package_weight)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[130px]">{formatDate(item.created_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[140px]">{formatDate(item.expected_delivery_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[140px]">{formatDate(item.delivered_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[120px]">{formatCurrency(item.cod_amount)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[120px] sticky right-[80px] bg-background shadow-lg">
                        <a
                          href={`https://donhang.ghn.vn/?order_code=${item.ghn_order_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 text-sm"
                        >
                          <Search className="h-3 w-3" />
                          Tra cứu
                        </a>
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[120px] sticky right-0 bg-background shadow-lg">
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={() => printA5([item.ghn_order_code])}
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-800"
                            title="In phiếu A5"
                            disabled={printing}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {!FINAL_STATUSES.includes(item.ghn_status || '') && (
                            <Button
                              onClick={() => { setEditingRecord(item); setEditDialogOpen(true); }}
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-800"
                              title="Chỉnh sửa đơn hàng"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            onClick={() => removeTracking(item.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}

          {isMobile && (
            <div className="space-y-3">
              {paginatedData.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
                  {trackingData.length === 0 ? 'Chưa có dữ liệu tracking' : 'Không tìm thấy kết quả phù hợp với bộ lọc'}
                </div>
              ) : (
                paginatedData.map((item, index) => {
                  const isFinal = FINAL_STATUSES.includes(item.ghn_status || '');
                  const isSelected = selectedOrders.has(item.ghn_order_code);
                  return (
                    <UICard key={item.id} className="p-3 space-y-3">
                      {/* Header: checkbox + STT + mã + badge */}
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectOrder(item.ghn_order_code)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">#{(safePage - 1) * pageSize + index + 1}</span>
                            <span className="font-mono text-sm font-semibold truncate">{item.ghn_order_code}</span>
                          </div>
                          {item.internal_order_code && (
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              {item.internal_order_code}
                            </div>
                          )}
                        </div>
                        <Badge className={`${statusColors[item.ghn_status || ''] || 'bg-muted text-muted-foreground'} shrink-0`}>
                          {item.ghn_status_text || item.ghn_status || '-'}
                        </Badge>
                      </div>

                      {/* Customer */}
                      <div className="text-sm space-y-1 border-t pt-2">
                        <div className="font-medium">
                          {item.customer_name}
                          {item.customer_phone && <span className="text-muted-foreground font-normal"> · {item.customer_phone}</span>}
                        </div>
                        {item.customer_address && (
                          <div className="text-xs text-muted-foreground leading-relaxed">{item.customer_address}</div>
                        )}
                      </div>

                      {/* Meta grid */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs border-t pt-2">
                        <div>
                          <span className="text-muted-foreground">Cân: </span>
                          <span className="font-medium">{formatWeight(item.package_weight) || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">COD: </span>
                          <span className="font-medium">{formatCurrency(item.cod_amount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tạo: </span>
                          <span className="font-medium">{formatDate(item.created_date) || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">DK giao: </span>
                          <span className="font-medium">{formatDate(item.expected_delivery_date) || '-'}</span>
                        </div>
                        {item.delivered_date && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Đã giao: </span>
                            <span className="font-medium text-sidebar-primary">{formatDate(item.delivered_date)}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 border-t pt-2 flex-wrap">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-9 flex-1 min-w-[88px] gap-1"
                        >
                          <a
                            href={`https://donhang.ghn.vn/?order_code=${item.ghn_order_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Search className="h-3.5 w-3.5" />
                            Tra cứu
                          </a>
                        </Button>
                        <Button
                          onClick={() => updateSingleTracking(item.ghn_order_code)}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          disabled={updatingOrderCode === item.ghn_order_code}
                          title="Cập nhật"
                        >
                          <RefreshCw className={`h-4 w-4 ${updatingOrderCode === item.ghn_order_code ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          onClick={() => printA5([item.ghn_order_code])}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-green-600"
                          title="In A5"
                          disabled={printing}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        {!isFinal && (
                          <Button
                            onClick={() => { setEditingRecord(item); setEditDialogOpen(true); }}
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-blue-600"
                            title="Chỉnh sửa"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          onClick={() => removeTracking(item.id)}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-destructive"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </UICard>
                  );
                })
              )}
            </div>
          )}

          {trackingData.length > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 flex-wrap">
                <span>Số dòng/trang:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs sm:text-sm">{startIdx}-{endIdx} / {filteredData.length}</span>
              </div>
              <div className="flex items-center gap-1 justify-between sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="hidden sm:inline-flex">«</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹ Trước</Button>
                <span className="px-2 whitespace-nowrap">{safePage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Sau ›</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} className="hidden sm:inline-flex">»</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EditGHNOrderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        trackingRecord={editingRecord}
        onSuccess={() => loadTrackingData()}
      />


    </div>
  );
}
