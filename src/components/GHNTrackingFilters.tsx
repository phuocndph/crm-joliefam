import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Search, 
  Filter, 
  X, 
  ChevronDown, 
  Calendar,
  Download,
  Clock,
  TrendingUp
} from 'lucide-react';
import { DateRange } from 'react-day-picker';

interface FilterState {
  searchText: string;
  status: string;
  createdDateRange?: DateRange;
  expectedDateRange?: DateRange;
  deliveredDateRange?: DateRange;
  codMin: string;
  codMax: string;
  weightMin: string;
  weightMax: string;
}

interface GHNTrackingFiltersProps {
  onFiltersChange: (filters: FilterState) => void;
  filteredCount: number;
  totalCount: number;
  onExport: () => void;
  onQuickFilter: (type: 'today' | 'thisWeek' | 'lateDelivery') => void;
}

const statusOptions = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'delivered', label: 'Đã giao hàng' },
  { value: 'delivering', label: 'Đang giao hàng' },
  { value: 'storing', label: 'Đang lưu kho' },
  { value: 'transporting', label: 'Đang vận chuyển' },
  { value: 'picking', label: 'Đang lấy hàng' },
  { value: 'ready_to_pick', label: 'Sẵn sàng lấy hàng' },
  { value: 'returned', label: 'Đã hoàn hàng' },
  { value: 'returning', label: 'Đang hoàn hàng' },
  { value: 'delivery_fail', label: 'Giao hàng thất bại' },
  { value: 'cancel', label: 'Đã hủy' },
  { value: 'lost', label: 'Thất lạc' },
  { value: 'damage', label: 'Hư hỏng' }
];

export function GHNTrackingFilters({
  onFiltersChange,
  filteredCount,
  totalCount,
  onExport,
  onQuickFilter
}: GHNTrackingFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    status: 'all',
    codMin: '',
    codMax: '',
    weightMin: '',
    weightMax: ''
  });

  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const clearAllFilters = () => {
    const clearedFilters: FilterState = {
      searchText: '',
      status: 'all',
      codMin: '',
      codMax: '',
      weightMin: '',
      weightMax: ''
    };
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.searchText) count++;
    if (filters.status && filters.status !== 'all') count++;
    if (filters.createdDateRange) count++;
    if (filters.expectedDateRange) count++;
    if (filters.deliveredDateRange) count++;
    if (filters.codMin || filters.codMax) count++;
    if (filters.weightMin || filters.weightMax) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <Card className="mb-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                <CardTitle className="text-lg">Bộ lọc</CardTitle>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary">{activeFilterCount}</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  Hiển thị {filteredCount.toLocaleString()} / {totalCount.toLocaleString()} đơn hàng
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuickFilter('today')}
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Hôm nay
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuickFilter('thisWeek')}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Tuần này
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuickFilter('lateDelivery')}
                className="flex items-center gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                Chậm giao
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Xuất Excel
              </Button>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="flex items-center gap-2 text-destructive"
                >
                  <X className="h-4 w-4" />
                  Xóa tất cả
                </Button>
              )}
            </div>

            {/* Main Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Tìm kiếm nhanh</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Mã GHN, mã đơn hàng, tên khách hàng..."
                    value={filters.searchText}
                    onChange={(e) => updateFilters({ searchText: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Trạng thái đơn hàng</label>
                <Select value={filters.status} onValueChange={(value) => updateFilters({ status: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* COD Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">COD thu hộ (₫)</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Từ"
                    type="number"
                    value={filters.codMin}
                    onChange={(e) => updateFilters({ codMin: e.target.value })}
                  />
                  <Input
                    placeholder="Đến"
                    type="number"
                    value={filters.codMax}
                    onChange={(e) => updateFilters({ codMax: e.target.value })}
                  />
                </div>
              </div>

              {/* Weight Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Trọng lượng (kg)</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Từ"
                    type="number"
                    step="0.1"
                    value={filters.weightMin}
                    onChange={(e) => updateFilters({ weightMin: e.target.value })}
                  />
                  <Input
                    placeholder="Đến"
                    type="number"
                    step="0.1"
                    value={filters.weightMax}
                    onChange={(e) => updateFilters({ weightMax: e.target.value })}
                  />
                </div>
              </div>

              {/* Created Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Ngày tạo đơn</label>
                <DatePickerWithRange
                  date={filters.createdDateRange}
                  setDate={(date) => updateFilters({ createdDateRange: date })}
                  className="w-full"
                />
              </div>

              {/* Expected Delivery Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Ngày dự kiến giao</label>
                <DatePickerWithRange
                  date={filters.expectedDateRange}
                  setDate={(date) => updateFilters({ expectedDateRange: date })}
                  className="w-full"
                />
              </div>

              {/* Delivered Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Ngày giao thành công</label>
                <DatePickerWithRange
                  date={filters.deliveredDateRange}
                  setDate={(date) => updateFilters({ deliveredDateRange: date })}
                  className="w-full"
                />
              </div>
            </div>

            {/* Active Filters Summary */}
            {activeFilterCount > 0 && (
              <div className="pt-4 border-t">
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm font-medium">Bộ lọc đang áp dụng:</span>
                  {filters.searchText && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Tìm kiếm: {filters.searchText}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => updateFilters({ searchText: '' })}
                      />
                    </Badge>
                  )}
                  {filters.status && filters.status !== 'all' && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Trạng thái: {statusOptions.find(s => s.value === filters.status)?.label}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => updateFilters({ status: 'all' })}
                      />
                    </Badge>
                  )}
                  {(filters.codMin || filters.codMax) && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      COD: {filters.codMin || '0'} - {filters.codMax || '∞'}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => updateFilters({ codMin: '', codMax: '' })}
                      />
                    </Badge>
                  )}
                  {(filters.weightMin || filters.weightMax) && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Trọng lượng: {filters.weightMin || '0'} - {filters.weightMax || '∞'} kg
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => updateFilters({ weightMin: '', weightMax: '' })}
                      />
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export type { FilterState };