import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Package2, ArrowRight } from "lucide-react";
import { useFabricInventory, useFabricVariants, useFabricTypes, useWarehouses, useCreateTransaction, useUpdateInventory, useCreateTransfer } from "@/hooks/useFabrics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from "@/hooks/use-toast";

export const FabricInventoryOverview = () => {
  const { data: inventory = [] } = useFabricInventory();
  const { data: variants = [] } = useFabricVariants();
  const { data: fabricTypes = [] } = useFabricTypes();
  const { data: warehouses = [] } = useWarehouses();
  const createTransaction = useCreateTransaction();
  const updateInventory = useUpdateInventory();
  const createTransfer = useCreateTransfer();
  
  const [showInboundDialog, setShowInboundDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [selectedFabricForTransfer, setSelectedFabricForTransfer] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [transferNotes, setTransferNotes] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [newInbound, setNewInbound] = useState({
    fabric_variant_id: '',
    quantity: 0,
    supplier_name: '',
    transfer_to_bacninh: 0,
    notes: ''
  });

  // Process inventory data for table display
  const inventoryData = inventory.map(item => ({
    ...item,
    fabricCode: item.fabric_variants?.variant_name || '',
    fabricType: item.fabric_variants?.fabric_types?.name || '',
    widthCode: item.fabric_variants?.width_code || '',
    warehouse: item.warehouses?.name || '',
    currentStockRolls: Math.floor(item.current_stock / 50), // Assuming 50m per roll
    currentStockMeters: item.current_stock,
  }));

  // Group by fabric type for chart
  const chartData = inventoryData.reduce((acc, item) => {
    const key = `${item.fabricCode} ${item.widthCode}`;
    const existing = acc.find(d => d.name === key);
    if (existing) {
      existing.meters += item.currentStockMeters;
      existing.rolls += item.currentStockRolls;
    } else {
      acc.push({
        name: key,
        meters: item.currentStockMeters,
        rolls: item.currentStockRolls,
      });
    }
    return acc;
  }, [] as Array<{ name: string; meters: number; rolls: number }>);

  // Find main warehouses
  const hanoiWarehouse = warehouses.find(w => w.name.toLowerCase().includes('hà nội') || w.name.toLowerCase().includes('hanoi'));
  const bacninhWarehouse = warehouses.find(w => w.name.toLowerCase().includes('bắc ninh') || w.name.toLowerCase().includes('bacninh'));

  // Group by fabric variant with warehouse breakdown
  const fabricSummary = inventoryData.reduce((acc, item) => {
    const key = `${item.fabricCode} ${item.widthCode}`;
    if (!acc[key]) {
      acc[key] = {
        fabricName: key,
        total: 0,
        hanoi: 0,
        bacninh: 0
      };
    }
    
    acc[key].total += item.currentStockMeters;
    
    if (item.warehouse?.toLowerCase().includes('hà nội') || item.warehouse?.toLowerCase().includes('hanoi')) {
      acc[key].hanoi += item.currentStockMeters;
    } else if (item.warehouse?.toLowerCase().includes('bắc ninh') || item.warehouse?.toLowerCase().includes('bacninh')) {
      acc[key].bacninh += item.currentStockMeters;
    }
    
    return acc;
  }, {} as Record<string, { fabricName: string; total: number; hanoi: number; bacninh: number }>);

  const fabricSummaryArray = Object.values(fabricSummary);

  const handleInboundSubmit = async () => {
    if (!newInbound.fabric_variant_id || newInbound.quantity <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }

    if (!hanoiWarehouse) {
      toast({ title: "Lỗi", description: "Không tìm thấy kho Hà Nội", variant: "destructive" });
      return;
    }

    try {
      const hanoiQuantity = newInbound.quantity - newInbound.transfer_to_bacninh;
      
      // Create inbound transaction for Hanoi
      await createTransaction.mutateAsync({
        fabric_variant_id: newInbound.fabric_variant_id,
        warehouse_id: hanoiWarehouse.id,
        transaction_type: 'inbound',
        quantity: hanoiQuantity,
        supplier_name: newInbound.supplier_name,
        notes: newInbound.notes
      });

      // Update Hanoi inventory
      await updateInventory.mutateAsync({
        fabric_variant_id: newInbound.fabric_variant_id,
        warehouse_id: hanoiWarehouse.id,
        current_stock: hanoiQuantity
      });

      // If transferring to Bac Ninh
      if (newInbound.transfer_to_bacninh > 0 && bacninhWarehouse) {
        // Create transfer transaction
        await createTransaction.mutateAsync({
          fabric_variant_id: newInbound.fabric_variant_id,
          warehouse_id: bacninhWarehouse.id,
          transaction_type: 'transfer_in',
          quantity: newInbound.transfer_to_bacninh,
          notes: `Chuyển từ kho Hà Nội`
        });

        // Update Bac Ninh inventory
        await updateInventory.mutateAsync({
          fabric_variant_id: newInbound.fabric_variant_id,
          warehouse_id: bacninhWarehouse.id,
          current_stock: newInbound.transfer_to_bacninh
        });
      }

      setNewInbound({
        fabric_variant_id: '',
        quantity: 0,
        supplier_name: '',
        transfer_to_bacninh: 0,
        notes: ''
      });
      setShowInboundDialog(false);
      toast({ title: "Thành công", description: "Đã nhập kho và phân bổ vải thành công" });
    } catch (error) {
      console.error('Error creating inbound:', error);
      toast({ title: "Lỗi", description: "Có lỗi xảy ra khi nhập kho", variant: "destructive" });
    }
  };

  const handleTransferSubmit = async () => {
    if (!selectedFabricForTransfer || transferQuantity <= 0 || !fromWarehouseId || !toWarehouseId) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }

    if (fromWarehouseId === toWarehouseId) {
      toast({ title: "Lỗi", description: "Kho nguồn và kho đích không được trùng nhau", variant: "destructive" });
      return;
    }

    // Find the fabric variant for the selected fabric
    const selectedFabric = fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer);
    if (!selectedFabric) {
      toast({ title: "Lỗi", description: "Không tìm thấy thông tin vải", variant: "destructive" });
      return;
    }

    // Get available quantity from source warehouse
    const fromWarehouse = warehouses.find(w => w.id === fromWarehouseId);
    const toWarehouse = warehouses.find(w => w.id === toWarehouseId);
    
    if (!fromWarehouse || !toWarehouse) {
      toast({ title: "Lỗi", description: "Không tìm thấy thông tin kho", variant: "destructive" });
      return;
    }

    let availableQuantity = 0;
    if (fromWarehouse.name.toLowerCase().includes('hà nội') || fromWarehouse.name.toLowerCase().includes('hanoi')) {
      availableQuantity = selectedFabric.hanoi;
    } else if (fromWarehouse.name.toLowerCase().includes('bắc ninh') || fromWarehouse.name.toLowerCase().includes('bacninh')) {
      availableQuantity = selectedFabric.bacninh;
    }

    if (availableQuantity < transferQuantity) {
      toast({ title: "Lỗi", description: `Số lượng chuyển vượt quá tồn kho ${fromWarehouse.name} (${availableQuantity.toFixed(2)}m)`, variant: "destructive" });
      return;
    }

    // Find the variant ID
    const fabricVariant = variants.find(v => `${v.variant_name} ${v.width_code}` === selectedFabricForTransfer);
    if (!fabricVariant) {
      toast({ title: "Lỗi", description: "Không tìm thấy thông tin loại vải", variant: "destructive" });
      return;
    }

    try {
      // First create transfer record
      await createTransfer.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        quantity: transferQuantity,
        notes: transferNotes || `Chuyển ${transferQuantity}m từ ${fromWarehouse.name} về ${toWarehouse.name}`
      });

      // Update inventory - reduce from source warehouse
      const fromInventoryItem = inventory.find(item => 
        item.fabric_variant_id === fabricVariant.id && item.warehouse_id === fromWarehouseId
      );
      
      if (fromInventoryItem) {
        const newFromStock = Math.max(0, fromInventoryItem.current_stock - transferQuantity);
        await updateInventory.mutateAsync({
          fabric_variant_id: fabricVariant.id,
          warehouse_id: fromWarehouseId,
          current_stock: newFromStock,
          reserved_stock: fromInventoryItem.reserved_stock || 0,
          minimum_stock: fromInventoryItem.minimum_stock || 0,
          maximum_stock: fromInventoryItem.maximum_stock || 0
        });
      }

      // Update inventory - add to destination warehouse
      const toInventoryItem = inventory.find(item => 
        item.fabric_variant_id === fabricVariant.id && item.warehouse_id === toWarehouseId
      );
      
      const newToStock = (toInventoryItem?.current_stock || 0) + transferQuantity;
      await updateInventory.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        warehouse_id: toWarehouseId,
        current_stock: newToStock,
        reserved_stock: toInventoryItem?.reserved_stock || 0,
        minimum_stock: toInventoryItem?.minimum_stock || 0,
        maximum_stock: toInventoryItem?.maximum_stock || 0
      });

      // Create transactions for tracking
      await createTransaction.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        warehouse_id: fromWarehouseId,
        transaction_type: 'transfer_out',
        quantity: -transferQuantity,
        notes: `Chuyển đi ${toWarehouse.name}`
      });

      await createTransaction.mutateAsync({
        fabric_variant_id: fabricVariant.id,
        warehouse_id: toWarehouseId,
        transaction_type: 'transfer_in',
        quantity: transferQuantity,
        notes: `Nhận từ ${fromWarehouse.name}`
      });

      setSelectedFabricForTransfer('');
      setTransferQuantity(0);
      setTransferNotes('');
      setFromWarehouseId('');
      setToWarehouseId('');
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
      {/* Header with Import Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Tổng số lượng vải</h2>
          <p className="text-sm text-muted-foreground">Quản lý tồn kho tổng thể các loại vải</p>
        </div>
        <Dialog open={showInboundDialog} onOpenChange={setShowInboundDialog}>
          <DialogTrigger asChild>
            <Button>
              <Package2 className="mr-2 h-4 w-4" />
              Nhập kho vải
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nhập kho vải mới</DialogTitle>
              <DialogDescription>
                Nhập vải vào kho chính (Hà Nội) và phân bổ sang Bắc Ninh nếu cần
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Loại vải</Label>
                <Select value={newInbound.fabric_variant_id} onValueChange={(value) => setNewInbound(prev => ({ ...prev, fabric_variant_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn loại vải" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants?.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`} {variant.width_code && `[${variant.width_code}]`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tổng số lượng nhập (mét)</Label>
                <Input
                  type="number"
                  value={newInbound.quantity}
                  onChange={(e) => setNewInbound(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                  placeholder="Nhập số lượng"
                />
              </div>
              <div className="space-y-2">
                <Label>Chuyển sang Bắc Ninh (mét)</Label>
                <Input
                  type="number"
                  value={newInbound.transfer_to_bacninh}
                  onChange={(e) => setNewInbound(prev => ({ ...prev, transfer_to_bacninh: parseFloat(e.target.value) || 0 }))}
                  placeholder="Số lượng chuyển sang Bắc Ninh"
                  max={newInbound.quantity}
                />
                <p className="text-xs text-muted-foreground">
                  Còn lại tại Hà Nội: {(newInbound.quantity - newInbound.transfer_to_bacninh).toFixed(2)} mét
                </p>
              </div>
              <div className="space-y-2">
                <Label>Nhà cung cấp</Label>
                <Input
                  value={newInbound.supplier_name}
                  onChange={(e) => setNewInbound(prev => ({ ...prev, supplier_name: e.target.value }))}
                  placeholder="Tên nhà cung cấp"
                />
              </div>
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Input
                  value={newInbound.notes}
                  onChange={(e) => setNewInbound(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ghi chú thêm"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowInboundDialog(false)}>
                  Hủy
                </Button>
                <Button onClick={handleInboundSubmit} disabled={createTransaction.isPending}>
                  {createTransaction.isPending ? "Đang xử lý..." : "Nhập kho"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Fabric Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fabricSummaryArray.map((fabric, index) => {
          const getCardClass = () => {
            if (fabric.total < 500) return "border-red-500 bg-red-50";
            if (fabric.total < 1000) return "border-yellow-500 bg-yellow-50";
            return "";
          };
          
          const getTextClass = () => {
            if (fabric.total < 500) return "text-red-700";
            if (fabric.total < 1000) return "text-yellow-700";
            return "";
          };

          return (
            <Card key={index} className={getCardClass()}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${getTextClass()}`}>Vải {fabric.fabricName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={`text-sm font-medium ${getTextClass()}`}>Tổng:</span>
                    <span className={`text-lg font-bold ${getTextClass()}`}>{fabric.total.toFixed(2)}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Hà Nội:</span>
                    <span className="text-sm">{fabric.hanoi.toFixed(2)}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Bắc Ninh:</span>
                    <span className="text-sm">{fabric.bacninh.toFixed(2)}m</span>
                  </div>
                  {(fabric.hanoi > 0 || fabric.bacninh > 0) && (
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
              Chưa có dữ liệu tồn kho
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <CardTitle>Bảng tồn kho chi tiết</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã vải</TableHead>
                    <TableHead>Khổ vải</TableHead>
                    <TableHead>Tên vải</TableHead>
                    <TableHead className="text-center" colSpan={2}>Còn trong kho</TableHead>
                    <TableHead>Kho</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead colSpan={3}></TableHead>
                    <TableHead className="text-center">Cuộn</TableHead>
                    <TableHead className="text-center">Mét</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.fabricCode}</TableCell>
                      <TableCell>{item.widthCode}</TableCell>
                      <TableCell>{item.fabricType}</TableCell>
                      <TableCell className="text-center">{item.currentStockRolls}</TableCell>
                      <TableCell className="text-center">{item.currentStockMeters.toFixed(2)}</TableCell>
                      <TableCell>{item.warehouse}</TableCell>
                    </TableRow>
                  ))}
                  {inventoryData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Chưa có dữ liệu tồn kho
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Total row */}
                  {inventoryData.length > 0 && (
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell colSpan={3}>Tổng</TableCell>
                      <TableCell className="text-center">{inventoryData.reduce((sum, item) => sum + item.currentStockRolls, 0)}</TableCell>
                      <TableCell className="text-center">{inventoryData.reduce((sum, item) => sum + item.currentStockMeters, 0).toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Biểu đồ thể hiện tổng số mét vải các loại</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={10}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      `${Number(value).toFixed(2)} ${name === 'meters' ? 'mét' : 'cuộn'}`,
                      name === 'meters' ? 'Mét' : 'Cuộn'
                    ]}
                  />
                  <Bar dataKey="meters" fill="#3b82f6" name="meters" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chuyển vải giữa các kho</DialogTitle>
            <DialogDescription>
              Chuyển vải {selectedFabricForTransfer} từ kho này sang kho khác
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
              <Label>Từ kho</Label>
              <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kho nguồn" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Đến kho</Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kho đích" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.filter(w => w.id !== fromWarehouseId).map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Số lượng chuyển (mét)</Label>
              <Input
                type="number"
                value={transferQuantity}
                onChange={(e) => setTransferQuantity(parseFloat(e.target.value) || 0)}
                placeholder="Nhập số lượng cần chuyển"
              />
              {fromWarehouseId && (
                <p className="text-xs text-muted-foreground">
                  Tồn kho: {(() => {
                    const selectedFabric = fabricSummaryArray.find(f => f.fabricName === selectedFabricForTransfer);
                    const fromWarehouse = warehouses.find(w => w.id === fromWarehouseId);
                    if (!selectedFabric || !fromWarehouse) return "0";
                    
                    if (fromWarehouse.name.toLowerCase().includes('hà nội') || fromWarehouse.name.toLowerCase().includes('hanoi')) {
                      return selectedFabric.hanoi.toFixed(2);
                    } else if (fromWarehouse.name.toLowerCase().includes('bắc ninh') || fromWarehouse.name.toLowerCase().includes('bacninh')) {
                      return selectedFabric.bacninh.toFixed(2);
                    }
                    return "0";
                  })()}m
                </p>
              )}
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