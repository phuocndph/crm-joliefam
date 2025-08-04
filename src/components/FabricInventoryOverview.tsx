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
import { FabricTransactionsTable } from "@/components/FabricTransactionsTable";

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
    packages_count: 0,
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
    currentStockRolls: item.packages_count || 0, // Use actual packages count from database
    currentStockMeters: item.current_stock,
  }));

  // Group by fabric type for chart
  const chartData = inventoryData.reduce((acc, item) => {
    const key = item.fabricCode;
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
    const key = item.fabricCode;
    if (!acc[key]) {
      acc[key] = {
        fabricName: item.fabricCode, // Only use fabric code, not width code
        total: 0,
        totalPackages: 0,
        hanoi: 0,
        hanoiPackages: 0,
        bacninh: 0,
        bacninhPackages: 0
      };
    }
    
    acc[key].total += item.currentStockMeters;
    acc[key].totalPackages += item.currentStockRolls;
    
    if (item.warehouse?.toLowerCase().includes('hà nội') || item.warehouse?.toLowerCase().includes('hanoi')) {
      acc[key].hanoi += item.currentStockMeters;
      acc[key].hanoiPackages += item.currentStockRolls;
    } else if (item.warehouse?.toLowerCase().includes('bắc ninh') || item.warehouse?.toLowerCase().includes('bacninh')) {
      acc[key].bacninh += item.currentStockMeters;
      acc[key].bacninhPackages += item.currentStockRolls;
    }
    
    return acc;
  }, {} as Record<string, { fabricName: string; total: number; totalPackages: number; hanoi: number; hanoiPackages: number; bacninh: number; bacninhPackages: number }>);

  const fabricSummaryArray = Object.values(fabricSummary);

  // Format number function
  const formatNumber = (num: number) => {
    if (num % 1 === 0) {
      return num.toLocaleString('vi-VN');
    }
    return num.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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
        packages_count: newInbound.packages_count,
        supplier_name: newInbound.supplier_name,
        notes: newInbound.notes
      });

      // Update Hanoi inventory - cộng dồn số lượng
      const existingHanoiInventory = inventory.find(item => 
        item.fabric_variant_id === newInbound.fabric_variant_id && item.warehouse_id === hanoiWarehouse.id
      );
      const currentHanoiStock = existingHanoiInventory?.current_stock || 0;
      
      await updateInventory.mutateAsync({
        fabric_variant_id: newInbound.fabric_variant_id,
        warehouse_id: hanoiWarehouse.id,
        current_stock: currentHanoiStock + hanoiQuantity,
        packages_count: (existingHanoiInventory?.packages_count || 0) + newInbound.packages_count
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

        // Update Bac Ninh inventory - cộng dồn số lượng
        const existingBacninhInventory = inventory.find(item => 
          item.fabric_variant_id === newInbound.fabric_variant_id && item.warehouse_id === bacninhWarehouse.id
        );
        const currentBacninhStock = existingBacninhInventory?.current_stock || 0;
        
        await updateInventory.mutateAsync({
          fabric_variant_id: newInbound.fabric_variant_id,
          warehouse_id: bacninhWarehouse.id,
          current_stock: currentBacninhStock + newInbound.transfer_to_bacninh,
          packages_count: existingBacninhInventory?.packages_count || 0 // Keep existing packages at Bac Ninh
        });
      }

      setNewInbound({
        fabric_variant_id: '',
        quantity: 0,
        packages_count: 0,
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
    const fabricVariant = variants.find(v => v.variant_name === selectedFabricForTransfer);
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
          packages_count: fromInventoryItem.packages_count || 0, // Keep existing packages count
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
        packages_count: toInventoryItem?.packages_count || 0, // Keep existing packages count  
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
                  <SelectContent className="bg-background border shadow-lg z-50">
                    {variants && variants.length > 0 ? (
                      variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id} className="cursor-pointer hover:bg-accent">
                          {variant.variant_name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>Chưa có biến thể vải nào</SelectItem>
                    )}
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
                <Label>Số kiện</Label>
                <Input
                  type="number"
                  value={newInbound.packages_count}
                  onChange={(e) => setNewInbound(prev => ({ ...prev, packages_count: parseInt(e.target.value) || 0 }))}
                  placeholder="Nhập số kiện"
                />
                <p className="text-xs text-muted-foreground">
                  Trung bình: {newInbound.packages_count > 0 ? (newInbound.quantity / newInbound.packages_count).toFixed(2) : 0} mét/kiện
                </p>
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

      {/* Fabric Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tổng quan tồn kho vải</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2} className="text-center align-middle border-r">Tên Loại Vải</TableHead>
                  <TableHead colSpan={2} className="text-center border-r">Hà Nội</TableHead>
                  <TableHead colSpan={2} className="text-center border-r">Bắc Ninh</TableHead>
                  <TableHead colSpan={2} className="text-center border-r">Tổng</TableHead>
                  <TableHead rowSpan={2} className="text-center align-middle">Thao Tác</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="text-center text-xs">Kiện</TableHead>
                  <TableHead className="text-center text-xs border-r">Mét</TableHead>
                  <TableHead className="text-center text-xs">Kiện</TableHead>
                  <TableHead className="text-center text-xs border-r">Mét</TableHead>
                  <TableHead className="text-center text-xs">Kiện</TableHead>
                  <TableHead className="text-center text-xs border-r">Mét</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fabricSummaryArray.map((fabric, index) => {
                  const getRowClass = () => {
                    if (fabric.total < 500) return "bg-red-50 text-red-700";
                    if (fabric.total < 1000) return "bg-yellow-50 text-yellow-700";
                    return "";
                  };

                  return (
                    <TableRow key={index} className={getRowClass()}>
                      <TableCell className="font-medium border-r">
                        Vải {fabric.fabricName}
                      </TableCell>
                      <TableCell className="text-center">
                        {fabric.hanoiPackages}
                      </TableCell>
                      <TableCell className="text-center border-r">
                        {formatNumber(fabric.hanoi)}
                      </TableCell>
                      <TableCell className="text-center">
                        {fabric.bacninhPackages}
                      </TableCell>
                      <TableCell className="text-center border-r">
                        {formatNumber(fabric.bacninh)}
                      </TableCell>
                      <TableCell className="text-center font-semibold">
                        {fabric.totalPackages}
                      </TableCell>
                      <TableCell className="text-center font-semibold border-r">
                        {formatNumber(fabric.total)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col gap-1">
                          {(fabric.hanoi > 0 || fabric.bacninh > 0) && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-xs px-2"
                              onClick={() => handleTransferClick(fabric.fabricName)}
                            >
                              <ArrowRight className="mr-1 h-3 w-3" />
                              Chuyển kho
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            className="h-7 text-xs px-2"
                            onClick={() => setShowInboundDialog(true)}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Nhập kho
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {fabricSummaryArray.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      <div className="space-y-4">
                        <p>Chưa có dữ liệu tồn kho</p>
                        <Button 
                          onClick={() => setShowInboundDialog(true)}
                          className="mx-auto"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Nhập kho đầu tiên
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {/* Total row */}
                {fabricSummaryArray.length > 0 && (
                  <TableRow className="bg-muted font-semibold border-t-2">
                    <TableCell className="border-r">TỔNG CỘNG</TableCell>
                    <TableCell className="text-center">
                      {fabricSummaryArray.reduce((sum, item) => sum + item.hanoiPackages, 0)}
                    </TableCell>
                    <TableCell className="text-center border-r">
                      {formatNumber(fabricSummaryArray.reduce((sum, item) => sum + item.hanoi, 0))}
                    </TableCell>
                    <TableCell className="text-center">
                      {fabricSummaryArray.reduce((sum, item) => sum + item.bacninhPackages, 0)}
                    </TableCell>
                    <TableCell className="text-center border-r">
                      {formatNumber(fabricSummaryArray.reduce((sum, item) => sum + item.bacninh, 0))}
                    </TableCell>
                    <TableCell className="text-center">
                      {fabricSummaryArray.reduce((sum, item) => sum + item.totalPackages, 0)}
                    </TableCell>
                    <TableCell className="text-center border-r">
                      {formatNumber(fabricSummaryArray.reduce((sum, item) => sum + item.total, 0))}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
                    <TableHead className="text-center" colSpan={2}>Còn trong kho</TableHead>
                    <TableHead>Kho</TableHead>
                    <TableHead>Cập nhật lần cuối</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead className="text-center">Cuộn</TableHead>
                    <TableHead className="text-center">Mét</TableHead>
                    <TableHead></TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.fabricCode}</TableCell>
                      <TableCell className="text-center">{item.currentStockRolls}</TableCell>
                      <TableCell className="text-center">{item.currentStockMeters.toFixed(2)}</TableCell>
                      <TableCell>{item.warehouse}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.last_updated ? new Date(item.last_updated).toLocaleString('vi-VN') : 'Chưa có'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {inventoryData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Chưa có dữ liệu tồn kho
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Total row */}
                  {inventoryData.length > 0 && (
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell>Tổng</TableCell>
                      <TableCell className="text-center">{inventoryData.reduce((sum, item) => sum + item.currentStockRolls, 0)}</TableCell>
                      <TableCell className="text-center">{inventoryData.reduce((sum, item) => sum + item.currentStockMeters, 0).toFixed(2)}</TableCell>
                      <TableCell></TableCell>
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

      {/* Fabric Transactions Table */}
      <FabricTransactionsTable />

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