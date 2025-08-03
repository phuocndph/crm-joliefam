import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Filter, Search, FileText, CalendarDays } from 'lucide-react';
import { useFabricUsage, useFabricVariants } from '@/hooks/useFabrics';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';

interface FabricUsageDetailProps {
  warehouseFilter?: string;
}

export const FabricUsageDetail: React.FC<FabricUsageDetailProps> = ({
  warehouseFilter
}) => {
  const { data: fabricUsage = [] } = useFabricUsage();
  const { data: fabricVariants = [] } = useFabricVariants();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFabricType, setSelectedFabricType] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Filter data
  const filteredUsage = useMemo(() => {
    let filtered = fabricUsage;

    // Filter by warehouse
    if (warehouseFilter) {
      filtered = filtered.filter(item => 
        (item.warehouses && typeof item.warehouses === 'object' && 'warehouse_type' in item.warehouses) &&
        (item.warehouses.warehouse_type === warehouseFilter ||
        item.warehouses.name?.toLowerCase().includes(warehouseFilter.toLowerCase()))
      );
    }

    // Filter by search term (order number, customer name, fabric type)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.order_number?.toLowerCase().includes(searchLower) ||
        item.customer_name?.toLowerCase().includes(searchLower) ||
        item.customer_code?.toLowerCase().includes(searchLower) ||
        (item.fabric_variants && typeof item.fabric_variants === 'object' && 'variant_name' in item.fabric_variants &&
          item.fabric_variants.variant_name?.toLowerCase().includes(searchLower)) ||
        (item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_types' in item.fabric_variants &&
          item.fabric_variants.fabric_types && typeof item.fabric_variants.fabric_types === 'object' && 'name' in item.fabric_variants.fabric_types &&
          item.fabric_variants.fabric_types.name?.toLowerCase().includes(searchLower))
      );
    }

    // Filter by fabric type
    if (selectedFabricType !== 'all') {
      filtered = filtered.filter(item => 
        item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_type_id' in item.fabric_variants &&
        item.fabric_variants.fabric_type_id === selectedFabricType
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

    // Sort by usage date (newest first)
    return filtered.sort((a, b) => new Date(b.usage_date).getTime() - new Date(a.usage_date).getTime());
  }, [fabricUsage, warehouseFilter, searchTerm, selectedFabricType, dateRange]);

  // Get unique fabric types for filter
  const uniqueFabricTypes = useMemo(() => {
    const types = new Set();
    fabricVariants.forEach(variant => {
      if (variant.fabric_types?.name) {
        types.add(JSON.stringify({
          id: variant.fabric_type_id,
          name: variant.fabric_types.name
        }));
      }
    });
    return Array.from(types).map(type => JSON.parse(type as string));
  }, [fabricVariants]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalQuantity = filteredUsage.reduce((sum, item) => sum + (item.quantity_used || 0), 0);
    const totalOrders = new Set(filteredUsage.map(item => item.order_number)).size;
    const totalCustomers = new Set(filteredUsage.map(item => item.customer_name)).size;
    
    // Group by fabric type
    const fabricTypeBreakdown = filteredUsage.reduce((acc, item) => {
      const fabricType = (item.fabric_variants && typeof item.fabric_variants === 'object' && 'fabric_types' in item.fabric_variants &&
        item.fabric_variants.fabric_types && typeof item.fabric_variants.fabric_types === 'object' && 'name' in item.fabric_variants.fabric_types)
        ? item.fabric_variants.fabric_types.name : 'Không xác định';
      
      acc[fabricType] = (acc[fabricType] || 0) + (item.quantity_used || 0);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalQuantity,
      totalOrders,
      totalCustomers,
      fabricTypeBreakdown
    };
  }, [filteredUsage]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedFabricType('all');
    setDateRange(undefined);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tổng sử dụng</p>
                <p className="text-xl font-bold">{summary.totalQuantity.toFixed(2)}m</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CalendarDays className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Số đơn hàng</p>
                <p className="text-xl font-bold">{summary.totalOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Search className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Khách hàng</p>
                <p className="text-xl font-bold">{summary.totalCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Bản ghi</p>
                <p className="text-xl font-bold">{filteredUsage.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Bộ lọc và tìm kiếm</CardTitle>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Xóa bộ lọc
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tìm kiếm</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo đơn hàng, khách hàng, loại vải..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Loại vải</label>
              <Select value={selectedFabricType} onValueChange={setSelectedFabricType}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại vải" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả loại vải</SelectItem>
                  {uniqueFabricTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Khoảng thời gian</label>
              <DatePickerWithRange
                date={dateRange}
                onDateChange={setDateRange}
                placeholder="Chọn khoảng thời gian"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Details Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Chi tiết sử dụng vải theo đơn hàng</CardTitle>
            <Badge variant="secondary">
              {filteredUsage.length} bản ghi
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày sử dụng</TableHead>
                  <TableHead>Số đơn hàng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Loại vải</TableHead>
                  <TableHead>Khổ vải</TableHead>
                  <TableHead className="text-right">Số lượng (m)</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsage.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center space-y-2">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">Chưa có dữ liệu sử dụng vải</p>
                        <p className="text-sm text-muted-foreground">
                          Hãy ghi nhận sử dụng vải để xem thông tin tại đây
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsage.map((usage) => (
                    <TableRow key={usage.id}>
                      <TableCell>
                        {format(new Date(usage.usage_date), 'dd/MM/yyyy', { locale: vi })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {usage.order_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{usage.customer_name}</div>
                          {usage.customer_code && (
                            <div className="text-sm text-muted-foreground">{usage.customer_code}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {usage.fabric_variants && typeof usage.fabric_variants === 'object' && 'variant_name' in usage.fabric_variants
                              ? usage.fabric_variants.variant_name : 'N/A'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {usage.fabric_variants && typeof usage.fabric_variants === 'object' && 'fabric_types' in usage.fabric_variants &&
                             usage.fabric_variants.fabric_types && typeof usage.fabric_variants.fabric_types === 'object' && 'name' in usage.fabric_variants.fabric_types
                              ? usage.fabric_variants.fabric_types.name : ''}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {usage.fabric_width || 
                         (usage.fabric_variants && typeof usage.fabric_variants === 'object' && 'width_code' in usage.fabric_variants
                           ? usage.fabric_variants.width_code : 'N/A')}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {usage.quantity_used?.toFixed(2)}m
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={usage.notes || ''}>
                          {usage.notes || '-'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Fabric Type Breakdown */}
          {Object.keys(summary.fabricTypeBreakdown).length > 0 && (
            <div className="mt-6 p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium mb-3">Phân tích theo loại vải</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(summary.fabricTypeBreakdown).map(([type, quantity]) => (
                  <div key={type} className="flex justify-between items-center p-2 bg-background rounded">
                    <span className="text-sm font-medium">{type}:</span>
                    <span className="text-sm font-mono">{quantity.toFixed(2)}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};