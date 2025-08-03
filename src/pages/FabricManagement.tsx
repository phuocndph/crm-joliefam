import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Package, Warehouse, ArrowUpDown, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { FabricInventoryOverview } from '@/components/FabricInventoryOverview';
import { 
  useFabricTypes, 
  useFabricVariants,
  useFabricWidths, 
  useWarehouses, 
  useFabricInventory,
  useFabricTransactions,
  useFabricTransfers,
  useCreateFabricType,
  useCreateFabricVariant,
  useCreateFabricWidth,
  useUpdateInventory,
  useCreateTransaction,
  useCreateTransfer,
  useUpdateTransferStatus
} from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';

const FabricManagement = () => {
  const [user, setUser] = useState<any>(null);
  const { role, loading: userLoading } = useUserRole(user);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);
  const { data: fabricTypes } = useFabricTypes();
  const { data: fabricVariants } = useFabricVariants();
  const { data: fabricWidths } = useFabricWidths();
  const { data: warehouses } = useWarehouses();
  const { data: inventory } = useFabricInventory();
  const { data: transactions } = useFabricTransactions();
  const { data: transfers } = useFabricTransfers();

  const createFabricType = useCreateFabricType();
  const createFabricVariant = useCreateFabricVariant();
  const createFabricWidth = useCreateFabricWidth();
  const updateInventory = useUpdateInventory();
  const createTransaction = useCreateTransaction();
  const createTransfer = useCreateTransfer();
  const updateTransferStatus = useUpdateTransferStatus();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [selectedFabricType, setSelectedFabricType] = useState('all');

  // Form states
  const [newFabricType, setNewFabricType] = useState({ name: '', description: '' });
  const [newFabricWidth, setNewFabricWidth] = useState({ width_code: '', description: '' });
  const [newFabricVariant, setNewFabricVariant] = useState({
    fabric_type_id: '',
    variant_name: '',
    fabric_width_id: '',
    weight: '',
    color: '',
    origin: 'TQ',
    unit: 'kg',
    cost_price: 0,
    selling_price: 0
  });
  const [newTransaction, setNewTransaction] = useState({
    fabric_variant_id: '',
    warehouse_id: '',
    transaction_type: 'inbound' as 'inbound' | 'outbound' | 'adjustment',
    quantity: 0,
    unit_price: 0,
    reference_number: '',
    supplier_name: '',
    recipient_name: '',
    notes: ''
  });
  const [newTransfer, setNewTransfer] = useState({
    fabric_variant_id: '',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: 0,
    notes: ''
  });

  const [showCreateTypeDialog, setShowCreateTypeDialog] = useState(false);
  const [showCreateWidthDialog, setShowCreateWidthDialog] = useState(false);
  const [showCreateVariantDialog, setShowCreateVariantDialog] = useState(false);
  const [showCreateTransactionDialog, setShowCreateTransactionDialog] = useState(false);
  const [showCreateTransferDialog, setShowCreateTransferDialog] = useState(false);

  // Filter inventory
  const filteredInventory = useMemo(() => {
    if (!inventory) return [];
    
    return inventory.filter(item => {
      const matchesSearch = searchTerm === '' || 
        item.fabric_variants?.fabric_types?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.fabric_variants?.variant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.fabric_variants?.color?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.fabric_variants?.width_code?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesWarehouse = selectedWarehouse === 'all' || item.warehouse_id === selectedWarehouse;
      const matchesFabricType = selectedFabricType === 'all' || item.fabric_variants?.fabric_type_id === selectedFabricType;
      
      return matchesSearch && matchesWarehouse && matchesFabricType;
    });
  }, [inventory, searchTerm, selectedWarehouse, selectedFabricType]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!inventory) return { totalVariants: 0, totalStock: 0, lowStockItems: 0 };
    
    const totalVariants = inventory.length;
    const totalStock = inventory.reduce((sum, item) => sum + (item.current_stock || 0), 0);
    const lowStockItems = inventory.filter(item => 
      (item.current_stock || 0) <= (item.minimum_stock || 0) && (item.minimum_stock || 0) > 0
    ).length;
    
    return { totalVariants, totalStock, lowStockItems };
  }, [inventory]);

  const handleCreateFabricType = async () => {
    if (!newFabricType.name.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập tên loại vải", variant: "destructive" });
      return;
    }
    
    try {
      await createFabricType.mutateAsync(newFabricType);
      setNewFabricType({ name: '', description: '' });
      setShowCreateTypeDialog(false);
    } catch (error) {
      console.error('Error creating fabric type:', error);
    }
  };

  const handleCreateFabricWidth = async () => {
    if (!newFabricWidth.width_code.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập mã khổ vải", variant: "destructive" });
      return;
    }
    
    try {
      await createFabricWidth.mutateAsync(newFabricWidth);
      setNewFabricWidth({ width_code: '', description: '' });
      setShowCreateWidthDialog(false);
    } catch (error) {
      console.error('Error creating fabric width:', error);
    }
  };

  const handleCreateFabricVariant = async () => {
    if (!newFabricVariant.fabric_type_id || !newFabricVariant.variant_name.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }
    
    try {
      await createFabricVariant.mutateAsync(newFabricVariant);
      setNewFabricVariant({
        fabric_type_id: '',
        variant_name: '',
        fabric_width_id: '',
        weight: '',
        color: '',
        origin: 'TQ',
        unit: 'kg',
        cost_price: 0,
        selling_price: 0
      });
      setShowCreateVariantDialog(false);
    } catch (error) {
      console.error('Error creating fabric variant:', error);
    }
  };

  const handleCreateTransaction = async () => {
    if (!newTransaction.fabric_variant_id || !newTransaction.warehouse_id || newTransaction.quantity <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }
    
    try {
      await createTransaction.mutateAsync(newTransaction);
      setNewTransaction({
        fabric_variant_id: '',
        warehouse_id: '',
        transaction_type: 'inbound',
        quantity: 0,
        unit_price: 0,
        reference_number: '',
        supplier_name: '',
        recipient_name: '',
        notes: ''
      });
      setShowCreateTransactionDialog(false);
    } catch (error) {
      console.error('Error creating transaction:', error);
    }
  };

  const handleCreateTransfer = async () => {
    if (!newTransfer.fabric_variant_id || !newTransfer.from_warehouse_id || !newTransfer.to_warehouse_id || newTransfer.quantity <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin", variant: "destructive" });
      return;
    }
    
    if (newTransfer.from_warehouse_id === newTransfer.to_warehouse_id) {
      toast({ title: "Lỗi", description: "Kho nguồn và kho đích không được giống nhau", variant: "destructive" });
      return;
    }
    
    try {
      await createTransfer.mutateAsync(newTransfer);
      setNewTransfer({
        fabric_variant_id: '',
        from_warehouse_id: '',
        to_warehouse_id: '',
        quantity: 0,
        notes: ''
      });
      setShowCreateTransferDialog(false);
    } catch (error) {
      console.error('Error creating transfer:', error);
    }
  };

  const getTransactionTypeLabel = (type: string) => {
    const labels = {
      inbound: 'Nhập kho',
      outbound: 'Xuất kho',
      transfer_in: 'Chuyển đến',
      transfer_out: 'Chuyển đi',
      adjustment: 'Điều chỉnh'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getTransactionTypeColor = (type: string) => {
    const colors = {
      inbound: 'bg-green-500',
      outbound: 'bg-red-500',
      transfer_in: 'bg-blue-500',
      transfer_out: 'bg-orange-500',
      adjustment: 'bg-gray-500'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500';
  };

  const getTransferStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-500',
      in_transit: 'bg-blue-500',
      completed: 'bg-green-500',
      cancelled: 'bg-red-500'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-500';
  };

  const getTransferStatusLabel = (status: string) => {
    const labels = {
      pending: 'Chờ duyệt',
      in_transit: 'Đang chuyển',
      completed: 'Hoàn thành',
      cancelled: 'Đã hủy'
    };
    return labels[status as keyof typeof labels] || status;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND' 
    }).format(amount);
  };

  const formatQuantity = (quantity: number, unit: string = 'kg') => {
    return `${quantity.toLocaleString('vi-VN')} ${unit}`;
  };

  if (userLoading) {
    return <div className="flex items-center justify-center h-64">Đang tải...</div>;
  }

  if (!user || !role || !['admin', 'manager', 'employee'].includes(role)) {
    return <div className="text-center text-muted-foreground">Bạn không có quyền truy cập trang này.</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý vải</h1>
          <p className="text-muted-foreground">Quản lý kho vải cho xưởng sản xuất chăn ga gối</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng biến thể vải</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.totalVariants}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng tồn kho</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatQuantity(summaryStats.totalStock)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sắp hết hàng</CardTitle>
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summaryStats.lowStockItems}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="total-quantity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="total-quantity">Tổng số lượng vải</TabsTrigger>
          <TabsTrigger value="hanoi-control">Kiểm soát vải Hà Nội</TabsTrigger>
          <TabsTrigger value="bacninh-control">Kiểm soát vải Bắc Ninh</TabsTrigger>
          <TabsTrigger value="fabric-types">Loại vải</TabsTrigger>
          <TabsTrigger value="fabric-widths">Khổ vải</TabsTrigger>
        </TabsList>

        {/* Total Quantity Tab */}
        <TabsContent value="total-quantity" className="space-y-4">
          <FabricInventoryOverview />
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Giao dịch vải</CardTitle>
                  <CardDescription>Quản lý các giao dịch nhập/xuất vải</CardDescription>
                </div>
                <Dialog open={showCreateTransactionDialog} onOpenChange={setShowCreateTransactionDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Giao dịch mới
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tạo giao dịch vải</DialogTitle>
                      <DialogDescription>Thêm giao dịch nhập hoặc xuất vải</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Loại giao dịch</Label>
                        <Select value={newTransaction.transaction_type} onValueChange={(value: any) => setNewTransaction(prev => ({ ...prev, transaction_type: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inbound">Nhập kho</SelectItem>
                            <SelectItem value="outbound">Xuất kho</SelectItem>
                            <SelectItem value="adjustment">Điều chỉnh</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Biến thể vải</Label>
                        <Select value={newTransaction.fabric_variant_id} onValueChange={(value) => setNewTransaction(prev => ({ ...prev, fabric_variant_id: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn biến thể vải" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricVariants?.map((variant) => (
                              <SelectItem key={variant.id} value={variant.id}>
                                {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Kho</Label>
                        <Select value={newTransaction.warehouse_id} onValueChange={(value) => setNewTransaction(prev => ({ ...prev, warehouse_id: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn kho" />
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
                        <Label>Số lượng</Label>
                        <Input
                          type="number"
                          value={newTransaction.quantity}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                          placeholder="Nhập số lượng"
                        />
                      </div>
                      {newTransaction.transaction_type === 'inbound' && (
                        <div className="space-y-2">
                          <Label>Nhà cung cấp</Label>
                          <Input
                            value={newTransaction.supplier_name}
                            onChange={(e) => setNewTransaction(prev => ({ ...prev, supplier_name: e.target.value }))}
                            placeholder="Nhập tên nhà cung cấp"
                          />
                        </div>
                      )}
                      {newTransaction.transaction_type === 'outbound' && (
                        <div className="space-y-2">
                          <Label>Người nhận</Label>
                          <Input
                            value={newTransaction.recipient_name}
                            onChange={(e) => setNewTransaction(prev => ({ ...prev, recipient_name: e.target.value }))}
                            placeholder="Nhập tên người nhận"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <Textarea
                          value={newTransaction.notes}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Nhập ghi chú"
                        />
                      </div>
                      <Button onClick={handleCreateTransaction} className="w-full" disabled={createTransaction.isPending}>
                        {createTransaction.isPending ? "Đang tạo..." : "Tạo giao dịch"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search and Filter */}
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm vải..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedFabricType} onValueChange={setSelectedFabricType}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả loại vải</SelectItem>
                    {fabricTypes?.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Inventory Summary Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại vải</TableHead>
                      <TableHead>Biến thể</TableHead>
                      <TableHead>Màu sắc</TableHead>
                      <TableHead>Khổ rộng</TableHead>
                      <TableHead>Tổng tồn kho</TableHead>
                      <TableHead>Hà Nội</TableHead>
                      <TableHead>Bắc Ninh</TableHead>
                      <TableHead>Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricVariants?.map((variant) => {
                      const inventoryByWarehouse = inventory?.filter(inv => inv.fabric_variant_id === variant.id) || [];
                      const totalStock = inventoryByWarehouse.reduce((sum, inv) => sum + (inv.current_stock || 0), 0);
                      const hanoiStock = inventoryByWarehouse.find(inv => inv.warehouses?.name === "Kho Hà Nội")?.current_stock || 0;
                      const bacninhStock = inventoryByWarehouse.find(inv => inv.warehouses?.name === "Kho Bắc Ninh")?.current_stock || 0;
                      
                      return (
                        <TableRow key={variant.id}>
                          <TableCell className="font-medium">{variant.fabric_types?.name}</TableCell>
                          <TableCell>{variant.variant_name}</TableCell>
                          <TableCell>{variant.color || '-'}</TableCell>
                          <TableCell>{variant.width_code || '-'}</TableCell>
                          <TableCell className="font-semibold">{formatQuantity(totalStock, variant.unit)}</TableCell>
                          <TableCell>{formatQuantity(hanoiStock, variant.unit)}</TableCell>
                          <TableCell>{formatQuantity(bacninhStock, variant.unit)}</TableCell>
                          <TableCell>
                            {totalStock > 0 ? (
                              <Badge variant="default">Còn hàng</Badge>
                            ) : (
                              <Badge variant="secondary">Hết hàng</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hanoi Control Tab */}
        <TabsContent value="hanoi-control" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Kiểm soát vải Hà Nội</CardTitle>
                  <CardDescription>Quản lý tồn kho và xuất vải tại kho Hà Nội</CardDescription>
                </div>
                <Dialog open={showCreateTransactionDialog} onOpenChange={setShowCreateTransactionDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Xuất vải
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Xuất vải - Kho Hà Nội</DialogTitle>
                      <DialogDescription>Ghi nhận việc xuất vải cho đơn hàng</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Biến thể vải</Label>
                        <Select value={newTransaction.fabric_variant_id} onValueChange={(value) => setNewTransaction(prev => ({ ...prev, fabric_variant_id: value, warehouse_id: warehouses?.find(w => w.name === "Kho Hà Nội")?.id || '' }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn biến thể vải" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricVariants?.map((variant) => (
                              <SelectItem key={variant.id} value={variant.id}>
                                {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Số lượng xuất</Label>
                        <Input
                          type="number"
                          value={newTransaction.quantity}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, quantity: Number(e.target.value), transaction_type: 'outbound' }))}
                          placeholder="Nhập số lượng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Số đơn hàng</Label>
                        <Input
                          value={newTransaction.reference_number}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, reference_number: e.target.value }))}
                          placeholder="Nhập số đơn hàng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Người phụ trách xuất</Label>
                        <Input
                          value={newTransaction.supplier_name}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, supplier_name: e.target.value }))}
                          placeholder="Nhập tên người phụ trách"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Người nhận</Label>
                        <Input
                          value={newTransaction.recipient_name}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, recipient_name: e.target.value }))}
                          placeholder="Nhập tên người nhận"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <Textarea
                          value={newTransaction.notes}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Nhập ghi chú"
                        />
                      </div>
                      <Button onClick={handleCreateTransaction} className="w-full" disabled={createTransaction.isPending}>
                        {createTransaction.isPending ? "Đang xuất..." : "Xuất vải"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm vải..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Hanoi Inventory */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại vải</TableHead>
                      <TableHead>Biến thể</TableHead>
                      <TableHead>Màu sắc</TableHead>
                      <TableHead>Khổ rộng</TableHead>
                      <TableHead>Tồn kho hiện tại</TableHead>
                      <TableHead>Giao dịch gần nhất</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory?.filter(item => item.warehouses?.name === "Kho Hà Nội").map((item) => {
                      const lastTransaction = transactions?.find(tx => 
                        tx.fabric_variant_id === item.fabric_variant_id && 
                        tx.warehouse_id === item.warehouse_id
                      );
                      
                      return (
                        <TableRow key={`${item.fabric_variant_id}-${item.warehouse_id}`}>
                          <TableCell className="font-medium">{item.fabric_variants?.fabric_types?.name}</TableCell>
                          <TableCell>{item.fabric_variants?.variant_name}</TableCell>
                          <TableCell>{item.fabric_variants?.color || '-'}</TableCell>
                          <TableCell>{item.fabric_variants?.width_code || '-'}</TableCell>
                          <TableCell className="font-semibold">{formatQuantity(item.current_stock || 0, item.fabric_variants?.unit)}</TableCell>
                          <TableCell>
                            {lastTransaction ? (
                              <div className="text-sm">
                                <div>{getTransactionTypeLabel(lastTransaction.transaction_type)}</div>
                                <div className="text-muted-foreground">
                                  {new Date(lastTransaction.transaction_date).toLocaleDateString('vi-VN')}
                                </div>
                              </div>
                            ) : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bac Ninh Control Tab */}
        <TabsContent value="bacninh-control" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Kiểm soát vải Bắc Ninh</CardTitle>
                  <CardDescription>Quản lý tồn kho và xuất vải tại kho Bắc Ninh</CardDescription>
                </div>
                <Dialog open={showCreateTransactionDialog} onOpenChange={setShowCreateTransactionDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Xuất vải
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Xuất vải - Kho Bắc Ninh</DialogTitle>
                      <DialogDescription>Ghi nhận việc xuất vải cho đơn hàng</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Biến thể vải</Label>
                        <Select value={newTransaction.fabric_variant_id} onValueChange={(value) => setNewTransaction(prev => ({ ...prev, fabric_variant_id: value, warehouse_id: warehouses?.find(w => w.name === "Kho Bắc Ninh")?.id || '' }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn biến thể vải" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricVariants?.map((variant) => (
                              <SelectItem key={variant.id} value={variant.id}>
                                {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Số lượng xuất</Label>
                        <Input
                          type="number"
                          value={newTransaction.quantity}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, quantity: Number(e.target.value), transaction_type: 'outbound' }))}
                          placeholder="Nhập số lượng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Số đơn hàng</Label>
                        <Input
                          value={newTransaction.reference_number}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, reference_number: e.target.value }))}
                          placeholder="Nhập số đơn hàng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Người phụ trách xuất</Label>
                        <Input
                          value={newTransaction.supplier_name}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, supplier_name: e.target.value }))}
                          placeholder="Nhập tên người phụ trách"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Người nhận</Label>
                        <Input
                          value={newTransaction.recipient_name}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, recipient_name: e.target.value }))}
                          placeholder="Nhập tên người nhận"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <Textarea
                          value={newTransaction.notes}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Nhập ghi chú"
                        />
                      </div>
                      <Button onClick={handleCreateTransaction} className="w-full" disabled={createTransaction.isPending}>
                        {createTransaction.isPending ? "Đang xuất..." : "Xuất vải"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm vải..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Bac Ninh Inventory */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại vải</TableHead>
                      <TableHead>Biến thể</TableHead>
                      <TableHead>Màu sắc</TableHead>
                      <TableHead>Khổ rộng</TableHead>
                      <TableHead>Tồn kho hiện tại</TableHead>
                      <TableHead>Giao dịch gần nhất</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory?.filter(item => item.warehouses?.name === "Kho Bắc Ninh").map((item) => {
                      const lastTransaction = transactions?.find(tx => 
                        tx.fabric_variant_id === item.fabric_variant_id && 
                        tx.warehouse_id === item.warehouse_id
                      );
                      
                      return (
                        <TableRow key={`${item.fabric_variant_id}-${item.warehouse_id}`}>
                          <TableCell className="font-medium">{item.fabric_variants?.fabric_types?.name}</TableCell>
                          <TableCell>{item.fabric_variants?.variant_name}</TableCell>
                          <TableCell>{item.fabric_variants?.color || '-'}</TableCell>
                          <TableCell>{item.fabric_variants?.width_code || '-'}</TableCell>
                          <TableCell className="font-semibold">{formatQuantity(item.current_stock || 0, item.fabric_variants?.unit)}</TableCell>
                          <TableCell>
                            {lastTransaction ? (
                              <div className="text-sm">
                                <div>{getTransactionTypeLabel(lastTransaction.transaction_type)}</div>
                                <div className="text-muted-foreground">
                                  {new Date(lastTransaction.transaction_date).toLocaleDateString('vi-VN')}
                                </div>
                              </div>
                            ) : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fabric Types Tab */}
        <TabsContent value="fabric-types" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Loại vải</CardTitle>
                  <CardDescription>Quản lý các loại vải</CardDescription>
                </div>
                <Dialog open={showCreateTypeDialog} onOpenChange={setShowCreateTypeDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Thêm loại vải
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Thêm loại vải mới</DialogTitle>
                      <DialogDescription>Tạo loại vải mới cho hệ thống</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tên loại vải</Label>
                        <Input
                          value={newFabricType.name}
                          onChange={(e) => setNewFabricType(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Ví dụ: T250 trơn, T300 sọc..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mô tả</Label>
                        <Textarea
                          value={newFabricType.description}
                          onChange={(e) => setNewFabricType(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Mô tả về loại vải này"
                        />
                      </div>
                      <Button onClick={handleCreateFabricType} className="w-full" disabled={createFabricType.isPending}>
                        {createFabricType.isPending ? "Đang thêm..." : "Thêm loại vải"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên loại vải</TableHead>
                      <TableHead>Mô tả</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricTypes?.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.name}</TableCell>
                        <TableCell>{type.description || '-'}</TableCell>
                        <TableCell>{new Date(type.created_at).toLocaleDateString('vi-VN')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fabric Widths Tab */}
        <TabsContent value="fabric-widths" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Khổ vải</CardTitle>
                  <CardDescription>Quản lý các khổ vải</CardDescription>
                </div>
                <Dialog open={showCreateWidthDialog} onOpenChange={setShowCreateWidthDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Thêm khổ vải
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Thêm khổ vải mới</DialogTitle>
                      <DialogDescription>Tạo khổ vải mới cho hệ thống</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Mã khổ vải</Label>
                        <Input
                          value={newFabricWidth.width_code}
                          onChange={(e) => setNewFabricWidth(prev => ({ ...prev, width_code: e.target.value }))}
                          placeholder="Ví dụ: K240, K260, K280..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mô tả</Label>
                        <Textarea
                          value={newFabricWidth.description}
                          onChange={(e) => setNewFabricWidth(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Mô tả về khổ vải này"
                        />
                      </div>
                      <Button onClick={handleCreateFabricWidth} className="w-full" disabled={createFabricWidth.isPending}>
                        {createFabricWidth.isPending ? "Đang thêm..." : "Thêm khổ vải"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã khổ vải</TableHead>
                      <TableHead>Mô tả</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricWidths?.map((width) => (
                      <TableRow key={width.id}>
                        <TableCell className="font-medium">{width.width_code}</TableCell>
                        <TableCell>{width.description || '-'}</TableCell>
                        <TableCell>{new Date(width.created_at).toLocaleDateString('vi-VN')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FabricManagement;
