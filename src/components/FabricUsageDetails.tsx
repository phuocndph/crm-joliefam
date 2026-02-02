import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, Edit, Trash2, ChevronDown, ChevronUp, FileText, Package, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFabricUsage, useFabricTypes, useWarehouses, useFabricVariants, useUpdateFabricUsage, useDeleteFabricUsage } from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FabricUsageDetailsProps {
  warehouseName: string;
  warehouseFilter: string;
}

interface FabricUsageRecord {
  id: string;
  order_id: string;
  order_number: string;
  fabric_variant_id: string;
  warehouse_id: string;
  quantity_used: number;
  customer_name: string;
  customer_code?: string;
  order_type?: string;
  fabric_width?: string;
  usage_date: string;
  notes?: string;
  unit: string;
  fabric_variants?: {
    id: string;
    variant_name: string;
    color?: string;
    fabric_type_id: string;
    fabric_types?: {
      name: string;
    };
  };
  warehouses?: {
    name: string;
  };
}

export const FabricUsageDetails: React.FC<FabricUsageDetailsProps> = ({ 
  warehouseName, 
  warehouseFilter 
}) => {
  const { data: fabricUsage } = useFabricUsage();
  const { data: fabricTypes } = useFabricTypes();
  const { data: warehouses } = useWarehouses();
  const { data: fabricVariants } = useFabricVariants();
  
  const updateFabricUsage = useUpdateFabricUsage();
  const deleteFabricUsage = useDeleteFabricUsage();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFabricType, setSelectedFabricType] = useState('all');
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined
  });
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Edit states
  const [editingRecord, setEditingRecord] = useState<FabricUsageRecord | null>(null);
  const [editForm, setEditForm] = useState({
    order_number: '',
    customer_name: '',
    customer_code: '',
    order_type: '',
    fabric_variant_id: '',
    quantity_used: 0,
    fabric_width: '',
    usage_date: '',
    notes: ''
  });

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (selectedFabricType !== 'all') count++;
    if (dateRange.from || dateRange.to) count++;
    return count;
  }, [searchTerm, selectedFabricType, dateRange]);

  // Filter the individual fabric usage records
  const filteredData = useMemo(() => {
    if (!fabricUsage) return [];

    const currentWarehouse = warehouses?.find(w => 
      warehouseFilter === 'hanoi' ? w.name.includes('Hà Nội') :
      warehouseFilter === 'bacninh' ? w.name.includes('Bắc Ninh') : false
    );

    return fabricUsage.filter(usage => {
      if (currentWarehouse && usage.warehouse_id !== currentWarehouse.id) {
        return false;
      }

      if (searchTerm && !usage.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !usage.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !usage.fabric_variants?.fabric_types?.name?.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      if (selectedFabricType !== 'all' && 
          usage.fabric_variants?.fabric_type_id !== selectedFabricType) {
        return false;
      }

      if (dateRange.from || dateRange.to) {
        const usageDate = new Date(usage.usage_date);
        if (dateRange.from && usageDate < dateRange.from) return false;
        if (dateRange.to && usageDate > dateRange.to) return false;
      }

      return true;
    });
  }, [fabricUsage, warehouses, warehouseFilter, searchTerm, selectedFabricType, dateRange]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalRecords = filteredData.length;
    const totalQuantity = filteredData.reduce((sum, usage) => sum + (usage.quantity_used || 0), 0);
    const uniqueOrders = new Set(filteredData.map(usage => usage.order_number)).size;
    
    return { totalRecords, totalQuantity, uniqueOrders };
  }, [filteredData]);

  const formatQuantity = (quantity: number, unit: string = 'm') => {
    return `${quantity.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
  };

  const formatDate = (date: string | Date) => {
    return format(new Date(date), 'dd/MM/yyyy', { locale: vi });
  };

  const handleEdit = (record: FabricUsageRecord) => {
    setEditingRecord(record);
    setEditForm({
      order_number: record.order_number || '',
      customer_name: record.customer_name || '',
      customer_code: record.customer_code || '',
      order_type: record.order_type || '',
      fabric_variant_id: record.fabric_variant_id || '',
      quantity_used: record.quantity_used || 0,
      fabric_width: record.fabric_width || '',
      usage_date: record.usage_date?.split('T')[0] || '',
      notes: record.notes || ''
    });
  };

  const handleUpdate = async () => {
    if (!editingRecord) return;

    try {
      await updateFabricUsage.mutateAsync({
        id: editingRecord.id,
        order_number: editForm.order_number,
        customer_name: editForm.customer_name,
        customer_code: editForm.customer_code || undefined,
        order_type: editForm.order_type || undefined,
        fabric_variant_id: editForm.fabric_variant_id,
        quantity_used: editForm.quantity_used,
        fabric_width: editForm.fabric_width || undefined,
        usage_date: editForm.usage_date,
        notes: editForm.notes || undefined
      });

      toast({
        title: "Thành công",
        description: "Đã cập nhật thông tin sử dụng vải",
      });

      setEditingRecord(null);
    } catch (error) {
      console.error('Error updating fabric usage:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi cập nhật thông tin",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFabricUsage.mutateAsync(id);
      
      toast({
        title: "Thành công",
        description: "Đã xóa bản ghi sử dụng vải",
      });
    } catch (error) {
      console.error('Error deleting fabric usage:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi xóa bản ghi",
        variant: "destructive"
      });
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedFabricType('all');
    setDateRange({ from: undefined, to: undefined });
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-base font-semibold">Chi tiết sử dụng vải</CardTitle>
          {/* Inline summary stats */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {summaryStats.totalRecords} bản ghi
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="flex items-center gap-1">
              <ShoppingCart className="h-3.5 w-3.5" />
              {summaryStats.uniqueOrders} đơn
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Package className="h-3.5 w-3.5" />
              Tổng: {formatQuantity(summaryStats.totalQuantity)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4 space-y-3">
        {/* Collapsible Filters */}
        <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-2 h-8">
                <Filter className="h-3.5 w-3.5" />
                <span className="text-sm">Bộ lọc</span>
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
                {isFiltersOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            </CollapsibleTrigger>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                Xóa bộ lọc
              </Button>
            )}
          </div>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm đơn hàng, khách hàng..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={selectedFabricType} onValueChange={setSelectedFabricType}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tất cả loại vải" />
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn(
                    "justify-start text-left font-normal h-9",
                    !dateRange.from && "text-muted-foreground"
                  )}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
                        </>
                      ) : (
                        formatDate(dateRange.from)
                      )
                    ) : (
                      "Chọn khoảng thời gian"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{
                      from: dateRange.from,
                      to: dateRange.to
                    }}
                    onSelect={(range) => setDateRange({
                      from: range?.from,
                      to: range?.to
                    })}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Usage Details Table - Compact with sticky header */}
        <div className="rounded-md border max-h-[400px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="bg-primary/90 hover:bg-primary/90">
                <TableHead className="w-[90px] text-primary-foreground text-xs py-2">Ngày</TableHead>
                <TableHead className="w-[100px] text-primary-foreground text-xs py-2">Đơn hàng</TableHead>
                <TableHead className="w-[130px] text-primary-foreground text-xs py-2">Khách hàng</TableHead>
                <TableHead className="w-[100px] text-primary-foreground text-xs py-2">Loại</TableHead>
                <TableHead className="w-[180px] text-primary-foreground text-xs py-2">Vải</TableHead>
                <TableHead className="w-[70px] text-right text-primary-foreground text-xs py-2">SL</TableHead>
                <TableHead className="w-[80px] text-center text-primary-foreground text-xs py-2">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length > 0 ? (
                filteredData.map((usage) => (
                  <TableRow key={usage.id} className="text-xs">
                    <TableCell className="py-1.5">
                      {formatDate(usage.usage_date)}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-xs font-normal">
                              {usage.order_number}
                            </Badge>
                          </TooltipTrigger>
                          {usage.notes && (
                            <TooltipContent side="right" className="max-w-[300px]">
                              <p className="text-xs">{usage.notes}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="py-1.5 truncate max-w-[130px]">
                      {usage.customer_name || '-'}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-muted-foreground text-xs">
                        {usage.order_type === 'new' ? 'Mới' :
                         usage.order_type === 'replacement' ? 'Đổi trả' :
                         usage.order_type === 'repair' ? 'Sửa chữa' : '-'}
                        {usage.customer_code && (
                          <> · {usage.customer_code === 'don_phuoc' ? 'Phước' : 
                                usage.customer_code === 'don_hoan' ? 'Hoan' : ''}</>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 truncate max-w-[180px]">
                      {usage.fabric_variants?.variant_name}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-medium">
                      <span className="text-destructive">
                        -{formatQuantity(usage.quantity_used, usage.unit)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleEdit(usage as FabricUsageRecord)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Chỉnh sửa thông tin sử dụng vải</DialogTitle>
                              <DialogDescription>
                                Cập nhật thông tin chi tiết về việc sử dụng vải
                              </DialogDescription>
                            </DialogHeader>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Số đơn hàng</Label>
                                <Input
                                  value={editForm.order_number}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, order_number: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Tên khách hàng</Label>
                                <Input
                                  value={editForm.customer_name}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Loại đơn</Label>
                                <Select value={editForm.customer_code} onValueChange={(value) => setEditForm(prev => ({ ...prev, customer_code: value }))}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Chọn loại đơn" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="don_phuoc">Đơn Phước</SelectItem>
                                    <SelectItem value="don_hoan">Đơn Hoan</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Loại đơn hàng</Label>
                                <Select value={editForm.order_type} onValueChange={(value) => setEditForm(prev => ({ ...prev, order_type: value }))}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Chọn loại đơn hàng" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="new">Đơn hàng mới</SelectItem>
                                    <SelectItem value="replacement">Đơn đổi trả</SelectItem>
                                    <SelectItem value="repair">Đơn sửa chữa</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Loại vải</Label>
                                <Select value={editForm.fabric_variant_id} onValueChange={(value) => setEditForm(prev => ({ ...prev, fabric_variant_id: value }))}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Chọn loại vải" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fabricVariants?.map((variant) => (
                                      <SelectItem key={variant.id} value={variant.id}>
                                        {variant.variant_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Số lượng (m)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editForm.quantity_used}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, quantity_used: parseFloat(e.target.value) || 0 }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Ngày sử dụng</Label>
                                <Input
                                  type="date"
                                  value={editForm.usage_date}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, usage_date: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <Label>Ghi chú</Label>
                                <Textarea
                                  value={editForm.notes}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                                  rows={2}
                                />
                              </div>
                            </div>

                            <div className="flex justify-end space-x-2 pt-4">
                              <Button
                                variant="outline"
                                onClick={() => setEditingRecord(null)}
                              >
                                Hủy
                              </Button>
                              <Button
                                onClick={handleUpdate}
                                disabled={updateFabricUsage.isPending}
                              >
                                {updateFabricUsage.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
                              <AlertDialogDescription>
                                Bạn có chắc chắn muốn xóa bản ghi này? Hành động này không thể hoàn tác.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Hủy</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(usage.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Xóa
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    Không có dữ liệu sử dụng vải
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
