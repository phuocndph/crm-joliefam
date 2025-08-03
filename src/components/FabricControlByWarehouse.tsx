import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowRight, Package } from 'lucide-react';
import { useFabricInventory, useFabricVariants, useWarehouses, useCreateTransfer, useUpdateInventory } from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';
import { FabricUsageRecording } from './FabricUsageRecording';
import { FabricUsageDetail } from './FabricUsageDetail';

interface FabricControlByWarehouseProps {
  warehouseName: string;
  warehouseFilter?: string;
}

export const FabricControlByWarehouse: React.FC<FabricControlByWarehouseProps> = ({
  warehouseName,
  warehouseFilter
}) => {
  const { data: fabricVariants = [] } = useFabricVariants();
  const { data: warehouses = [] } = useWarehouses();
  const { data: inventory = [] } = useFabricInventory();
  const createTransfer = useCreateTransfer();
  const updateInventory = useUpdateInventory();

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedFabricForTransfer, setSelectedFabricForTransfer] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [transferNotes, setTransferNotes] = useState('');

  // Find warehouses
  const hanoiWarehouse = warehouses.find(w => w.name.toLowerCase().includes('hà nội') || w.name.toLowerCase().includes('hanoi'));
  const bacninhWarehouse = warehouses.find(w => w.name.toLowerCase().includes('bắc ninh') || w.name.toLowerCase().includes('bacninh'));

  // Group by fabric variant with warehouse breakdown
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
      <div>
        <h2 className="text-2xl font-bold">Kiểm soát vải {warehouseName}</h2>
        <p className="text-muted-foreground">Theo dõi sử dụng vải theo đơn hàng và khách hàng</p>
      </div>

      {/* Fabric Inventory Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Tồn kho vải {warehouseName}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                <CardContent className="flex items-center justify-center h-24">
                  <div className="text-center">
                    <Package className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Chưa có dữ liệu tồn kho</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fabric Usage Recording */}
      <Card>
        <CardHeader>
          <CardTitle>Ghi nhận sử dụng vải</CardTitle>
        </CardHeader>
        <CardContent>
          <FabricUsageRecording warehouseFilter={warehouseFilter} />
        </CardContent>
      </Card>

      {/* Fabric Usage Details */}
      <FabricUsageDetail warehouseFilter={warehouseFilter} />

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