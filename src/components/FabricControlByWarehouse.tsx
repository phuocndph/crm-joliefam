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
import { useFabricUsage, useFabricVariants, useWarehouses, useCreateFabricUsage, useFabricInventory, useCreateTransfer, useUpdateInventory, useCreateTransaction } from '@/hooks/useFabrics';
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
  const {
    data: fabricUsage = []
  } = useFabricUsage();
  const {
    data: fabricVariants = []
  } = useFabricVariants();
  const {
    data: warehouses = []
  } = useWarehouses();
  const {
    data: inventory = []
  } = useFabricInventory();
  const createFabricUsage = useCreateFabricUsage();
  const createTransfer = useCreateTransfer();
  const updateInventory = useUpdateInventory();
  const createTransaction = useCreateTransaction();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedManager, setSelectedManager] = useState('all');
  const [selectedFabricType, setSelectedFabricType] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedFabricForTransfer, setSelectedFabricForTransfer] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [transferPackagesCount, setTransferPackagesCount] = useState(0);
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
      filtered = filtered.filter(item => item.warehouses && typeof item.warehouses === 'object' && 'warehouse_type' in item.warehouses && (item.warehouses.warehouse_type === warehouseFilter || item.warehouses.name?.toLowerCase().includes(warehouseFilter.toLowerCase())));
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item => item.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) || item.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || item.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) || item.fabric_variants && typeof item.fabric_variants === 'object' && 'variant_name' in item.fabric_variants && item.fabric_variants.variant_name?.toLowerCase().includes(searchTerm.toLowerCase()) || item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_types' in item.fabric_variants && item.fabric_variants.fabric_types && typeof item.fabric_variants.fabric_types === 'object' && 'name' in item.fabric_variants.fabric_types && item.fabric_variants.fabric_types.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Filter by fabric type
    if (selectedFabricType !== 'all') {
      filtered = filtered.filter(item => item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_type_id' in item.fabric_variants && item.fabric_variants.fabric_type_id === selectedFabricType);
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
      return item.warehouses?.name?.toLowerCase().includes(warehouseFilter.toLowerCase()) || item.warehouses?.warehouse_type === warehouseFilter;
    }).map(item => ({
      ...item,
      fabricCode: item.fabric_variants?.variant_name || '',
      fabricType: item.fabric_variants?.fabric_types?.name || '',
      widthCode: item.fabric_variants?.width_code || '',
      warehouse: item.warehouses?.name || '',
      currentStockMeters: item.current_stock
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
      currentStockMeters: item.current_stock
    }));
    return inventoryData.reduce((acc, item) => {
      const key = item.fabricCode;
      if (!acc[key]) {
        acc[key] = {
          fabricName: item.fabricCode,
          // Only use fabric code, not width code
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
        if ((warehouseFilter.toLowerCase().includes('hà nội') || warehouseFilter.toLowerCase().includes('hanoi')) && (item.warehouse?.toLowerCase().includes('hà nội') || item.warehouse?.toLowerCase().includes('hanoi'))) {
          acc[key].currentWarehouse = acc[key].hanoi;
        } else if ((warehouseFilter.toLowerCase().includes('bắc ninh') || warehouseFilter.toLowerCase().includes('bacninh')) && (item.warehouse?.toLowerCase().includes('bắc ninh') || item.warehouse?.toLowerCase().includes('bacninh'))) {
          acc[key].currentWarehouse = acc[key].bacninh;
        }
      } else {
        acc[key].currentWarehouse = acc[key].total;
      }
      return acc;
    }, {} as Record<string, {
      fabricName: string;
      total: number;
      hanoi: number;
      bacninh: number;
      currentWarehouse: number;
    }>);
  }, [inventory, warehouseFilter]);
  const fabricSummaryArray = Object.values(fabricSummary);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalOrders = new Set(filteredUsage.map(item => item.order_number)).size;
    const totalFabricUsed = filteredUsage.reduce((sum, item) => sum + (item.quantity_used || 0), 0);
    const totalCustomers = new Set(filteredUsage.map(item => item.customer_name)).size;

    // Group by fabric type
    const fabricTypeUsage = filteredUsage.reduce((acc, item) => {
      const fabricType = item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_types' in item.fabric_variants && item.fabric_variants.fabric_types && typeof item.fabric_variants.fabric_types === 'object' && 'name' in item.fabric_variants.fabric_types ? item.fabric_variants.fabric_types.name : 'Không xác định';
      const variant = item.fabric_variants && typeof item.fabric_variants === 'object' && 'variant_name' in item.fabric_variants ? item.fabric_variants.variant_name : '';
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
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập đầy đủ thông tin",
        variant: "destructive"
      });
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
        customer_code: newUsage.customer_code,
        order_type: newUsage.order_type,
        fabric_width: newUsage.fabric_width,
        usage_date: newUsage.usage_date,
        notes: newUsage.notes
      };
      await createFabricUsage.mutateAsync(usageData);

      // Reset form
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
      toast({
        title: "Thành công",
        description: "Đã ghi nhận sử dụng vải"
      });
    } catch (error) {
      console.error('Error creating fabric usage:', error);
      toast({
        title: "Lỗi",
        description: "Không thể ghi nhận sử dụng vải",
        variant: "destructive"
      });
    }
  };
  const formatQuantity = (quantity: number) => {
    return `${quantity.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m`;
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
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập đầy đủ thông tin",
        variant: "destructive"
      });
      return;
    }
    if (!hanoiWarehouse || !bacninhWarehouse) {
      toast({
        title: "Lỗi",
        description: "Không tìm thấy kho Hà Nội hoặc Bắc Ninh",
        variant: "destructive"
      });
      return;
    }

    // Find the fabric variant for the selected fabric
    const selectedFabric = fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer);
    if (!selectedFabric) {
      toast({
        title: "Lỗi",
        description: "Không tìm thấy thông tin vải",
        variant: "destructive"
      });
      return;
    }

    // Check if transfer is from Hanoi to Bac Ninh or vice versa
    const isFromHanoi = warehouseFilter?.toLowerCase().includes('hà nội') || warehouseFilter?.toLowerCase().includes('hanoi');
    const maxTransferableQuantity = isFromHanoi ? selectedFabric.hanoi : selectedFabric.bacninh;
    if (maxTransferableQuantity < transferQuantity) {
      toast({
        title: "Lỗi",
        description: `Số lượng chuyển vượt quá tồn kho (${maxTransferableQuantity.toFixed(2)}m)`,
        variant: "destructive"
      });
      return;
    }

    // Find the variant ID
    const fabricVariant = fabricVariants.find(v => v.variant_name === selectedFabricForTransfer);
    if (!fabricVariant) {
      toast({
        title: "Lỗi",
        description: "Không tìm thấy thông tin loại vải",
        variant: "destructive"
      });
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
      const fromInventoryItem = inventory.find(item => item.fabric_variant_id === fabricVariant.id && item.warehouse_id === fromWarehouse.id);
      if (fromInventoryItem) {
        const newFromStock = Math.max(0, fromInventoryItem.current_stock - transferQuantity);
        const newFromPackages = Math.max(0, (fromInventoryItem.packages_count || 0) - transferPackagesCount);
        await updateInventory.mutateAsync({
          fabric_variant_id: fabricVariant.id,
          warehouse_id: fromWarehouse.id,
          current_stock: newFromStock,
          packages_count: newFromPackages,
          reserved_stock: fromInventoryItem.reserved_stock || 0,
          minimum_stock: fromInventoryItem.minimum_stock || 0,
          maximum_stock: fromInventoryItem.maximum_stock || 0
        });
      }

      // Update inventory - add to destination warehouse
      const toInventoryItem = inventory.find(item => item.fabric_variant_id === fabricVariant.id && item.warehouse_id === toWarehouse.id);
      const newToStock = (toInventoryItem?.current_stock || 0) + transferQuantity;
      const newToPackages = (toInventoryItem?.packages_count || 0) + transferPackagesCount;
      await updateInventory.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        warehouse_id: toWarehouse.id,
        current_stock: newToStock,
        packages_count: newToPackages,
        reserved_stock: toInventoryItem?.reserved_stock || 0,
        minimum_stock: toInventoryItem?.minimum_stock || 0,
        maximum_stock: toInventoryItem?.maximum_stock || 0
      });

      // Create transfer transactions for history
      await createTransaction.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        warehouse_id: fromWarehouse.id,
        transaction_type: 'transfer_out',
        quantity: -transferQuantity,
        packages_count: -transferPackagesCount,
        notes: `Chuyển đến ${toWarehouse.name}. ${transferNotes || ''}`
      });

      await createTransaction.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        warehouse_id: toWarehouse.id,
        transaction_type: 'transfer_in',
        quantity: transferQuantity,
        packages_count: transferPackagesCount,
        notes: `Nhận từ ${fromWarehouse.name}. ${transferNotes || ''}`
      });

      setSelectedFabricForTransfer('');
      setTransferQuantity(0);
      setTransferPackagesCount(0);
      setTransferNotes('');
      setShowTransferDialog(false);
      toast({
        title: "Thành công",
        description: "Đã chuyển vải thành công và cập nhật tồn kho"
      });
    } catch (error) {
      console.error('Error creating transfer:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi chuyển vải",
        variant: "destructive"
      });
    }
  };
  const handleTransferClick = (fabricName: string) => {
    setSelectedFabricForTransfer(fabricName);
    setShowTransferDialog(true);
  };
  return <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Kiểm soát vải {warehouseName}</h2>
        <p className="text-muted-foreground">Theo dõi sử dụng vải theo đơn hàng và khách hàng</p>
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
        return <Card key={index} className={getCardClass()}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${getTextClass()}`}>Vải {fabric.fabricName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={`text-sm font-medium ${getTextClass()}`}>Tồn kho:</span>
                    <span className={`text-lg font-bold ${getTextClass()}`}>{fabric.currentWarehouse.toLocaleString('vi-VN', { maximumFractionDigits: 3 }).replace(/,000$/, '')}m</span>
                  </div>
                  {canTransfer && <div className="pt-2 border-t">
                      <Button variant="outline" size="sm" className="w-full" onClick={() => handleTransferClick(fabric.fabricName)}>
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Chuyển kho
                      </Button>
                    </div>}
                </div>
              </CardContent>
            </Card>;
      })}
        {fabricSummaryArray.length === 0 && <Card>
            <CardContent className="text-center text-muted-foreground py-8">
              Chưa có dữ liệu tồn kho vải
            </CardContent>
          </Card>}
      </div>

      {/* Transfer Dialog */}

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
              <Input value={selectedFabricForTransfer} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Số lượng chuyển (mét)</Label>
              <Input type="number" value={transferQuantity} onChange={e => setTransferQuantity(parseFloat(e.target.value) || 0)} placeholder="Nhập số lượng cần chuyển" max={fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer)?.currentWarehouse || 0} />
              <p className="text-xs text-muted-foreground">
                Tồn kho hiện tại: {fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer)?.currentWarehouse.toFixed(2) || 0}m
              </p>
            </div>
            <div className="space-y-2">
              <Label>Số kiện chuyển</Label>
              <Input type="number" value={transferPackagesCount} onChange={e => setTransferPackagesCount(parseInt(e.target.value) || 0)} placeholder="Nhập số kiện (tùy chọn)" min={0} />
            </div>
            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Input value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="Ghi chú thêm (tùy chọn)" />
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
    </div>;
};