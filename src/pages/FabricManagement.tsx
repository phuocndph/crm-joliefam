import React, { useState, useMemo } from 'react';
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
import { useUserRole } from '@/hooks/useUserRole';
import { 
  useFabricTypes, 
  useFabricVariants, 
  useWarehouses, 
  useFabricInventory,
  useFabricTransactions,
  useFabricTransfers,
  useCreateFabricType,
  useCreateFabricVariant,
  useUpdateInventory,
  useCreateTransaction,
  useCreateTransfer,
  useUpdateTransferStatus
} from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';

const FabricManagement = () => {
  const { role, loading: userLoading } = useUserRole();
  const { data: fabricTypes } = useFabricTypes();
  const { data: fabricVariants } = useFabricVariants();
  const { data: warehouses } = useWarehouses();
  const { data: inventory } = useFabricInventory();
  const { data: transactions } = useFabricTransactions();
  const { data: transfers } = useFabricTransfers();

  const createFabricType = useCreateFabricType();
  const createFabricVariant = useCreateFabricVariant();
  const updateInventory = useUpdateInventory();
  const createTransaction = useCreateTransaction();
  const createTransfer = useCreateTransfer();
  const updateTransferStatus = useUpdateTransferStatus();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [selectedFabricType, setSelectedFabricType] = useState('all');

  // Form states
  const [newFabricType, setNewFabricType] = useState({ name: '', description: '' });
  const [newFabricVariant, setNewFabricVariant] = useState({
    fabric_type_id: '',
    variant_name: '',
    width_code: '',
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
    transaction_type: 'inbound' as const,
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
        width_code: '',
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

  if (!user || !['admin', 'manager', 'employee'].includes(user.role)) {
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

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">Tồn kho</TabsTrigger>
          <TabsTrigger value="transactions">Giao dịch</TabsTrigger>
          <TabsTrigger value="transfers">Chuyển kho</TabsTrigger>
          <TabsTrigger value="variants">Biến thể vải</TabsTrigger>
          <TabsTrigger value="types">Loại vải</TabsTrigger>
        </TabsList>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Tồn kho vải</CardTitle>
                  <CardDescription>Quản lý tồn kho vải tại các kho</CardDescription>
                </div>
                <Dialog open={showCreateTransactionDialog} onOpenChange={setShowCreateTransactionDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Nhập/Xuất kho
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tạo giao dịch nhập/xuất kho</DialogTitle>
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
                                {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`} {variant.width_code}
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
                      <div className="space-y-2">
                        <Label>Đơn giá</Label>
                        <CurrencyInput
                          value={newTransaction.unit_price}
                          onChange={(value) => setNewTransaction(prev => ({ ...prev, unit_price: value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Số chứng từ</Label>
                        <Input
                          value={newTransaction.reference_number}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, reference_number: e.target.value }))}
                          placeholder="Nhập số chứng từ"
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
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả kho</SelectItem>
                    {warehouses?.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              {/* Inventory Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại vải</TableHead>
                      <TableHead>Biến thể</TableHead>
                      <TableHead>Màu sắc</TableHead>
                      <TableHead>Khổ rộng</TableHead>
                      <TableHead>Kho</TableHead>
                      <TableHead>Tồn kho</TableHead>
                      <TableHead>Tồn tối thiểu</TableHead>
                      <TableHead>Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory?.map((item) => (
                      <TableRow key={`${item.fabric_variant_id}-${item.warehouse_id}`}>
                        <TableCell className="font-medium">
                          {item.fabric_variants?.fabric_types?.name}
                        </TableCell>
                        <TableCell>{item.fabric_variants?.variant_name}</TableCell>
                        <TableCell>{item.fabric_variants?.color || '-'}</TableCell>
                        <TableCell>{item.fabric_variants?.width_code || '-'}</TableCell>
                        <TableCell>{item.warehouses?.name}</TableCell>
                        <TableCell>{formatQuantity(item.current_stock || 0, item.fabric_variants?.unit)}</TableCell>
                        <TableCell>{formatQuantity(item.minimum_stock || 0, item.fabric_variants?.unit)}</TableCell>
                        <TableCell>
                          {(item.current_stock || 0) <= (item.minimum_stock || 0) && (item.minimum_stock || 0) > 0 ? (
                            <Badge variant="destructive">Sắp hết</Badge>
                          ) : (item.current_stock || 0) > 0 ? (
                            <Badge variant="default">Còn hàng</Badge>
                          ) : (
                            <Badge variant="secondary">Hết hàng</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Giao dịch vải</CardTitle>
                  <CardDescription>Danh sách các giao dịch nhập, xuất, điều chỉnh</CardDescription>
                </div>
                <Dialog open={showCreateTransactionDialog} onOpenChange={setShowCreateTransactionDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Tạo giao dịch
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tạo giao dịch nhập/xuất kho</DialogTitle>
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
                                {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`} {variant.width_code}
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
                      <div className="space-y-2">
                        <Label>Đơn giá</Label>
                        <CurrencyInput
                          value={newTransaction.unit_price}
                          onChange={(value) => setNewTransaction(prev => ({ ...prev, unit_price: value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Số chứng từ</Label>
                        <Input
                          value={newTransaction.reference_number}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, reference_number: e.target.value }))}
                          placeholder="Nhập số chứng từ"
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
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày giao dịch</TableHead>
                      <TableHead>Loại giao dịch</TableHead>
                      <TableHead>Biến thể vải</TableHead>
                      <TableHead>Kho</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Đơn giá</TableHead>
                      <TableHead>Tổng tiền</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions?.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{new Date(tx.transaction_date).toLocaleDateString('vi-VN')}</TableCell>
                        <TableCell>
                          <Badge className={`text-white ${getTransactionTypeColor(tx.transaction_type)}`}>
                            {getTransactionTypeLabel(tx.transaction_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tx.fabric_variants?.fabric_types?.name} - {tx.fabric_variants?.variant_name}
                        </TableCell>
                        <TableCell>{tx.warehouses?.name}</TableCell>
                        <TableCell>{formatQuantity(tx.quantity, tx.fabric_variants?.unit)}</TableCell>
                        <TableCell>{formatCurrency(tx.unit_price || 0)}</TableCell>
                        <TableCell>{formatCurrency(tx.total_amount || 0)}</TableCell>
                        <TableCell>{tx.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transfers Tab */}
        <TabsContent value="transfers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Chuyển kho</CardTitle>
                  <CardDescription>Quản lý các yêu cầu chuyển kho vải</CardDescription>
                </div>
                <Dialog open={showCreateTransferDialog} onOpenChange={setShowCreateTransferDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Tạo yêu cầu chuyển kho
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tạo yêu cầu chuyển kho</DialogTitle>
                      <DialogDescription>Thêm yêu cầu chuyển kho vải giữa các kho</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Biến thể vải</Label>
                        <Select value={newTransfer.fabric_variant_id} onValueChange={(value) => setNewTransfer(prev => ({ ...prev, fabric_variant_id: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn biến thể vải" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricVariants?.map((variant) => (
                              <SelectItem key={variant.id} value={variant.id}>
                                {variant.fabric_types?.name} - {variant.variant_name} {variant.color && `(${variant.color})`} {variant.width_code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Kho nguồn</Label>
                        <Select value={newTransfer.from_warehouse_id} onValueChange={(value) => setNewTransfer(prev => ({ ...prev, from_warehouse_id: value }))}>
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
                        <Label>Kho đích</Label>
                        <Select value={newTransfer.to_warehouse_id} onValueChange={(value) => setNewTransfer(prev => ({ ...prev, to_warehouse_id: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn kho đích" />
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
                          value={newTransfer.quantity}
                          onChange={(e) => setNewTransfer(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                          placeholder="Nhập số lượng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <Textarea
                          value={newTransfer.notes}
                          onChange={(e) => setNewTransfer(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Nhập ghi chú"
                        />
                      </div>
                      <Button onClick={handleCreateTransfer} className="w-full" disabled={createTransfer.isPending}>
                        {createTransfer.isPending ? "Đang tạo..." : "Tạo yêu cầu"}
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
                      <TableHead>Ngày chuyển</TableHead>
                      <TableHead>Biến thể vải</TableHead>
                      <TableHead>Kho nguồn</TableHead>
                      <TableHead>Kho đích</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers?.map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell>{new Date(transfer.transfer_date).toLocaleDateString('vi-VN')}</TableCell>
                        <TableCell>
                          {transfer.fabric_variants?.fabric_types?.name} - {transfer.fabric_variants?.variant_name}
                        </TableCell>
                        <TableCell>{transfer.from_warehouse?.name}</TableCell>
                        <TableCell>{transfer.to_warehouse?.name}</TableCell>
                        <TableCell>{formatQuantity(transfer.quantity, transfer.fabric_variants?.unit)}</TableCell>
                        <TableCell>
                          <Badge className={`text-white ${getTransferStatusColor(transfer.status)}`}>
                            {getTransferStatusLabel(transfer.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{transfer.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variants Tab */}
        <TabsContent value="variants" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Biến thể vải</CardTitle>
                  <CardDescription>Danh sách các biến thể vải</CardDescription>
                </div>
                <Dialog open={showCreateVariantDialog} onOpenChange={setShowCreateVariantDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Tạo biến thể mới
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tạo biến thể vải mới</DialogTitle>
                      <DialogDescription>Thêm biến thể vải mới</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Loại vải</Label>
                        <Select value={newFabricVariant.fabric_type_id} onValueChange={(value) => setNewFabricVariant(prev => ({ ...prev, fabric_type_id: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn loại vải" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricTypes?.map((type) => (
                              <SelectItem key={type.id} value={type.id}>
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Tên biến thể</Label>
                        <Input
                          value={newFabricVariant.variant_name}
                          onChange={(e) => setNewFabricVariant(prev => ({ ...prev, variant_name: e.target.value }))}
                          placeholder="Nhập tên biến thể"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Khổ rộng</Label>
                        <Input
                          value={newFabricVariant.width_code}
                          onChange={(e) => setNewFabricVariant(prev => ({ ...prev, width_code: e.target.value }))}
                          placeholder="Nhập khổ rộng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Trọng lượng</Label>
                        <Input
                          value={newFabricVariant.weight}
                          onChange={(e) => setNewFabricVariant(prev => ({ ...prev, weight: e.target.value }))}
                          placeholder="Nhập trọng lượng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Màu sắc</Label>
                        <Input
                          value={newFabricVariant.color}
                          onChange={(e) => setNewFabricVariant(prev => ({ ...prev, color: e.target.value }))}
                          placeholder="Nhập màu sắc"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Xuất xứ</Label>
                        <Input
                          value={newFabricVariant.origin}
                          onChange={(e) => setNewFabricVariant(prev => ({ ...prev, origin: e.target.value }))}
                          placeholder="Nhập xuất xứ"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Đơn vị</Label>
                        <Input
                          value={newFabricVariant.unit}
                          onChange={(e) => setNewFabricVariant(prev => ({ ...prev, unit: e.target.value }))}
                          placeholder="Nhập đơn vị"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Giá vốn</Label>
                        <CurrencyInput
                          value={newFabricVariant.cost_price}
                          onChange={(value) => setNewFabricVariant(prev => ({ ...prev, cost_price: value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Giá bán</Label>
                        <CurrencyInput
                          value={newFabricVariant.selling_price}
                          onChange={(value) => setNewFabricVariant(prev => ({ ...prev, selling_price: value }))}
                        />
                      </div>
                      <Button onClick={handleCreateFabricVariant} className="w-full" disabled={createFabricVariant.isPending}>
                        {createFabricVariant.isPending ? "Đang tạo..." : "Tạo biến thể"}
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
                      <TableHead>Loại vải</TableHead>
                      <TableHead>Tên biến thể</TableHead>
                      <TableHead>Khổ rộng</TableHead>
                      <TableHead>Trọng lượng</TableHead>
                      <TableHead>Màu sắc</TableHead>
                      <TableHead>Xuất xứ</TableHead>
                      <TableHead>Đơn vị</TableHead>
                      <TableHead>Giá vốn</TableHead>
                      <TableHead>Giá bán</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricVariants?.map((variant) => (
                      <TableRow key={variant.id}>
                        <TableCell>{variant.fabric_types?.name}</TableCell>
                        <TableCell>{variant.variant_name}</TableCell>
                        <TableCell>{variant.width_code || '-'}</TableCell>
                        <TableCell>{variant.weight || '-'}</TableCell>
                        <TableCell>{variant.color || '-'}</TableCell>
                        <TableCell>{variant.origin || '-'}</TableCell>
                        <TableCell>{variant.unit || '-'}</TableCell>
                        <TableCell>{formatCurrency(variant.cost_price || 0)}</TableCell>
                        <TableCell>{formatCurrency(variant.selling_price || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Types Tab */}
        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Loại vải</CardTitle>
                  <CardDescription>Danh sách các loại vải</CardDescription>
                </div>
                <Dialog open={showCreateTypeDialog} onOpenChange={setShowCreateTypeDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Tạo loại vải mới
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tạo loại vải mới</DialogTitle>
                      <DialogDescription>Thêm loại vải mới</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tên loại vải</Label>
                        <Input
                          value={newFabricType.name}
                          onChange={(e) => setNewFabricType(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Nhập tên loại vải"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mô tả</Label>
                        <Textarea
                          value={newFabricType.description}
                          onChange={(e) => setNewFabricType(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Nhập mô tả"
                        />
                      </div>
                      <Button onClick={handleCreateFabricType} className="w-full" disabled={createFabricType.isPending}>
                        {createFabricType.isPending ? "Đang tạo..." : "Tạo loại vải"}
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricTypes?.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell>{type.name}</TableCell>
                        <TableCell>{type.description || '-'}</TableCell>
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
