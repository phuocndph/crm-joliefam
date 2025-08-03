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
import { Plus, Filter, Search, Package, TrendingUp } from 'lucide-react';
import { useFabricUsage, useFabricVariants, useWarehouses, useCreateFabricUsage } from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';

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
  const createFabricUsage = useCreateFabricUsage();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedManager, setSelectedManager] = useState('all');
  const [selectedFabricType, setSelectedFabricType] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [newUsage, setNewUsage] = useState({
    order_number: '',
    fabric_variant_id: '',
    warehouse_id: '',
    quantity_used: 0,
    customer_name: '',
    customer_code: '',
    notes: ''
  });

  // Filter data by warehouse if specified
  const filteredUsage = useMemo(() => {
    let filtered = fabricUsage;

    // Filter by warehouse
    if (warehouseFilter) {
      filtered = filtered.filter(item => 
        item.warehouses?.warehouse_type === warehouseFilter ||
        item.warehouses?.name.toLowerCase().includes(warehouseFilter.toLowerCase())
      );
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.fabric_variants?.variant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.fabric_variants?.fabric_types?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by fabric type
    if (selectedFabricType !== 'all') {
      filtered = filtered.filter(item => 
        item.fabric_variants?.fabric_type_id === selectedFabricType
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

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalOrders = new Set(filteredUsage.map(item => item.order_number)).size;
    const totalFabricUsed = filteredUsage.reduce((sum, item) => sum + (item.quantity_used || 0), 0);
    const totalCustomers = new Set(filteredUsage.map(item => item.customer_name)).size;
    
    // Group by fabric type
    const fabricTypeUsage = filteredUsage.reduce((acc, item) => {
      const fabricType = item.fabric_variants?.fabric_types?.name || 'Không xác định';
      const variant = item.fabric_variants?.variant_name || '';
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
      await createFabricUsage.mutateAsync(newUsage);
      setNewUsage({
        order_number: '',
        fabric_variant_id: '',
        warehouse_id: '',
        quantity_used: 0,
        customer_name: '',
        customer_code: '',
        notes: ''
      });
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Error creating fabric usage:', error);
    }
  };

  const formatQuantity = (quantity: number) => {
    return `${quantity.toLocaleString('vi-VN')} kg`;
  };

  const getUniqueManagers = () => {
    const managers = new Set(filteredUsage.map(item => item.manager_id).filter(Boolean));
    return Array.from(managers);
  };

  const getUniqueFabricTypes = () => {
    const types = new Set(fabricVariants.map(v => v.fabric_type_id));
    return fabricVariants.filter(v => types.has(v.fabric_type_id));
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
                <Label>Mã đơn hàng</Label>
                <Input
                  value={newUsage.order_number}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, order_number: e.target.value }))}
                  placeholder="Nhập mã đơn hàng"
                />
              </div>
              <div className="space-y-2">
                <Label>Tên khách hàng</Label>
                <Input
                  value={newUsage.customer_name}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Nhập tên khách hàng"
                />
              </div>
              <div className="space-y-2">
                <Label>Mã khách hàng</Label>
                <Input
                  value={newUsage.customer_code}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, customer_code: e.target.value }))}
                  placeholder="Nhập mã khách hàng"
                />
              </div>
              <div className="space-y-2">
                <Label>Loại vải</Label>
                <Select value={newUsage.fabric_variant_id} onValueChange={(value) => setNewUsage(prev => ({ ...prev, fabric_variant_id: value }))}>
                  <SelectTrigger>
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
                <Label>Kho</Label>
                <Select value={newUsage.warehouse_id} onValueChange={(value) => setNewUsage(prev => ({ ...prev, warehouse_id: value }))}>
                  <SelectTrigger>
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
                <Label>Số lượng sử dụng (kg)</Label>
                <Input
                  type="number"
                  value={newUsage.quantity_used}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, quantity_used: Number(e.target.value) }))}
                  placeholder="Nhập số lượng"
                />
              </div>
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Input
                  value={newUsage.notes}
                  onChange={(e) => setNewUsage(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ghi chú thêm"
                />
              </div>
              <Button onClick={handleCreateUsage} className="w-full" disabled={createFabricUsage.isPending}>
                {createFabricUsage.isPending ? 'Đang xử lý...' : 'Tạo ghi nhận'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Package className="mr-2 h-4 w-4" />
              Tổng đơn hàng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="mr-2 h-4 w-4" />
              Tổng vải sử dụng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatQuantity(summary.totalFabricUsed)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tổng khách hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalCustomers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Loại vải đã dùng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(summary.fabricTypeUsage).length}</div>
          </CardContent>
        </Card>
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
                  <TableHead>Mã đơn hàng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Mã KH</TableHead>
                  <TableHead>Loại vải</TableHead>
                  <TableHead>Biến thể</TableHead>
                  <TableHead>Kho</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead>Ngày sử dụng</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsage.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{item.order_number}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.customer_name}</TableCell>
                    <TableCell>{item.customer_code}</TableCell>
                    <TableCell>{item.fabric_variants?.fabric_types?.name}</TableCell>
                    <TableCell>
                      {item.fabric_variants?.variant_name}
                      {item.fabric_variants?.color && (
                        <Badge variant="secondary" className="ml-1">{item.fabric_variants.color}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.warehouses?.warehouse_type === 'main' ? 'default' : 'secondary'}>
                        {item.warehouses?.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatQuantity(item.quantity_used)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(item.usage_date), 'dd/MM/yyyy', { locale: vi })}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{item.notes}</TableCell>
                  </TableRow>
                ))}
                {filteredUsage.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
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
    </div>
  );
};