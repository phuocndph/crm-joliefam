import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Package2, ArrowRight, Edit, Trash2 } from "lucide-react";
import { useFabricInventory, useFabricTypes, useWarehouses, useCreateTransaction, useUpdateInventory, useCreateTransfer, useUpdateFabricType, useDeleteFabricType, useCreateFabricVariant } from "@/hooks/useFabrics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from "@/hooks/use-toast";
import { FabricTransactionsTable } from "@/components/FabricTransactionsTable";

export const FabricInventoryOverview = () => {
  const { data: inventory = [] } = useFabricInventory();
  const { data: fabricTypes = [] } = useFabricTypes();
  const { data: warehouses = [] } = useWarehouses();
  const createTransaction = useCreateTransaction();
  const updateInventory = useUpdateInventory();
  const createTransfer = useCreateTransfer();
  const updateFabricType = useUpdateFabricType();
  const deleteFabricType = useDeleteFabricType();
  const createFabricVariant = useCreateFabricVariant();
  
  // Debug log
  console.log('FabricInventoryOverview - fabricTypes:', fabricTypes);
  
  const [showInboundDialog, setShowInboundDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedFabric, setSelectedFabric] = useState<any>(null);
  const [selectedFabricForTransfer, setSelectedFabricForTransfer] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [transferNotes, setTransferNotes] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    description: ''
  });
  // Sử dụng fabric_type_id cho UI nhưng sẽ tạo fabric_variant tự động
  const [newInbound, setNewInbound] = useState({
    fabric_type_id: '',
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
    warehouse: item.warehouses?.name || '',
    currentStockRolls: item.packages_count || 0,
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

  // Group by fabric type with warehouse breakdown
  const fabricSummary = inventoryData.reduce((acc, item) => {
    const key = item.fabricCode;
    if (!acc[key]) {
      acc[key] = {
        fabricName: item.fabricCode,
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

  // Format number function with Vietnamese formatting
  const formatNumber = (num: number) => {
    if (num % 1 === 0) {
      return num.toLocaleString('vi-VN');
    }
    return num.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  };

  // Format input value for display
  const formatInputValue = (value: number) => {
    if (value === 0) return '';
    return formatNumber(value);
  };

  // Parse formatted input value back to number
  const parseInputValue = (value: string) => {
    if (!value) return 0;
    // Remove dots and replace comma with dot for parsing
    const cleanValue = value.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanValue) || 0;
  };

  const handleInboundSubmit = async () => {
    if (!newInbound.fabric_type_id || newInbound.quantity <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }

    // Show confirmation dialog instead of processing immediately
    setShowConfirmDialog(true);
  };

  const handleConfirmInbound = async () => {
    if (!hanoiWarehouse) {
      toast({ title: "Lỗi", description: "Không tìm thấy kho Hà Nội", variant: "destructive" });
      return;
    }

    try {
      const selectedFabricType = fabricTypes.find(ft => ft.id === newInbound.fabric_type_id);
      if (!selectedFabricType) {
        toast({ title: "Lỗi", description: "Không tìm thấy loại vải", variant: "destructive" });
        return;
      }

      // Check if fabric variant exists for this fabric type, if not create one
      let fabricVariantId = newInbound.fabric_type_id;
      
      // Try to find existing inventory with this fabric_type_id as fabric_variant_id
      const existingInventory = inventory.find(item => item.fabric_variant_id === newInbound.fabric_type_id);
      
      if (!existingInventory) {
        // Create fabric variant from fabric type
        try {
          const newVariant = await createFabricVariant.mutateAsync({
            fabric_type_id: newInbound.fabric_type_id,
            variant_name: selectedFabricType.name,
            color: 'Trắng', // Default color
            origin: 'VN', // Default origin
            unit: 'm' // Default unit
          });
          fabricVariantId = newVariant.id;
        } catch (variantError) {
          // If variant creation fails, use fabric_type_id directly
          console.log('Using fabric_type_id as variant_id:', newInbound.fabric_type_id);
          fabricVariantId = newInbound.fabric_type_id;
        }
      }

      const hanoiQuantity = newInbound.quantity - newInbound.transfer_to_bacninh;
      
      // Create inbound transaction for Hanoi
      await createTransaction.mutateAsync({
        fabric_variant_id: fabricVariantId,
        warehouse_id: hanoiWarehouse.id,
        transaction_type: 'inbound',
        quantity: hanoiQuantity,
        packages_count: newInbound.packages_count,
        supplier_name: newInbound.supplier_name,
        notes: newInbound.notes
      });

      // Update Hanoi inventory
      const existingHanoiInventory = inventory.find(item => 
        item.fabric_variant_id === fabricVariantId && item.warehouse_id === hanoiWarehouse.id
      );
      const currentHanoiStock = existingHanoiInventory?.current_stock || 0;
      
      await updateInventory.mutateAsync({
        fabric_variant_id: fabricVariantId,
        warehouse_id: hanoiWarehouse.id,
        current_stock: currentHanoiStock + hanoiQuantity,
        packages_count: (existingHanoiInventory?.packages_count || 0) + newInbound.packages_count
      });

      // If transferring to Bac Ninh
      if (newInbound.transfer_to_bacninh > 0 && bacninhWarehouse) {
        // Create transfer transaction
        await createTransaction.mutateAsync({
          fabric_variant_id: fabricVariantId,
          warehouse_id: bacninhWarehouse.id,
          transaction_type: 'transfer_in',
          quantity: newInbound.transfer_to_bacninh,
          notes: `Chuyển từ kho Hà Nội`
        });

        // Update Bac Ninh inventory
        const existingBacninhInventory = inventory.find(item => 
          item.fabric_variant_id === fabricVariantId && item.warehouse_id === bacninhWarehouse.id
        );
        const currentBacninhStock = existingBacninhInventory?.current_stock || 0;
        
        await updateInventory.mutateAsync({
          fabric_variant_id: fabricVariantId,
          warehouse_id: bacninhWarehouse.id,
          current_stock: currentBacninhStock + newInbound.transfer_to_bacninh,
          packages_count: existingBacninhInventory?.packages_count || 0
        });
      }

      setNewInbound({
        fabric_type_id: '',
        quantity: 0,
        packages_count: 0,
        supplier_name: '',
        transfer_to_bacninh: 0,
        notes: ''
      });
      setShowInboundDialog(false);
      setShowConfirmDialog(false);
      toast({ title: "Thành công", description: "Đã nhập kho và phân bổ vải thành công" });
    } catch (error) {
      console.error('Error creating inbound:', error);
      toast({ title: "Lỗi", description: "Có lỗi xảy ra khi nhập kho", variant: "destructive" });
    }
  };

  const handleEditClick = (fabric: any) => {
    const fabricType = fabricTypes?.find(ft => ft.name === fabric.fabricName);
    
    setSelectedFabric(fabric);
    setEditForm({
      name: fabricType?.name || '',
      description: fabricType?.description || ''
    });
    setShowEditDialog(true);
  };

  const handleDeleteClick = (fabric: any) => {
    setSelectedFabric(fabric);
    setShowDeleteDialog(true);
  };

  const handleEditSubmit = async () => {
    if (!selectedFabric || !editForm.name) {
      toast({ title: "Lỗi", description: "Vui lòng nhập tên loại vải", variant: "destructive" });
      return;
    }

    try {
      const fabricType = fabricTypes?.find(ft => ft.name === selectedFabric.fabricName);

      if (fabricType) {
        await updateFabricType.mutateAsync({
          id: fabricType.id,
          name: editForm.name,
          description: editForm.description
        });
      }

      setShowEditDialog(false);
      setSelectedFabric(null);
      setEditForm({ name: '', description: '' });
    } catch (error) {
      console.error('Error updating fabric type:', error);
      toast({ title: "Lỗi", description: "Có lỗi xảy ra khi cập nhật", variant: "destructive" });
    }
  };

  const handleDeleteSubmit = async () => {
    if (!selectedFabric) return;

    try {
      const fabricType = fabricTypes?.find(ft => ft.name === selectedFabric.fabricName);

      if (fabricType) {
        await deleteFabricType.mutateAsync(fabricType.id);
      }

      setShowDeleteDialog(false);
      setSelectedFabric(null);
    } catch (error) {
      console.error('Error deleting fabric type:', error);
      toast({ title: "Lỗi", description: "Có lỗi xảy ra khi xóa", variant: "destructive" });
    }
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
                <Select value={newInbound.fabric_type_id} onValueChange={(value) => setNewInbound(prev => ({ ...prev, fabric_type_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn loại vải" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    {fabricTypes && fabricTypes.length > 0 ? (
                      fabricTypes.map((fabricType) => (
                        <SelectItem key={fabricType.id} value={fabricType.id} className="cursor-pointer hover:bg-accent">
                          {fabricType.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-types" disabled>Chưa có loại vải nào</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tổng số lượng nhập (mét)</Label>
                <Input
                  type="text"
                  value={formatInputValue(newInbound.quantity)}
                  onChange={(e) => {
                    const numericValue = parseInputValue(e.target.value);
                    setNewInbound(prev => ({ ...prev, quantity: numericValue }));
                  }}
                  placeholder="Nhập số lượng"
                />
              </div>
              <div className="space-y-2">
                <Label>Số kiện</Label>
                <Input
                  type="text"
                  value={newInbound.packages_count === 0 ? '' : newInbound.packages_count.toLocaleString('vi-VN')}
                  onChange={(e) => {
                    const cleanValue = e.target.value.replace(/\./g, '');
                    const numericValue = parseInt(cleanValue) || 0;
                    setNewInbound(prev => ({ ...prev, packages_count: numericValue }));
                  }}
                  placeholder="Nhập số kiện"
                />
                <p className="text-xs text-muted-foreground">
                  Trung bình: {newInbound.packages_count > 0 ? formatNumber(newInbound.quantity / newInbound.packages_count) : 0} mét/kiện
                </p>
              </div>
              <div className="space-y-2">
                <Label>Chuyển sang Bắc Ninh (mét)</Label>
                <Input
                  type="text"
                  value={formatInputValue(newInbound.transfer_to_bacninh)}
                  onChange={(e) => {
                    const numericValue = parseInputValue(e.target.value);
                    setNewInbound(prev => ({ ...prev, transfer_to_bacninh: numericValue }));
                  }}
                  placeholder="Số lượng chuyển sang Bắc Ninh"
                />
                <p className="text-xs text-muted-foreground">
                  Còn lại tại Hà Nội: {formatNumber(newInbound.quantity - newInbound.transfer_to_bacninh)} mét
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
                        {fabric.fabricName}
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
                        <div className="flex items-center justify-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(fabric)}
                            className="h-8 w-8 p-0"
                            title="Chỉnh sửa"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(fabric)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="Xóa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowInboundDialog(true)}
                            className="h-8 w-8 p-0"
                            title="Nhập kho"
                          >
                            <Package2 className="h-4 w-4" />
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

      {/* Inventory Table and Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Bảng tồn kho chi tiết</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại vải</TableHead>
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
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

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

      {/* Confirmation Dialog for Inbound */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Xác nhận thông tin nhập kho</DialogTitle>
            <DialogDescription>
              Vui lòng kiểm tra lại thông tin trước khi nhập kho
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="font-medium">Loại vải:</span>
                <span>{fabricTypes?.find(ft => ft.id === newInbound.fabric_type_id)?.name}</span>
                
                <span className="font-medium">Tổng số lượng:</span>
                <span>{formatNumber(newInbound.quantity)} mét</span>
                
                <span className="font-medium">Số kiện:</span>
                <span>{formatNumber(newInbound.packages_count)} kiện</span>
                
                <span className="font-medium">Trung bình/kiện:</span>
                <span>{newInbound.packages_count > 0 ? formatNumber(newInbound.quantity / newInbound.packages_count) : 0} mét</span>
                
                <span className="font-medium">Nhà cung cấp:</span>
                <span>{newInbound.supplier_name || "Chưa có"}</span>
                
                <span className="font-medium">Lưu tại Hà Nội:</span>
                <span>{formatNumber(newInbound.quantity - newInbound.transfer_to_bacninh)} mét</span>
                
                {newInbound.transfer_to_bacninh > 0 && (
                  <>
                    <span className="font-medium">Chuyển Bắc Ninh:</span>
                    <span>{formatNumber(newInbound.transfer_to_bacninh)} mét</span>
                  </>
                )}
                
                {newInbound.notes && (
                  <>
                    <span className="font-medium">Ghi chú:</span>
                    <span>{newInbound.notes}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Sửa lại
              </Button>
              <Button onClick={handleConfirmInbound} disabled={createTransaction.isPending}>
                {createTransaction.isPending ? "Đang xử lý..." : "Xác nhận nhập kho"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa loại vải</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin loại vải {selectedFabric?.fabricName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tên loại vải</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nhập tên loại vải"
              />
            </div>
            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Nhập mô tả"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Hủy
              </Button>
              <Button onClick={handleEditSubmit} disabled={updateFabricType.isPending}>
                {updateFabricType.isPending ? "Đang cập nhật..." : "Cập nhật"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa loại vải "{selectedFabric?.fabricName}"? 
              Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Hủy
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteSubmit} 
              disabled={deleteFabricType.isPending}
            >
              {deleteFabricType.isPending ? "Đang xóa..." : "Xóa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};