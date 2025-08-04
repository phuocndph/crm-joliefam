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
import { FabricControlByWarehouse } from '@/components/FabricControlByWarehouse';
import { FabricUsageRecording } from '@/components/FabricUsageRecording';
import { FabricUsageDetails } from '@/components/FabricUsageDetails';
import { FabricTypeManagement } from '@/components/FabricTypeManagement';
import { FabricVariantManagement } from '@/components/FabricVariantManagement';
import { 
  useFabricTypes, 
  useFabricVariants,
  useFabricWidths, 
  useWarehouses, 
  useFabricInventory,
  useFabricTransactions,
  useFabricTransfers,
  useFabricUsage,
  useCreateFabricType,
  useCreateFabricVariant,
  useCreateFabricWidth,
  useUpdateInventory,
  useCreateTransaction,
  useCreateTransfer,
  useUpdateTransferStatus,
  useCreateFabricUsage
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
          <TabsTrigger value="bacninh-control">Kiểm soát vải Bắc Ninh</TabsTrigger>
          <TabsTrigger value="fabric-types">Loại vải</TabsTrigger>
        </TabsList>

        {/* Total Quantity Tab */}
        <TabsContent value="total-quantity" className="space-y-4">
          <FabricInventoryOverview />
        </TabsContent>

        {/* Bac Ninh Control Tab */}
        <TabsContent value="bacninh-control" className="space-y-4">
          <FabricControlByWarehouse 
            warehouseName="Bắc Ninh" 
            warehouseFilter="bacninh"
          />
          <FabricUsageRecording warehouseName="Bắc Ninh" warehouseFilter="bacninh" />
          <FabricUsageDetails warehouseName="Bắc Ninh" warehouseFilter="bacninh" />
        </TabsContent>

        {/* Fabric Types Tab */}
        <TabsContent value="fabric-types" className="space-y-4">
          <FabricTypeManagement />
          <FabricVariantManagement />
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default FabricManagement;
