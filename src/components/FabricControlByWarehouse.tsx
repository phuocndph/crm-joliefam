import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Plus, Filter, Search, Package, TrendingUp, ArrowRight } from 'lucide-react';
import { useFabricUsage, useFabricVariants, useWarehouses, useCreateFabricUsage, useFabricInventory, useCreateTransfer, useUpdateInventory } from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { supabase } from '@/integrations/supabase/client';

interface FabricControlByWarehouseProps {
  warehouseName: string;
  warehouseFilter?: string;
}

export const FabricControlByWarehouse: React.FC<FabricControlByWarehouseProps> = ({
  warehouseName,
  warehouseFilter
}) => {
  const { data: fabricUsage = [] } = useFabricUsage();
  const { data: fabricVariants = [] } = useFabricVariants();
  const { data: warehouses = [] } = useWarehouses();
  const { data: inventory = [] } = useFabricInventory();
  const createFabricUsage = useCreateFabricUsage();
  const createTransfer = useCreateTransfer();
  const updateInventory = useUpdateInventory();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedManager, setSelectedManager] = useState('all');
  const [selectedFabricType, setSelectedFabricType] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedFabricForTransfer, setSelectedFabricForTransfer] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [transferNotes, setTransferNotes] = useState('');

  const [newUsage, setNewUsage] = useState({
    order_number: '',
    fabric_variant_id: '',
    warehouse_id: '',
    order_id: '',
    quantity_used: 0,
    customer_name: '',
    customer_code: '',
    order_type: '',
    fabric_width: '',
    usage_date: format(new Date(), 'yyyy-MM-dd'),
    notes: ''
  });

  // Filter data by warehouse if specified
  const filteredUsage = useMemo(() => {
    let filtered = fabricUsage;

    // Filter by warehouse
    if (warehouseFilter) {
      filtered = filtered.filter(item => 
        (item.warehouses && typeof item.warehouses === 'object' && 'warehouse_type' in item.warehouses) &&
        (item.warehouses.warehouse_type === warehouseFilter ||
        item.warehouses.name?.toLowerCase().includes(warehouseFilter.toLowerCase()))
      );
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.fabric_variants && typeof item.fabric_variants === 'object' && 'variant_name' in item.fabric_variants &&
          item.fabric_variants.variant_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_types' in item.fabric_variants &&
          item.fabric_variants.fabric_types && typeof item.fabric_variants.fabric_types === 'object' && 'name' in item.fabric_variants.fabric_types &&
          item.fabric_variants.fabric_types.name?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Filter by fabric type
    if (selectedFabricType !== 'all') {
      filtered = filtered.filter(item => 
        item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_type_id' in item.fabric_variants &&
        item.fabric_variants.fabric_type_id === selectedFabricType
      );
    }

    // Filter by date range
    if (dateRange?.from) {
      filtered = filtered.filter(item => {
        const usageDate = new Date(item.usage_date);
        const fromDate = dateRange.from!;
        const toDate = dateRange.to || dateRange.from;
        return usageDate >= fromDate && usageDate <= toDate;
      });
    }

    return filtered;
  }, [fabricUsage, warehouseFilter, searchTerm, selectedFabricType, dateRange]);

  // Process inventory data for current warehouse
  const warehouseInventory = useMemo(() => {
    return inventory.filter(item => {
      if (!warehouseFilter) return true;
      return item.warehouses?.name?.toLowerCase().includes(warehouseFilter.toLowerCase()) ||
             item.warehouses?.warehouse_type === warehouseFilter;
    }).map(item => ({
      ...item,
      fabricCode: item.fabric_variants?.variant_name || '',
      fabricType: item.fabric_variants?.fabric_types?.name || '',
      widthCode: item.fabric_variants?.width_code || '',
      warehouse: item.warehouses?.name || '',
      currentStockMeters: item.current_stock,
    }));
  }, [inventory, warehouseFilter]);

  // Find warehouses
  const hanoiWarehouse = warehouses.find(w => w.name.toLowerCase().includes('hà nội') || w.name.toLowerCase().includes('hanoi'));
  const bacninhWarehouse = warehouses.find(w => w.name.toLowerCase().includes('bắc ninh') || w.name.toLowerCase().includes('bacninh'));

  // Group by fabric variant with warehouse breakdown - using ALL inventory data like "Tổng số lượng vải"
  const fabricSummary = useMemo(() => {
    const inventoryData = inventory.map(item => ({
      ...item,
      fabricCode: item.fabric_variants?.variant_name || '',
      fabricType: item.fabric_variants?.fabric_types?.name || '',
      widthCode: item.fabric_variants?.width_code || '',
      warehouse: item.warehouses?.name || '',
      currentStockMeters: item.current_stock,
    }));

    return inventoryData.reduce((acc, item) => {
      const key = `${item.fabricCode} ${item.widthCode}`;
      if (!acc[key]) {
        acc[key] = {
          fabricName: key,
          total: 0,
          hanoi: 0,
          bacninh: 0,
          currentWarehouse: 0
        };
      }
      
      acc[key].total += item.currentStockMeters;
      
      if (item.warehouse?.toLowerCase().includes('hà nội') || item.warehouse?.toLowerCase().includes('hanoi')) {
        acc[key].hanoi += item.currentStockMeters;
      } else if (item.warehouse?.toLowerCase().includes('bắc ninh') || item.warehouse?.toLowerCase().includes('bacninh')) {
        acc[key].bacninh += item.currentStockMeters;
      }

      // Set current warehouse quantity based on filter
      if (warehouseFilter) {
        if ((warehouseFilter.toLowerCase().includes('hà nội') || warehouseFilter.toLowerCase().includes('hanoi')) && 
            (item.warehouse?.toLowerCase().includes('hà nội') || item.warehouse?.toLowerCase().includes('hanoi'))) {
          acc[key].currentWarehouse = acc[key].hanoi;
        } else if ((warehouseFilter.toLowerCase().includes('bắc ninh') || warehouseFilter.toLowerCase().includes('bacninh')) && 
                   (item.warehouse?.toLowerCase().includes('bắc ninh') || item.warehouse?.toLowerCase().includes('bacninh'))) {
          acc[key].currentWarehouse = acc[key].bacninh;
        }
      } else {
        acc[key].currentWarehouse = acc[key].total;
      }
      
      return acc;
    }, {} as Record<string, { fabricName: string; total: number; hanoi: number; bacninh: number; currentWarehouse: number }>);
  }, [inventory, warehouseFilter]);

  const fabricSummaryArray = Object.values(fabricSummary);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalOrders = new Set(filteredUsage.map(item => item.order_number)).size;
    const totalFabricUsed = filteredUsage.reduce((sum, item) => sum + (item.quantity_used || 0), 0);
    const totalCustomers = new Set(filteredUsage.map(item => item.customer_name)).size;
    
    // Group by fabric type
    const fabricTypeUsage = filteredUsage.reduce((acc, item) => {
      const fabricType = (item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_types' in item.fabric_variants &&
        item.fabric_variants.fabric_types && typeof item.fabric_variants.fabric_types === 'object' && 'name' in item.fabric_variants.fabric_types)
        ? item.fabric_variants.fabric_types.name : 'Không xác định';
      const variant = (item.fabric_variants && typeof item.fabric_variants === 'object' && 'variant_name' in item.fabric_variants)
        ? item.fabric_variants.variant_name : '';
      const key = `${fabricType} - ${variant}`;
      
      acc[key] = (acc[key] || 0) + (item.quantity_used || 0);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalOrders,
      totalFabricUsed,
      totalCustomers,
      fabricTypeUsage
    };
  }, [filteredUsage]);

  const handleCreateUsage = async () => {
    if (!newUsage.order_number.trim() || !newUsage.fabric_variant_id || !newUsage.warehouse_id || !newUsage.customer_name.trim() || newUsage.quantity_used <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }

    try {
      const usageData = {
        order_id: newUsage.order_id || crypto.randomUUID(),
        order_number: newUsage.order_number,
        fabric_variant_id: newUsage.fabric_variant_id,
        warehouse_id: newUsage.warehouse_id,
        quantity_used: newUsage.quantity_used,
        customer_name: newUsage.customer_name,
        order_type: newUsage.order_type,
        fabric_width: newUsage.fabric_width,
        usage_date: newUsage.usage_date
      };
      
      await createFabricUsage.mutateAsync(usageData);
      
      setNewUsage({
        order_number: '',
        fabric_variant_id: '',
        warehouse_id: '',
        order_id: '',
        quantity_used: 0,
        customer_name: '',
        customer_code: '',
        order_type: '',
        fabric_width: '',
        usage_date: format(new Date(), 'yyyy-MM-dd'),
        notes: ''
      });
      setShowCreateDialog(false);
      toast({ title: "Thành công", description: "Đã ghi nhận sử dụng vải" });
    } catch (error) {
      console.error('Error creating fabric usage:', error);
      toast({ title: "Lỗi", description: "Không thể ghi nhận sử dụng vải", variant: "destructive" });
    }
  };

  const formatQuantity = (quantity: number) => {
    return `${quantity.toLocaleString('vi-VN')} m`;
  };

  const getUniqueManagers = () => {
    const managers = new Set(filteredUsage.map(item => item.manager_id).filter(Boolean));
    return Array.from(managers);
  };

  const getUniqueFabricTypes = () => {
    const types = new Set(fabricVariants.map(v => v.fabric_type_id));
    return fabricVariants.filter(v => types.has(v.fabric_type_id));
  };

  const handleTransferSubmit = async () => {
    if (!selectedFabricForTransfer || transferQuantity <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }

    if (!hanoiWarehouse || !bacninhWarehouse) {
      toast({ title: "Lỗi", description: "Không tìm thấy kho Hà Nội hoặc Bắc Ninh", variant: "destructive" });
      return;
    }

    // Find the fabric variant for the selected fabric
    const selectedFabric = fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer);
    if (!selectedFabric) {
      toast({ title: "Lỗi", description: "Không tìm thấy thông tin vải", variant: "destructive" });
      return;
    }

    // Check if transfer is from Hanoi to Bac Ninh or vice versa
    const isFromHanoi = warehouseFilter?.toLowerCase().includes('hà nội') || warehouseFilter?.toLowerCase().includes('hanoi');
    const maxTransferableQuantity = isFromHanoi ? selectedFabric.hanoi : selectedFabric.bacninh;
    
    if (maxTransferableQuantity < transferQuantity) {
      toast({ title: "Lỗi", description: `Số lượng chuyển vượt quá tồn kho (${maxTransferableQuantity.toFixed(2)}m)`, variant: "destructive" });
      return;
    }

    // Find the variant ID
    const fabricVariant = fabricVariants.find(v => `${v.variant_name} ${v.width_code}` === selectedFabricForTransfer);
    if (!fabricVariant) {
      toast({ title: "Lỗi", description: "Không tìm thấy thông tin loại vải", variant: "destructive" });
      return;
    }

    try {
      // Create transfer record
      const fromWarehouse = isFromHanoi ? hanoiWarehouse : bacninhWarehouse;
      const toWarehouse = isFromHanoi ? bacninhWarehouse : hanoiWarehouse;
      
      await createTransfer.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        from_warehouse_id: fromWarehouse.id,
        to_warehouse_id: toWarehouse.id,
        quantity: transferQuantity,
        notes: transferNotes || `Chuyển ${transferQuantity}m từ ${fromWarehouse.name} về ${toWarehouse.name}`
      });

      // Update inventory - reduce from source warehouse
      const fromInventoryItem = inventory.find(item => 
        item.fabric_variant_id === fabricVariant.id && item.warehouse_id === fromWarehouse.id
      );
      
      if (fromInventoryItem) {
        const newFromStock = Math.max(0, fromInventoryItem.current_stock - transferQuantity);
        await updateInventory.mutateAsync({
          fabric_variant_id: fabricVariant.id,
          warehouse_id: fromWarehouse.id,
          current_stock: newFromStock,
          reserved_stock: fromInventoryItem.reserved_stock || 0,
          minimum_stock: fromInventoryItem.minimum_stock || 0,
          maximum_stock: fromInventoryItem.maximum_stock || 0
        });
      }

      // Update inventory - add to destination warehouse
      const toInventoryItem = inventory.find(item => 
        item.fabric_variant_id === fabricVariant.id && item.warehouse_id === toWarehouse.id
      );
      
      const newToStock = (toInventoryItem?.current_stock || 0) + transferQuantity;
      await updateInventory.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        warehouse_id: toWarehouse.id,
        current_stock: newToStock,
        reserved_stock: toInventoryItem?.reserved_stock || 0,
        minimum_stock: toInventoryItem?.minimum_stock || 0,
        maximum_stock: toInventoryItem?.maximum_stock || 0
      });

      setSelectedFabricForTransfer('');
      setTransferQuantity(0);
      setTransferNotes('');
      setShowTransferDialog(false);
      toast({ title: "Thành công", description: "Đã chuyển vải thành công và cập nhật tồn kho" });
    } catch (error) {
      console.error('Error creating transfer:', error);
      toast({ title: "Lỗi", description: "Có lỗi xảy ra khi chuyển vải", variant: "destructive" });
    }
  };

  const handleTransferClick = (fabricName: string) => {
    setSelectedFabricForTransfer(fabricName);
    setShowTransferDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Kiểm soát vải {warehouseName}</h2>
          <p className="text-muted-foreground">Theo dõi sử dụng vải theo đơn hàng và khách hàng</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ghi nhận sử dụng vải
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ghi nhận sử dụng vải</DialogTitle>
              <DialogDescription>Thêm thông tin sử dụng vải cho đơn hàng</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="usage_date">Ngày xuất vải *</Label>
                <Input
                  id="usage_date"
                  type="date"
                  value={newUsage.usage_date}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, usage_date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order_number">Mã đơn hàng *</Label>
                <Input
                  id="order_number"
                  value={newUsage.order_number}
                  onChange={async (e) => {
                    const orderNumber = e.target.value;
                    setNewUsage(prev => ({ ...prev, order_number: orderNumber }));
                    
                    // Tự động tìm kiếm đơn hàng và điền thông tin
                    if (orderNumber) {
                      try {
                        const { data: orders, error } = await supabase
                          .from('orders')
                          .select(`
                            *,
                            customers (name, customer_code)
                          `)
                          .or(`order_number.ilike.%${orderNumber}%,display_order_number.ilike.%${orderNumber}%`)
                          .limit(1);

                        if (orders && orders.length > 0) {
                          const order = orders[0];
                          
                          // Lấy fabric usage riêng biệt
                          const { data: fabricUsageData } = await supabase
                            .from('fabric_usage')
                            .select('quantity_used')
                            .eq('order_id', order.id);
                          
                          const totalFabricUsed = fabricUsageData ? 
                            fabricUsageData.reduce((sum: number, usage: any) => sum + Number(usage.quantity_used), 0) : 0;
                          
                          setNewUsage(prev => ({
                            ...prev,
                            customer_name: order.customers?.name || '',
                            customer_code: order.customers?.customer_code || '',
                            notes: `Đơn hàng ${orderNumber} - Tổng vải tiêu thụ: ${totalFabricUsed.toFixed(2)}m`
                          }));
                        }
                      } catch (error) {
                        console.error('Error fetching order:', error);
                      }
                    }
                  }}
                  placeholder="Nhập mã đơn hàng (VD: 1555)"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_name">Tên khách hàng *</Label>
                <Input
                  id="customer_name"
                  value={newUsage.customer_name}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Nhập tên khách hàng"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order_type">Loại đơn</Label>
                <Select value={newUsage.order_type} onValueChange={(value) => setNewUsage(prev => ({ ...prev, order_type: value }))}>
                  <SelectTrigger id="order_type">
                    <SelectValue placeholder="Chọn loại đơn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Phước">Phước</SelectItem>
                    <SelectItem value="Hoan">Hoan</SelectItem>
                    <SelectItem value="Khác">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fabric_variant">Loại vải *</Label>
                <Select value={newUsage.fabric_variant_id} onValueChange={(value) => setNewUsage(prev => ({ ...prev, fabric_variant_id: value }))}>
                  <SelectTrigger id="fabric_variant">
                    <SelectValue placeholder="Chọn loại vải" />
                  </SelectTrigger>
                  <SelectContent>
                    {fabricVariants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse">Kho *</Label>
                <Select value={newUsage.warehouse_id} onValueChange={(value) => setNewUsage(prev => ({ ...prev, warehouse_id: value }))}>
                  <SelectTrigger id="warehouse">
                    <SelectValue placeholder="Chọn kho" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fabric_width">Khổ vải</Label>
                <Input
                  id="fabric_width"
                  value={newUsage.fabric_width}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, fabric_width: e.target.value }))}
                  placeholder="Nhập khổ vải (VD: 150cm)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Số lượng (m) *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.1"
                  value={newUsage.quantity_used}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, quantity_used: Number(e.target.value) }))}
                  placeholder="Nhập số lượng"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Ghi chú</Label>
                <Input
                  id="notes"
                  value={newUsage.notes}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ghi chú (sẽ tự động điền nếu có đơn hàng trùng khớp)"
                />
              </div>
              <Button onClick={handleCreateUsage} className="w-full" disabled={createFabricUsage.isPending}>
                {createFabricUsage.isPending ? 'Đang xử lý...' : 'Ghi nhận sử dụng vải'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Fabric Inventory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fabricSummaryArray.map((fabric, index) => {
          const getCardClass = () => {
            if (fabric.currentWarehouse < 500) return "border-red-500 bg-red-50";
            if (fabric.currentWarehouse < 1000) return "border-yellow-500 bg-yellow-50";
            return "";
          };
          
          const getTextClass = () => {
            if (fabric.currentWarehouse < 500) return "text-red-700";
            if (fabric.currentWarehouse < 1000) return "text-yellow-700";
            return "";
          };

          const canTransfer = fabric.currentWarehouse > 0;

          return (
            <Card key={index} className={getCardClass()}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${getTextClass()}`}>Vải {fabric.fabricName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={`text-sm font-medium ${getTextClass()}`}>Tồn kho:</span>
                    <span className={`text-lg font-bold ${getTextClass()}`}>{fabric.currentWarehouse.toFixed(2)}m</span>
                  </div>
                  {canTransfer && (
                    <div className="pt-2 border-t">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => handleTransferClick(fabric.fabricName)}
                      >
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Chuyển kho
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {fabricSummaryArray.length === 0 && (
          <Card>
            <CardContent className="text-center text-muted-foreground py-8">
              Chưa có dữ liệu tồn kho vải
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="mr-2 h-4 w-4" />
            Bộ lọc và tìm kiếm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo mã đơn, khách hàng, vải..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Loại vải</Label>
              <Select value={selectedFabricType} onValueChange={setSelectedFabricType}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả loại vải" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả loại vải</SelectItem>
                  {getUniqueFabricTypes().map((variant) => (
                    <SelectItem key={variant.fabric_type_id} value={variant.fabric_type_id}>
                      {variant.fabric_types?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Khoảng thời gian</Label>
              <DatePickerWithRange date={dateRange} setDate={setDateRange} />
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setSelectedFabricType('all');
                  setSelectedManager('all');
                  setDateRange(undefined);
                }}
              >
                Xóa bộ lọc
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết sử dụng vải theo đơn hàng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày xuất vải</TableHead>
                  <TableHead>Mã đơn hàng</TableHead>
                  <TableHead>Tên khách hàng</TableHead>
                  <TableHead>Loại đơn</TableHead>
                  <TableHead>Loại vải</TableHead>
                  <TableHead>Khổ vải</TableHead>
                  <TableHead className="text-right">Số lượng (m)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsage.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {format(new Date(item.usage_date), 'dd/MM/yyyy', { locale: vi })}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{item.order_number}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.customer_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.order_type || '-'}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_types' in item.fabric_variants &&
                        item.fabric_variants.fabric_types && typeof item.fabric_variants.fabric_types === 'object' && 'name' in item.fabric_variants.fabric_types
                        ? item.fabric_variants.fabric_types.name : '-'}
                    </TableCell>
                    <TableCell>
                      {item.fabric_width || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatQuantity(item.quantity_used)}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsage.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Không có dữ liệu sử dụng vải
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Fabric Type Usage Summary */}
      {Object.keys(summary.fabricTypeUsage).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tổng kết sử dụng theo loại vải</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(summary.fabricTypeUsage).map(([fabricType, quantity]) => (
                <div key={fabricType} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                  <span className="font-medium">{fabricType}</span>
                  <Badge variant="outline">{formatQuantity(quantity)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chuyển vải giữa các kho</DialogTitle>
            <DialogDescription>
              Chuyển vải {selectedFabricForTransfer} từ {warehouseName} sang kho khác
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Loại vải</Label>
              <Input
                value={selectedFabricForTransfer}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Số lượng chuyển (mét)</Label>
              <Input
                type="number"
                value={transferQuantity}
                onChange={(e) => setTransferQuantity(parseFloat(e.target.value) || 0)}
                placeholder="Nhập số lượng cần chuyển"
                max={fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer)?.currentWarehouse || 0}
              />
              <p className="text-xs text-muted-foreground">
                Tồn kho hiện tại: {fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer)?.currentWarehouse.toFixed(2) || 0}m
              </p>
            </div>
            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Input
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Ghi chú thêm (tùy chọn)"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
                Hủy
              </Button>
              <Button onClick={handleTransferSubmit} disabled={createTransfer.isPending}>
                {createTransfer.isPending ? "Đang xử lý..." : "Tạo phiếu chuyển"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};