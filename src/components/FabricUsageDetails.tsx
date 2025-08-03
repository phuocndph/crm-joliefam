import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useFabricUsage, useFabricTypes, useWarehouses } from '@/hooks/useFabrics';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FabricUsageDetailsProps {
  warehouseName: string;
  warehouseFilter: string;
}

export const FabricUsageDetails: React.FC<FabricUsageDetailsProps> = ({ 
  warehouseName, 
  warehouseFilter 
}) => {
  const { data: fabricUsage } = useFabricUsage();
  const { data: fabricTypes } = useFabricTypes();
  const { data: warehouses } = useWarehouses();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFabricType, setSelectedFabricType] = useState('all');
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined
  });

  // Filter and group data by order for better tracking
  const filteredAndGroupedData = useMemo(() => {
    if (!fabricUsage) return [];

    const currentWarehouse = warehouses?.find(w => 
      warehouseFilter === 'hanoi' ? w.name.includes('Hà Nội') :
      warehouseFilter === 'bacninh' ? w.name.includes('Bắc Ninh') : false
    );

    // First filter the data
    const filtered = fabricUsage.filter(usage => {
      // Filter by warehouse
      if (currentWarehouse && usage.warehouse_id !== currentWarehouse.id) {
        return false;
      }

      // Filter by search term
      if (searchTerm && !usage.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !usage.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !usage.fabric_variants?.fabric_types?.name?.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Filter by fabric type
      if (selectedFabricType !== 'all' && 
          usage.fabric_variants?.fabric_type_id !== selectedFabricType) {
        return false;
      }

      // Filter by date range
      if (dateRange.from || dateRange.to) {
        const usageDate = new Date(usage.usage_date);
        if (dateRange.from && usageDate < dateRange.from) return false;
        if (dateRange.to && usageDate > dateRange.to) return false;
      }

      return true;
    });

    // Group by order_number to show multiple fabrics per order
    const grouped = filtered.reduce((acc, usage) => {
      const key = usage.order_number;
      if (!acc[key]) {
        acc[key] = {
          order_number: usage.order_number,
          order_type: usage.order_type,
          customer_name: usage.customer_name,
          customer_code: usage.customer_code,
          usage_date: usage.usage_date,
          notes: usage.notes,
          fabrics: []
        };
      }
      
      acc[key].fabrics.push({
        fabric_type: usage.fabric_variants?.fabric_types?.name,
        variant_name: usage.fabric_variants?.variant_name,
        color: usage.fabric_variants?.color,
        fabric_width: usage.fabric_width,
        quantity_used: usage.quantity_used,
        unit: usage.unit
      });
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped);
  }, [fabricUsage, warehouses, warehouseFilter, searchTerm, selectedFabricType, dateRange]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalRecords = filteredAndGroupedData.length;
    const totalQuantity = filteredAndGroupedData.reduce((sum, order) => 
      sum + order.fabrics.reduce((fabricSum: number, fabric: any) => fabricSum + (fabric.quantity_used || 0), 0), 0);
    const uniqueOrders = filteredAndGroupedData.length;
    
    return { totalRecords, totalQuantity, uniqueOrders };
  }, [filteredAndGroupedData]);

  const formatQuantity = (quantity: number, unit: string = 'kg') => {
    return `${quantity.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${unit}`;
  };

  const formatDate = (date: string | Date) => {
    return format(new Date(date), 'dd/MM/yyyy', { locale: vi });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Chi tiết sử dụng vải theo đơn hàng - {warehouseName}</CardTitle>
            <CardDescription>
              Theo dõi chi tiết việc sử dụng vải cho các đơn hàng tại kho {warehouseName}
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              {summaryStats.totalRecords} bản ghi
            </Badge>
            <Badge variant="outline">
              {summaryStats.uniqueOrders} đơn hàng
            </Badge>
            <Badge variant="outline">
              Tổng: {formatQuantity(summaryStats.totalQuantity)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center">
            <Filter className="mr-2 h-4 w-4" />
            Bộ lọc và tìm kiếm
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm đơn hàng, khách hàng, vải..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedFabricType} onValueChange={setSelectedFabricType}>
              <SelectTrigger>
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
                  "justify-start text-left font-normal",
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
            <Button 
              variant="outline" 
              onClick={() => {
                setSearchTerm('');
                setSelectedFabricType('all');
                setDateRange({ from: undefined, to: undefined });
              }}
            >
              Xóa bộ lọc
            </Button>
          </div>
        </div>

        {/* Usage Details Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày sử dụng</TableHead>
                <TableHead>Số đơn hàng</TableHead>
                <TableHead>Loại đơn hàng</TableHead>
                <TableHead>Khách hàng</TableHead>
                <TableHead>Loại đơn</TableHead>
                <TableHead>Vải sử dụng</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndGroupedData.length > 0 ? (
                filteredAndGroupedData.map((order, index) => (
                  <TableRow key={`${order.order_number}-${index}`}>
                    <TableCell className="font-medium">
                      {formatDate(order.usage_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.order_number}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {order.order_type === 'new' ? 'Đơn hàng mới' :
                         order.order_type === 'replacement' ? 'Đơn đổi trả' :
                         order.order_type === 'repair' ? 'Đơn sửa chữa' : 
                         order.order_type || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.customer_name}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {order.customer_code === 'don_phuoc' ? 'Đơn Phước' :
                         order.customer_code === 'don_hoan' ? 'Đơn Hoan' :
                         order.customer_code || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {order.fabrics.map((fabric: any, fabricIndex: number) => (
                          <div key={fabricIndex} className="text-sm">
                            {fabric.fabric_type} {fabric.color && fabric.color} {fabric.fabric_width && `(${fabric.fabric_width})`} - {formatQuantity(fabric.quantity_used, fabric.unit || 'm')}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate" title={order.notes || ''}>
                        {order.notes || '-'}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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